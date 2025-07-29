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

// Output Channel
const outputChannel = vscode.window.createOutputChannel("Awesomeness Intellitip");

// Cache + Watchers
let schemaCache = {};
let fileWatchers = {};

function activate(context) {
    outputChannel.appendLine("✅ Awesomeness Intellitip Activated!");

    context.subscriptions.push({
        dispose() {
            Object.values(fileWatchers).forEach(watcher => watcher.close());
            fileWatchers = {};
        }
    });

    const hoverProvider = vscode.languages.registerHoverProvider("javascript", {

        async provideHover(document, position) {

            try {
                
                const config = vscode.workspace.getConfiguration("awesomeness");
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
                    outputChannel 
                });

                if (!targetName || !triggerKey || !triggerType) return;

                let basePath = null;
                let contentFunctionLocation = null;

                basePath = config[triggerType]?.[triggerKey];
                if (!basePath) return;
            

                // 🔽 Load the target module (component or schema)
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

                let hoverContent = await buildHoverContent({
                    targetName,
                    triggerKey,
                    basePath,
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
