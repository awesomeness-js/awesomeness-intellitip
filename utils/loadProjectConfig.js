const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { log } = require('./log');
const { pathToFileURL } = require('url');

// Cache loaded project configs by absolute config path
let projectConfigCache = {};
let projectConfigWatchers = {};
let packageSignalWatchers = {};

function readJsonSafe(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        return null;
    }
}

function getDependencyNames(root) {
    const pkg = readJsonSafe(path.join(root, 'package.json')) || {};
    const depBuckets = [
        pkg.dependencies || {},
        pkg.devDependencies || {},
        pkg.optionalDependencies || {},
        pkg.peerDependencies || {}
    ];

    const names = new Set();
    for (const bucket of depBuckets) {
        for (const depName of Object.keys(bucket)) names.add(depName);
    }

    return [...names];
}

function resolveAwesomenessRoots({ root, discoveryMode, enableNodeModulesAwesomeness }) {
    const roots = [];

    const localAwesomenessRoot = path.join(root, '.awesomeness');
    if (fs.existsSync(localAwesomenessRoot) && fs.statSync(localAwesomenessRoot).isDirectory()) {
        roots.push(localAwesomenessRoot);
    }

    if (!enableNodeModulesAwesomeness || discoveryMode === 'off') {
        return roots;
    }

    const seen = new Set(roots);
    const addIfAwesomenessDir = (candidate) => {
        if (!candidate || seen.has(candidate)) return;
        try {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
                roots.push(candidate);
                seen.add(candidate);
            }
        } catch (e) {
            // ignore
        }
    };

    if (discoveryMode === 'deep-scan') {
        const nodeModulesRoot = path.join(root, 'node_modules');
        const scan = (dir, depth) => {
            if (depth > 5) return;
            let entries = [];
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            } catch (e) {
                return;
            }

            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                if (entry.name === '.bin') continue;

                const full = path.join(dir, entry.name);
                if (entry.name === '.awesomeness') {
                    addIfAwesomenessDir(full);
                    continue;
                }

                if (entry.name.startsWith('@') || entry.name === 'node_modules' || dir.endsWith('node_modules')) {
                    scan(full, depth + 1);
                }
            }
        };

        scan(nodeModulesRoot, 0);
        return roots;
    }

    const depNames = getDependencyNames(root);
    for (const depName of depNames) {
        const candidate = path.join(root, 'node_modules', ...depName.split('/'), '.awesomeness');
        addIfAwesomenessDir(candidate);
    }

    return roots;
}

function clearPackageSignalWatchers(cacheKey) {
    const list = packageSignalWatchers[cacheKey] || [];
    for (const watcher of list) {
        try { watcher.close(); } catch (e) {}
    }
    delete packageSignalWatchers[cacheKey];
}

function watchPackageSignals({ root, cacheKey, outputChannel }) {
    clearPackageSignalWatchers(cacheKey);

    const candidates = [
        path.join(root, 'package.json'),
        path.join(root, 'package-lock.json'),
        path.join(root, 'yarn.lock'),
        path.join(root, 'pnpm-lock.yaml')
    ];

    const watchers = [];
    for (const filePath of candidates) {
        if (!fs.existsSync(filePath)) continue;
        try {
            const watcher = fs.watch(filePath, (eventType) => {
                log(outputChannel, `🔁 Package signal changed (${eventType}): ${filePath} — clearing project config cache`);
                if (projectConfigCache[cacheKey]) delete projectConfigCache[cacheKey];
                clearPackageSignalWatchers(cacheKey);
            });
            watchers.push(watcher);
        } catch (e) {
            log(outputChannel, `❌ Failed to watch package signal ${filePath}: ${e.message}`);
        }
    }

    packageSignalWatchers[cacheKey] = watchers;
}

async function loadProjectConfig({ outputChannel } = {}) {
    
    const vsConfig = vscode.workspace.getConfiguration('awesomeness') || {};

    // start with a copy of relevant workspace settings using the VS Code API getters
    const workspaceCfg = {};
    try {
        workspaceCfg.debug = !!vsConfig.get('debug');
        workspaceCfg.schemas = vsConfig.get('schemas') || {};
        workspaceCfg.tipMap = vsConfig.get('tipMap') || {};
        workspaceCfg.configFile = vsConfig.get('configFile') || '.awesomeness/config.js';
        workspaceCfg.enableNodeModulesAwesomeness = vsConfig.get('enableNodeModulesAwesomeness');
        if (typeof workspaceCfg.enableNodeModulesAwesomeness !== 'boolean') {
            workspaceCfg.enableNodeModulesAwesomeness = true;
        }
        workspaceCfg.nodeModulesDiscovery = vsConfig.get('nodeModulesDiscovery') || 'dependencies-only';
        workspaceCfg.resolutionOrder = vsConfig.get('resolutionOrder') || 'local-first';
    } catch (e) {
        // last-resort fallback
        workspaceCfg.schemas = (vsConfig && vsConfig.schemas) || {};
        workspaceCfg.tipMap = (vsConfig && vsConfig.tipMap) || {};
        workspaceCfg.debug = !!(vsConfig && vsConfig.debug);
        workspaceCfg.configFile = '.awesomeness/config.js';
        workspaceCfg.enableNodeModulesAwesomeness = true;
        workspaceCfg.nodeModulesDiscovery = 'dependencies-only';
        workspaceCfg.resolutionOrder = 'local-first';
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
        workspaceCfg.resolvedAwesomenessRoots = resolveAwesomenessRoots({
            root,
            discoveryMode: workspaceCfg.nodeModulesDiscovery,
            enableNodeModulesAwesomeness: workspaceCfg.enableNodeModulesAwesomeness
        });
        log(outputChannel, `🔍 Resolved awesomeness roots: ${workspaceCfg.resolvedAwesomenessRoots.length}`);
        watchPackageSignals({ root, cacheKey: configPath, outputChannel });
        return workspaceCfg;
        
    }

    //log(outputChannel, `🔍 FOUND project config file at ${configPath}`);

    // compute configDir and base url early - used during import diagnostics and post-processing
    const configDir = path.dirname(configPath);
    const configBaseUrl = pathToFileURL(configDir + path.sep).href;

    // Try to load the main config, and if it fails, try the fallback intellitip config
    let lastError = null;
    for (const candidate of [configPath, path.join(root, '.awesomeness/intellitip.js')]) {
        if (!fs.existsSync(candidate)) continue;
        try {
            // Use pathToFileURL so import.meta.url inside the config module
            // correctly reflects the config file location
            const fileUrl = `${pathToFileURL(candidate).href}?t=${Date.now()}`;
            let mod;
            // Try require first (fast for CJS). If it fails because the file is ESM,
            // fall back to dynamic import which supports ESM (including top-level await).
            try {
                const origCwd = process.cwd();
                try {
                    process.chdir(root);
                    delete require.cache[require.resolve(candidate)];
                    mod = require(candidate);
                } finally {
                    try { process.chdir(origCwd); } catch (e) {}
                }
            } catch (requireErr) {
                const isEsm = requireErr && (requireErr.code === 'ERR_REQUIRE_ESM' || /cannot be used on an ESM graph/i.test(requireErr.message));
                if (isEsm) {
                    try {
                        const origCwd2 = process.cwd();
                        const Module = require('module');
                        const origModuleLoad = Module._load;
                        Module._load = function(request, parent, isMain) {
                            try {
                                return origModuleLoad.apply(this, arguments);
                            } catch (e) {
                                const isNativeFailure =
                                    /Could not load/i.test(e.message) ||
                                    /was compiled against a different/i.test(e.message) ||
                                    /NODE_MODULE_VERSION/i.test(e.message);
                                if (isNativeFailure) {
                                    outputChannel?.appendLine(`⚠️  Native module shimmed (cannot load in extension host): ${request}`);
                                    return new Proxy({}, {
                                        get: (_, k) => k === '__esModule' ? false : () => {},
                                        construct: () => new Proxy({}, { get: () => () => {} })
                                    });
                                }
                                throw e;
                            }
                        };
                        try {
                            process.chdir(root);
                            mod = await import(fileUrl);
                        } finally {
                            try { process.chdir(origCwd2); } catch (e) {}
                            Module._load = origModuleLoad;
                        }
                    } catch (importErr) {
                        outputChannel?.appendLine(`❌ import() failed for project config: ${importErr.message}`);
                        outputChannel?.appendLine(`   code: ${importErr.code || 'N/A'}`);
                        outputChannel?.appendLine(`   configPath: ${candidate}`);
                        if (importErr.stack) outputChannel?.appendLine(`   stack: ${importErr.stack}`);
                        throw importErr;
                    }
                } else {
                    outputChannel?.appendLine(`❌ require() failed for project config: ${requireErr.message}`);
                    throw requireErr;
                }
            }
            const fileCfg = mod?.default || mod || {};
            const isUnderRoot = (u) => {
                try {
                    const p = u instanceof URL ? u : new URL(String(u));
                    return p.href.startsWith(pathToFileURL(root).href);
                } catch (e) { return false; }
            };
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
                            fileCfg[k] = new URL(href.startsWith('.') ? href : `.${path.sep}${href}`, configBaseUrl);
                            log(outputChannel, `🔧 Rewrote config.${k} to ${fileCfg[k].href}`);
                        }
                    } catch (e) {
                        // ignore
                    }
                }
            }
            const merged = Object.assign({}, workspaceCfg);
            for (const [k, v] of Object.entries(fileCfg)) {
                if (k === 'schemas' || k === 'tipMap') {
                    merged[k] = Object.assign({}, workspaceCfg[k] || {}, v || {});
                } else {
                    merged[k] = v;
                }
            }
            merged.resolvedAwesomenessRoots = resolveAwesomenessRoots({
                root,
                discoveryMode: merged.nodeModulesDiscovery || 'dependencies-only',
                enableNodeModulesAwesomeness: typeof merged.enableNodeModulesAwesomeness === 'boolean'
                    ? merged.enableNodeModulesAwesomeness
                    : true
            });
            log(outputChannel, `🔍 Resolved awesomeness roots: ${merged.resolvedAwesomenessRoots.length}`);
            log(outputChannel, `✅ Project config loaded and merged from ${candidate}`);
            projectConfigCache[candidate] = merged;
            if (!projectConfigWatchers[candidate]) {
                try {
                    const watcher = fs.watch(candidate, (eventType) => {
                        log(outputChannel, `🔁 Project config changed (${eventType}): ${candidate} — clearing cache`);
                        if (projectConfigCache[candidate]) delete projectConfigCache[candidate];
                        clearPackageSignalWatchers(candidate);
                        try { watcher.close(); } catch (e) {}
                        delete projectConfigWatchers[candidate];
                    });
                    projectConfigWatchers[candidate] = watcher;
                } catch (e) {
                    log(outputChannel, `❌ Failed to watch config file ${candidate}: ${e.message}`);
                }
            }
            watchPackageSignals({ root, cacheKey: candidate, outputChannel });
            return merged;
        } catch (err) {
            lastError = err;
            outputChannel?.appendLine(`❌ Error loading project config candidate ${candidate}: ${err.message}`);
        }
    }
    // If all candidates fail, return workspace config
    outputChannel?.appendLine(`❌ All config candidates failed, using workspace config only.`);
    return workspaceCfg;
}

module.exports = loadProjectConfig;
