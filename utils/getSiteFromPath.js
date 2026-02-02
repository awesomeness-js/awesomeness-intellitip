const path = require('path');
const vscode = require('vscode');
const { log } = require('./log');
const { fileURLToPath } = require('url');
// Cache for site directories
let cachedSites = null;
let watcher = null;

function initSiteWatcher(siteDirPath, outputChannel = null) {
    if (watcher) {
        watcher.dispose();
        watcher = null;
    }
    const vscodeGlob = new vscode.RelativePattern(siteDirPath, '*');
    watcher = vscode.workspace.createFileSystemWatcher(vscodeGlob);
    const updateCache = async () => {
        try {
            const siteDirUri = vscode.Uri.file(siteDirPath);
            const entries = await vscode.workspace.fs.readDirectory(siteDirUri);
            cachedSites = entries
                .filter(([name, type]) => type === vscode.FileType.Directory)
                .map(([name]) => name);
            //log(outputChannel, `🔄 Site cache updated: ${cachedSites.join(', ')}`);
        } catch (err) {
            cachedSites = null;
            log(outputChannel, `❌ Error updating site cache: ${err.message}`);
        }
    };
    watcher.onDidCreate(updateCache);
    watcher.onDidDelete(updateCache);
    watcher.onDidChange(updateCache);
    updateCache();
}

function getSiteFromPath({
    filePath, 
    outputChannel = null,
    config = {}
}) {

    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders?.length) return null;

        const root = workspaceFolders[0].uri.fsPath;
        const rel = path.relative(root, filePath || '');
        const parts = rel.split(path.sep).filter(Boolean);

       log(outputChannel, JSON.stringify({filePath, root, rel, parts}));

        // Prefer config.siteDir__URL if provided
        if (config.siteDir__URL) {
            // Convert siteDir__URL to a file system path if needed
            let siteDirPath = config.siteDir__URL;
            if (typeof siteDirPath !== 'string' || siteDirPath.startsWith('file:')) {
                try {
                    siteDirPath = fileURLToPath(siteDirPath);
                } catch (e) {
                    log(outputChannel, `❌ Could not convert siteDir__URL to path: ${e.message}`);
                    siteDirPath = null;
                }
            }
            if (siteDirPath) {
                // Initialize watcher and cache if not already done or if path changed
                if (!cachedSites || (watcher && watcher._glob && watcher._glob.base !== siteDirPath)) {
                    initSiteWatcher(siteDirPath, outputChannel);
                }
                // Try to match site from cache
                const siteDirRel = path.relative(root, siteDirPath);
                const siteDirParts = siteDirRel.split(path.sep).filter(Boolean);
                const siteDirIndex = parts.findIndex((part, idx) => {
                    return siteDirParts.length && siteDirParts.every((sdPart, sdIdx) => parts[idx + sdIdx] === sdPart);
                });
                if (siteDirIndex >= 0 && parts.length > siteDirIndex + siteDirParts.length) {
                    const site = parts[siteDirIndex + siteDirParts.length];
                    if (cachedSites && cachedSites.includes(site)) {
                        //log(outputChannel, `🔍 Detected site="${site}" from path ${filePath} using siteDir__URL and cache`);
                        return site;
                    }
                }
            }
        }

        // Fallback to 'sites' string check
        const sitesIndex = parts.indexOf('sites');
        if (sitesIndex >= 0 && parts.length > sitesIndex + 1) {
            const site = parts[sitesIndex + 1];
            //log(outputChannel, `🔍 Detected site="${site}" from path ${filePath}`);
            return site;
        }

        //log(outputChannel, `🔍 No site detected in path ${filePath}`);
        return null;

    } catch (err) {
        log(outputChannel, `❌ Error detecting site from path: ${err.message}`);
        return null;
    }
}

module.exports = getSiteFromPath;
