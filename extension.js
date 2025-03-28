const vscode = require("vscode");

// our utils
const watchSchemaFile = require("./utils/watchSchemaFile");
const customStringify = require("./utils/customStringify");
const loadSchema = require("./utils/loadSchema");

// Create Output Channel for debugging
const outputChannel = vscode.window.createOutputChannel("Awesomeness Intellitip");

// Cache for loaded schemas
let schemaCache = {};

// Store file watchers for schema files
let fileWatchers = {};


function activate(context) {

    outputChannel.appendLine("✅ Awesomeness Intellitip Activated!");
    //outputChannel.show();

    // Clean up file watchers on deactivation
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
                const paths = Object.keys(config.paths);
                const line = document.lineAt(position.line).text;
    
                let schemaName = null;
                let winningPath = null;
    
                for (const p of paths) {
                    // Escape any regex special characters in path if necessary
                    const escapedPath = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    // Regex: " <path> " followed by one or more whitespace characters and then a word
                    const regex = new RegExp(` ${escapedPath}\\s+(\\S+)`);
                    const pathMatches = line.match(regex);
    
                    if (pathMatches) {
                        schemaName = pathMatches[1];
                        winningPath = p;
                        break;
                    }
                }
    
                if (!schemaName) { 
                    return; 
                }
    
                const schemaPathStart = config.paths[winningPath];
                const schema = await loadSchema(schemaName, schemaPathStart, fileWatchers);
                if (!schema) {
                    return;
                }
    
                let hoverContent = `### ${schemaName}\n`;
    
                if (schema.description) {
                    hoverContent += `\n${schema.description}\n\n`;
                }
    
                if (schema.properties) {
                    let kvs = [];
                    Object.keys(schema.properties).forEach((key) => {
                        kvs.push(`${key}: ${schema.properties[key].type}`);
                    });
                    hoverContent += `\n\`\`\`js\n${schemaName} { \n\t${kvs.join('\n\t')}\n }\n\`\`\`\n\n`;
                    hoverContent += `**Details**\n\n`;
                    hoverContent += `\n\`\`\`js\n${customStringify(schema.properties)}\n\`\`\`\n\n`;
                }
    
                if (schema.edges?.length) {
    
                    hoverContent += `&nbsp;\n\n`;
                    hoverContent += `### Edges\n\n`;
        
                    schema.edges.forEach((edge) => {
                        hoverContent += `${edge[0]} --- \`${edge[1]}\` --> ${edge[2]}\n\n`;
                    });
    
                    hoverContent += `&nbsp;\n\n`;
    
                    
                }
    
                if (schema.relatedKVs) {
                    hoverContent += `### Related KVs\n\n`;
                    let relatedKVs = Object.keys(schema.relatedKVs);
                    if (relatedKVs.length) {
                        relatedKVs.forEach((key) => {
                            hoverContent += `\`\`\`js \n\n${key}\n\`\`\`\n `;
                            hoverContent += `\n\n\`\`\`js \n${customStringify(schema.relatedKVs[key])}\n\n\`\`\`\n\n`;
                        });
                    }
                }
    
                Object.keys(schema).forEach((key) => {
                    if (["properties", "edges", "name", "description", "relatedKVs"].includes(key)) {
                        return;
                    }
                    hoverContent += `\n**${key}**\n\n\`js \n${JSON.stringify(schema[key], null, '\t')}\n\`\`\`\n\n`;
                });
    
                return new vscode.Hover(new vscode.MarkdownString(hoverContent, true));

                
            } catch (err){
                outputChannel.appendLine(`Error: ${err.message}`);
            };
            


        }
    });

    context.subscriptions.push(hoverProvider);
}

function deactivate() {
    outputChannel.appendLine("🛑 Awesomeness Intellitip Deactivated!");
}

module.exports = { activate, deactivate };
