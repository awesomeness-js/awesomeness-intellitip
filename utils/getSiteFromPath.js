const path = require('path');
const vscode = require('vscode');
const { log } = require('./log');

function getSiteFromPath(filePath, outputChannel = null) {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders?.length) return null;

        const root = workspaceFolders[0].uri.fsPath;
        const rel = path.relative(root, filePath || '');
        const parts = rel.split(path.sep).filter(Boolean);

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
