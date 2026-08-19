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

function resolveConfiguredBasePath({ configuredBase, site, workspaceRoot, outputChannel }) {
    if (typeof configuredBase !== 'function') return configuredBase;

    try {
        const locations = configuredBase({ site });
        return (Array.isArray(locations) ? locations : [locations])
            .map((location) => {
                if (!location) return null;
                if (location instanceof URL) return fileURLToPath(location);

                try {
                    if (String(location).startsWith('file:')) {
                        return fileURLToPath(new URL(String(location)));
                    }
                } catch (error) {
                    log(outputChannel, `❌ Error resolving configured base path: ${error.message}`);
                }

                return path.resolve(workspaceRoot, String(location));
            })
            .filter(Boolean);
    } catch (error) {
        log(outputChannel, `❌ Error computing configured base path: ${error.message}`);
        return [];
    }
}

function getGenericCandidates({ config, site, workspaceRoot, outputChannel }) {
    const candidates = [];

    for (const triggerType of ['tipMap', 'schemas']) {
        const triggerMap = config[triggerType] || {};

        for (const [triggerKey, configuredBase] of Object.entries(triggerMap)) {
            const basePath = resolveConfiguredBasePath({ configuredBase, site, workspaceRoot, outputChannel });

            candidates.push({
                triggerKey,
                triggerType,
                basePath
            });
        }
    }

    return candidates;
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

    // log config
    const vsConfig = vscode.workspace.getConfiguration("awesomeness");
    const makeSchemaWordsSpecial = vsConfig.get('makeSchemaWordsSpecial', true);

    initLogger(vsConfig);

    outputChannel.appendLine(`VS Config: debug=${vsConfig.get('debug')}, configFile=${vsConfig.get('configFile')}`);

    if(vsConfig.get('debug') === true){
        
        // ensure output panel is visible so debug logs are seen while developing
        try { outputChannel.show(true); } catch (e) { /* ignore in prod */ }

        outputChannel.appendLine(`Debug mode is ON. Logs will be printed to the "Awesomeness Intellitip" output channel.`);
    }

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
                    customTypeKey,
                    isGeneric,
                    propertyName
                } = parseTriggerFromLine({ 
                    line,
                    position, 
                    outputChannel,
                    config
                });

                const schemaWordsAreSpecial = config.makeSchemaWordsSpecial ?? makeSchemaWordsSpecial;

                if (!targetName || (isGeneric && !schemaWordsAreSpecial)) return;

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

                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders?.length) return;

                const candidates = isGeneric
                    ? getGenericCandidates({ config, site, workspaceRoot: workspaceFolders[0].uri.fsPath, outputChannel })
                    : [{
                        triggerKey,
                        triggerType,
                        basePath: resolveConfiguredBasePath({
                            configuredBase: config[triggerType]?.[triggerKey],
                            site,
                            workspaceRoot: workspaceFolders[0].uri.fsPath,
                            outputChannel
                        })
                    }];

                let data = null;
                let resolvedTriggerKey = triggerKey;
                let resolvedTriggerType = triggerType;
                for (const candidate of candidates) {
                    const candidateBasePath = expandBasePathCandidates({
                        configuredBase: candidate.basePath,
                        config
                    });

                    if (!candidateBasePath.length) continue;

                    data = await loadTargetModule({
                        targetName,
                        triggerKey: candidate.triggerKey,
                        basePath: candidateBasePath,
                        triggerType: candidate.triggerType,
                        fileWatchers,
                        outputChannel,
                        customTypeKey
                    });

                    if (data) {
                        resolvedTriggerKey = candidate.triggerKey;
                        resolvedTriggerType = candidate.triggerType;
                        basePath = candidateBasePath;
                        break;
                    }
                }

                if (!data) {
                    log(outputChannel, `❌ No data found for generic target "${targetName}"`);
                    return;
                }

                const resolvedBasePath = data?.basePath || basePath;

                let hoverContent = await buildHoverContent({
                    targetName,
                    triggerKey: resolvedTriggerKey,
                    basePath: resolvedBasePath,
                    data,
                    triggerType: resolvedTriggerType,
                    outputChannel,
                    postfixCommand,
                    contentFunctionLocation,
                    propertyName
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
