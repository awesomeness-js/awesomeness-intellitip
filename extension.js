const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

// utils
const loadTargetModule = require("./utils/loadTargetModule");
const customStringify = require("./utils/customStringify");
const parseTriggerFromLine = require("./utils/parseTriggerFromLine");
const buildHoverContent = require("./utils/buildHoverContent");
const { initLogger, log } = require("./utils/log");
const replaceSchemasWithLinks = require("./utils/replaceSchemasWithLinks");
const getSiteFromPath = require('./utils/getSiteFromPath');
const { fileURLToPath } = require('url');

// Output Channel
const outputChannel = vscode.window.createOutputChannel("Awesomeness Intellitip");

// Cache + Watchers
let schemaCache = {};
let fileWatchers = {};

function expandBasePathCandidates({ configuredBase, config }) {
    const list = Array.isArray(configuredBase) ? configuredBase : [configuredBase];
    const roots = Array.isArray(config?.resolvedAwesomenessRoots)
        ? config.resolvedAwesomenessRoots
        : [];
    const localFirst = (config?.resolutionOrder || 'local-first') !== 'package-first';

    const seen = new Set();
    const out = [];
    const pushUnique = (candidate) => {
        if (!candidate) return;
        const key = String(candidate);
        if (seen.has(key)) return;
        seen.add(key);
        out.push(candidate);
    };

    for (const entry of list) {
        if (typeof entry !== 'string' || path.isAbsolute(entry)) {
            pushUnique(entry);
            continue;
        }

        if (localFirst) {
            pushUnique(entry);
            for (const awRoot of roots) pushUnique(path.join(awRoot, entry));
        } else {
            for (const awRoot of roots) pushUnique(path.join(awRoot, entry));
            pushUnique(entry);
        }
    }

    return out;
}


// Store config and error state globally
let globalProjectConfig = null;
let globalConfigError = null;

async function tryLoadProjectConfigOnce(outputChannel) {
    const loadProjectConfig = require('./utils/loadProjectConfig');
    try {
        globalProjectConfig = await loadProjectConfig({ outputChannel });
        globalConfigError = null;
    } catch (err) {
        globalProjectConfig = null;
        globalConfigError = err;
    }
}

function prettyConfigErrorMessage(err) {
    let msg = '❌ **Awesomeness Intellitip failed to load your project config!**\n\n';
    msg += '---\n';
    msg += `**Error:** ${err && err.message ? err.message : String(err)}\n`;
    if (err && err.configPath) {
        msg += `**Config Path:** ${err.configPath}\n`;
    }
    if (err && err.stack) {
        msg += '\n<details><summary>Stack Trace</summary>\n\n';
        msg += '```\n' + err.stack + '\n```\n';
        msg += '</details>\n';
    }
    msg += '\n---\n';
    msg += '💡 **Tip:** If your main config imports native/server modules, create a minimal `.awesomeness/intellitip.js` file for extension use only.\n';
    msg += 'See the docs or ask for a sample config.';
    return msg;
}

async function activate(context) {
    // ensure output panel is visible so debug logs are seen while developing
    try { outputChannel.show(true); } catch (e) { /* ignore in prod */ }

    // log config
    const vsConfig = vscode.workspace.getConfiguration("awesomeness");
    initLogger(vsConfig);
    outputChannel.appendLine(`VS Config: debug=${vsConfig.get('debug')}, configFile=${vsConfig.get('configFile')}`);

    // Load project config ONCE at activation
    await tryLoadProjectConfigOnce(outputChannel);

    if (globalConfigError) {
        outputChannel.appendLine('');
        outputChannel.appendLine('───────────────────────────────────────────────');
        outputChannel.appendLine(prettyConfigErrorMessage(globalConfigError));
        outputChannel.appendLine('───────────────────────────────────────────────');
        outputChannel.appendLine('');
    }

    outputChannel.appendLine("✅ Awesomeness Intellitip Activated! ... ");

    context.subscriptions.push({
        dispose() {
            Object.values(fileWatchers).forEach(watcher => watcher.close());
            fileWatchers = {};
        }
    });

    const hoverProvider = vscode.languages.registerHoverProvider("javascript", {
        async provideHover(document, position) {
            // Use the config loaded at activation
            let config = globalProjectConfig;
            if (!config) {
                // If config failed, do not repeat error, just return nothing
                return;
            }

            try {
                // re-init logger with merged config (project config may override debug)
                initLogger(config);

                const line = document.lineAt(position.line).text;

                const {
                    targetName,
                    postfixCommand,
                    triggerKey,
                    triggerType,
                    customTypeKey
                } = parseTriggerFromLine({ 
                    line,
                    position, 
                    outputChannel,
                    config
                });

                if (!targetName || !triggerKey || !triggerType) return;

                let basePath = null;
                let contentFunctionLocation = null;

                const site = getSiteFromPath({
                    filePath: document.uri.fsPath, 
                    outputChannel,
                    config                
                });

                if(site){
                    log(outputChannel, `✅ ${site}`);
                } else {
                    log(outputChannel, `❌ No "site" detected`);
                }

                const configuredBase = config[triggerType]?.[triggerKey];

                if (typeof configuredBase === 'function') {
                    try {
                        const locs = configuredBase({ site });
                        const locPaths = (Array.isArray(locs) ? locs : [locs]).map(l => {
                            if (!l) return null;
                            if (l instanceof URL) return fileURLToPath(l);
                            try {
                                if (String(l).startsWith('file:')) return fileURLToPath(new URL(String(l)));
                            } catch (e) {}
                            return path.resolve(vscode.workspace.workspaceFolders[0].uri.fsPath, String(l));
                        }).filter(Boolean);
                        basePath = locPaths;
                    } catch (e) {
                        log(outputChannel, `❌ Error computing componentLocations: ${e.message}`);
                        basePath = configuredBase;
                    }
                } else {
                    basePath = configuredBase;
                }

                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders?.length) return;

                basePath = expandBasePathCandidates({ configuredBase: basePath, config });

                if (!basePath) return;

                // 🔽 Load the target module (tipMap or schema)
                const data = await loadTargetModule({
                    targetName,
                    triggerKey,
                    basePath,
                    triggerType,
                    fileWatchers,
                    outputChannel,
                    customTypeKey 
                });

                if (!data) {
                    log(outputChannel, `❌ No data found for ${triggerType} "${triggerKey}" with target "${targetName}"`);
                    return;
                }

                const resolvedBasePath = data?.basePath || basePath;

                let hoverContent = await buildHoverContent({
                    targetName,
                    triggerKey,
                    basePath: resolvedBasePath,
                    data,
                    triggerType,
                    outputChannel,
                    postfixCommand,
                    contentFunctionLocation
                });

                hoverContent = replaceSchemasWithLinks({
                    hoverContent,
                    config,
                    log,
                    outputChannel
                });

                return new vscode.Hover(new vscode.MarkdownString(hoverContent, true));

            } catch (err) {
                log(outputChannel, `❌ Error: ${err.message}`);
            }
        }
    });

    context.subscriptions.push(hoverProvider);
}

function deactivate() {
    outputChannel.appendLine("🛑 Awesomeness Intellitip Deactivated!");
}

module.exports = { activate, deactivate };
