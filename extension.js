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

function activate(context) {
    outputChannel.appendLine("✅ Awesomeness Intellitip Activated!");
    // ensure output panel is visible so debug logs are seen while developing
    try { outputChannel.show(true); } catch (e) { /* ignore in prod */ }

    context.subscriptions.push({
        dispose() {
            Object.values(fileWatchers).forEach(watcher => watcher.close());
            fileWatchers = {};
        }
    });

    const hoverProvider = vscode.languages.registerHoverProvider("javascript", {

        async provideHover(document, position) {

            try {
                
                const vsConfig = vscode.workspace.getConfiguration("awesomeness");

                // initialize logger from workspace settings early so loader logs show up
                initLogger(vsConfig);

                // load merged config: workspace settings overridden by optional project config file
                const loadProjectConfig = require('./utils/loadProjectConfig');
                const config = await loadProjectConfig({ outputChannel });

                // re-init logger with merged config (project config may override debug)
                initLogger(config);

               // log(outputChannel, `Config: ${Object.keys(config).join(', ')}`);

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

                                // allow string file: URLs
                                if (String(l).startsWith('file:')) return fileURLToPath(new URL(String(l)));
                            
                            } catch (e) {}

                            // treat as path relative to workspace root
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
