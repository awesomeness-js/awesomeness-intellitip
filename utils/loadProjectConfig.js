const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { log } = require('./log');
const { pathToFileURL } = require('url');

// Cache loaded project configs by absolute config path
let projectConfigCache = {};
let projectConfigWatchers = {};

async function loadProjectConfig({ outputChannel } = {}) {
    
    const vsConfig = vscode.workspace.getConfiguration('awesomeness') || {};

    // start with a copy of relevant workspace settings using the VS Code API getters
    const workspaceCfg = {};
    try {
        workspaceCfg.debug = !!vsConfig.get('debug');
        workspaceCfg.schemas = vsConfig.get('schemas') || {};
        workspaceCfg.components = vsConfig.get('components') || {};
        workspaceCfg.configFile = vsConfig.get('configFile') || '.awesomeness/config.js';
    } catch (e) {
        // last-resort fallback
        workspaceCfg.schemas = (vsConfig && vsConfig.schemas) || {};
        workspaceCfg.components = (vsConfig && vsConfig.components) || {};
        workspaceCfg.debug = !!(vsConfig && vsConfig.debug);
        workspaceCfg.configFile = '.awesomeness/config.js';
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    
    if (!workspaceFolders?.length) {
        log(outputChannel, '🔍 No workspace folders found for project config');
        return workspaceCfg;
    }

    const root = workspaceFolders[0].uri.fsPath;
    const configFileSetting = workspaceCfg.configFile || '.awesomeness/config.js';
    const configPath = path.join(root, configFileSetting);

    // return cached config if available
    if (projectConfigCache[configPath]) {
        //log(outputChannel, `🔁 Using cached project config for ${configPath}`);
        return projectConfigCache[configPath];
    }

    if (!fs.existsSync(configPath)) {

        //log(outputChannel, `🔍 No project config file at ${configPath}`);
        return workspaceCfg;
        
    }

    //log(outputChannel, `🔍 FOUND project config file at ${configPath}`);

    // compute configDir and base url early - used during import diagnostics and post-processing
    const configDir = path.dirname(configPath);
    const configBaseUrl = pathToFileURL(configDir + path.sep).href;

    try {

        // Use pathToFileURL so import.meta.url inside the config module
        // correctly reflects the config file location
        const fileUrl = `${pathToFileURL(configPath).href}?t=${Date.now()}`;

        // log(outputChannel, `🔍 Loading project config from ${configPath}`);

        let mod;

        // Try require first (fast for CJS). If it fails because the file is ESM,
        // fall back to dynamic import which supports ESM (including top-level await).
        try {
            // Some config modules assume process.cwd() is the project root.
            // Temporarily change cwd to the workspace root so relative FS calls inside
            // the config resolve correctly during require/import.
            const origCwd = process.cwd();
            try {
                process.chdir(root);
                delete require.cache[require.resolve(configPath)];
                mod = require(configPath);
                //log(outputChannel, `🔍 Required project config as CJS: ${configPath} (cwd=${process.cwd()})`);
            } finally {
                try { process.chdir(origCwd); } catch (e) {}
            }
        } catch (requireErr) {
            // If module is ESM, Node will throw ERR_REQUIRE_ESM or a message indicating ESM/TLA
            const isEsm = requireErr && (requireErr.code === 'ERR_REQUIRE_ESM' || /cannot be used on an ESM graph/i.test(requireErr.message));
            if (isEsm) {
                //log(outputChannel, `🔍 Falling back to dynamic import for ESM config: ${configPath}`);
                try {
                    //log(outputChannel, `🔍 Attempting dynamic import with fileUrl=${fileUrl}`);
                    //log(outputChannel, `🔍 root=${root}, configDir=${configDir}, configBaseUrl=${configBaseUrl}`);
                    try {
                        const dirList = fs.readdirSync(configDir);
                        //log(outputChannel, `🔍 configDir contents: ${dirList.join(', ')}`);
                    } catch (e) {
                        //log(outputChannel, `🔍 could not list configDir: ${e.message}`);
                    }

                    // For ESM import, also ensure process.cwd is workspace root while importing
                    const origCwd2 = process.cwd();
                    try {
                        process.chdir(root);
                        mod = await import(fileUrl);
                        //log(outputChannel, `🔍 Imported project config as ESM: ${configPath} (cwd=${process.cwd()})`);
                    } finally {
                        try { process.chdir(origCwd2); } catch (e) {}
                    }
                } catch (importErr) {
                    // Add detailed diagnostics to help track down resolution issues
                    try {
                        //log(outputChannel, `❌ import() failed for project config: ${importErr.message}`);
                        //log(outputChannel, `   code: ${importErr.code || 'N/A'}`);
                        if (importErr.stack) log(outputChannel, `   stack: ${importErr.stack}`);
                        //log(outputChannel, `   process.cwd: ${process.cwd()}`);
                        //log(outputChannel, `   fileUrl used for import: ${fileUrl}`);
                        //log(outputChannel, `   configPath: ${configPath}`);
                        //log(outputChannel, `   configDir: ${configDir}`);
                        //log(outputChannel, `   pathToFileURL(root).href: ${pathToFileURL(root).href}`);

                        // Check some filesystem expectations
                        //log(outputChannel, `   exists configPath: ${fs.existsSync(configPath)}`);
                        try { 
                            log(outputChannel, `   stat configPath: ${JSON.stringify(fs.statSync(configPath))}`); 
                        } catch (e) {
                            
                        }
                        const sitesCandidate = path.join(configDir, '..', 'sites');
                        //log(outputChannel, `   expected sites candidate: ${sitesCandidate}, exists: ${fs.existsSync(sitesCandidate)}`);
                        const vsCodeSites = path.join(process.execPath, '..', 'sites');
                        //log(outputChannel, `   execPath: ${process.execPath}, vsCodeSites candidate: ${vsCodeSites}, exists: ${fs.existsSync(vsCodeSites)}`);
                    } catch (diagErr) {
                        log(outputChannel, `❌ Error while diagnosing import failure: ${diagErr.message}`);
                    }

                    throw importErr;
                }
            } else {
                // Some other require error - rethrow after logging
                log(outputChannel, `❌ require() failed for project config: ${requireErr.message}`);
                throw requireErr;
            }
        }

        const fileCfg = mod?.default || mod || {};

        // Helper to check if a URL points under workspace root
        const isUnderRoot = (u) => {
            try {
                const p = u instanceof URL ? u : new URL(String(u));
                return p.href.startsWith(pathToFileURL(root).href);
            } catch (e) { return false; }
        };

        // Normalize known URL keys to be relative to the config file when they look wrong
        const urlKeys = [
            'siteDir__URL', 
            'commonPublicDir__URL', 
            'commonApiDir__URL', 
        ];
        for (const k of urlKeys) {
            if (fileCfg[k]) {
                try {
                    const val = fileCfg[k];
                    const href = val instanceof URL ? val.href : String(val);
                    if (!isUnderRoot(href)) {
                        // recompute relative to config file
                        fileCfg[k] = new URL(href.startsWith('.') ? href : `.${path.sep}${href}`, configBaseUrl);
                        log(outputChannel, `🔧 Rewrote config.${k} to ${fileCfg[k].href}`);
                    }
                } catch (e) {
                    // ignore
                }
            }
        }

        // Handle componentLocations: if function returns paths outside workspace (due to wrong import.meta.url),
        // replace with a safe fallback that resolves relative to the config file.
        if (typeof fileCfg.componentLocations === 'function') {
            try {
                const testResult = fileCfg.componentLocations({ site: 'test-site' });
                const ok = Array.isArray(testResult) && testResult.some(r => isUnderRoot(r));
                if (!ok) throw new Error('componentLocations appears to return non-root URLs');

                // wrap user-provided componentLocations to normalize and validate returned URLs
                const origComponentLocations = fileCfg.componentLocations;
                fileCfg.componentLocations = (awesomenessRequest) => {
                    try {
                        const res = origComponentLocations(awesomenessRequest);
                        const arr = Array.isArray(res) ? res : [res];
                        const normalized = arr.map(item => {
                            if (!item) return null;
                            if (item instanceof URL) return item;
                            const s = String(item);
                            try {
                                // allow absolute URLs (including file:)
                                return new URL(s);
                            } catch (e) {
                                // treat as path relative to the config directory
                                try {
                                    return new URL(pathToFileURL(path.resolve(configDir, s)).href);
                                } catch (e2) {
                                    return null;
                                }
                            }
                        }).filter(Boolean).filter(u => isUnderRoot(u));

                        log(outputChannel, `🔍 Normalized componentLocations -> ${normalized.map(u => u.href).join(', ')}`);
                        return normalized;
                    } catch (err) {
                        log(outputChannel, `❌ componentLocations wrapper error: ${err.message}`);
                        throw err;
                    }
                };
                log(outputChannel, `🔍 Using user-provided componentLocations`);
            } catch (e) {
                log(outputChannel, `🔧 Overriding componentLocations with workspace-relative fallback`);
                fileCfg.componentLocations = (awesomenessRequest) => {
                    const siteSpecific = new URL(`../sites/${awesomenessRequest.site}/`, configBaseUrl);
                    return [
                        new URL('./components/', siteSpecific),
                        new URL('../awesomeness-ui/components/', configBaseUrl)
                    ];
                };
            }
        }

        // merge: shallow merge for top-level keys, with object merging for schemas/components
        const merged = Object.assign({}, workspaceCfg);

        for (const [k, v] of Object.entries(fileCfg)) {
           
            if (k === 'schemas' || k === 'components') {
           
                merged[k] = Object.assign({}, workspaceCfg[k] || {}, v || {});
           
            } else {
          
                merged[k] = v;
          
            }

        }

        log(outputChannel, `✅ Project config loaded and merged from ${configPath}`);

        // cache and watch the config file for changes to invalidate cache
        projectConfigCache[configPath] = merged;
        if (!projectConfigWatchers[configPath]) {
            try {
                const watcher = fs.watch(configPath, (eventType) => {
                    log(outputChannel, `🔁 Project config changed (${eventType}): ${configPath} — clearing cache`);
                    if (projectConfigCache[configPath]) delete projectConfigCache[configPath];
                    try { watcher.close(); } catch (e) {}
                    delete projectConfigWatchers[configPath];
                });
                projectConfigWatchers[configPath] = watcher;
            } catch (e) {
                log(outputChannel, `❌ Failed to watch config file ${configPath}: ${e.message}`);
            }
        }

        return merged;

    } catch (err) {

        log(outputChannel, `❌ Error loading project config: ${err.message}`);
       
        return workspaceCfg;
    
    }
}

module.exports = loadProjectConfig;
