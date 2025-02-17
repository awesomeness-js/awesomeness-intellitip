const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

// Create Output Channel for debugging
const outputChannel = vscode.window.createOutputChannel("Awesomeness Tooltip");

// Cache for loaded schemas
let schemaCache = {};

async function getSchemaPath() {

    const config = vscode.workspace.getConfiguration("awesomenessTooltip");

    return config.get("schemasPath") || "api/schemas"; 

}

function customStringify(obj, indent = 2, level = 0, unquotedValues = ['type']) {
    const isValidKey = key => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);

    function stringifyValue(value, key, level) {
        if (typeof value === "string") {
            // If the key is in the unquotedValues list, return as-is without quotes
            if (unquotedValues.includes(key)) {
                return value;
            }
            return JSON.stringify(value); // Ensures proper escaping of strings
        } else if (typeof value === "object" && value !== null) {
            return formatObject(value, level + 1);
        }
        return String(value); // Converts other primitive types
    }

    function formatObject(obj, level) {
        if (Array.isArray(obj)) {
            const arrayContent = obj
                .map(item => " ".repeat(indent * (level + 1)) + stringifyValue(item, null, level))
                .join(",\n");
            return `[\n${arrayContent}\n${" ".repeat(indent * level)}]`;
        }

        const entries = Object.entries(obj).map(([key, value]) => {
            const formattedKey = isValidKey(key) ? key : JSON.stringify(key);
            return `${" ".repeat(indent * (level + 1))}${formattedKey}: ${stringifyValue(value, key, level)}`;
        });

        return `{\n${entries.join(",\n")}\n${" ".repeat(indent * level)}}`;
    }

    return formatObject(obj, level);
}

async function loadSchema(schemaName) {

    if (schemaCache[schemaName]) return schemaCache[schemaName];

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return null;

    const schemaPath = path.join(workspaceFolders[0].uri.fsPath, await getSchemaPath(), `${schemaName}.js`);
    
    // outputChannel.appendLine(`Schema path: ${schemaPath}`);
 
    if (!fs.existsSync(schemaPath)) {
        outputChannel.appendLine(`❌ Schema file not found: ${schemaPath}`);
        return null;
    }

    // outputChannel.appendLine(`Loading schema: ${schemaName}`);

    try {
        // ✅ Try CommonJS `require()` first
        const schemaModule = require(schemaPath);
        //outputChannel.appendLine(`✅ Loaded schema using require(): ${schemaName}`);
        schemaCache[schemaName] = schemaModule;
        return schemaModule;
    } catch (requireError) {
        //outputChannel.appendLine(`⚠️ Failed to load with require(): ${requireError.message}`);
        
        // ✅ Fallback to `import()` for ES Modules
        try {
            const fileUrl = pathToFileURL(schemaPath).href;
            //outputChannel.appendLine(`🔄 Trying import() for ES Module: ${fileUrl}`);

            const schemaModule = await import(fileUrl);
            //outputChannel.appendLine(`✅ Loaded schema using import(): ${schemaName}`);

            schemaCache[schemaName] = schemaModule.default || {};
            return schemaModule.default || {};
       
        } catch (importError) {
            //outputChannel.appendLine(`❌ Failed to load schema: ${importError.message}`);
            return null;
        }
    }
}

function activate(context) {
    outputChannel.appendLine("✅ Awesomeness Tooltip Activated!");
    outputChannel.show();

    const hoverProvider = vscode.languages.registerHoverProvider("javascript", {

        async provideHover(document, position) {
           
            const line = document.lineAt(position.line).text;
           
            // outputChannel.appendLine(`🔍 Checking Line: "${line}"`);

            const match = line.match(/\/\/\s*@doc\s+(\S+)/);
            //outputChannel.appendLine(`🛠 Regex Match Result: ${JSON.stringify(match)}`);

            if (!match) {
                //outputChannel.appendLine("❌ No match found.");
                return;
            }

            const schemaName = match[1];
            //outputChannel.appendLine(`✅ Matched Schema Name: ${schemaName}`);

            const schema = await loadSchema(schemaName);
            if (!schema) {
                //outputChannel.appendLine(`❌ Schema not found: ${schemaName}`);
                return;
            }

            //outputChannel.appendLine(`✅ Schema Loaded: ${JSON.stringify(schema)}`);

            let hoverContent = ``;

            hoverContent += `### ${schemaName}\n`;

            if (schema.description) {
                hoverContent += `\n${schema.description}\n\n`;
            }

            if (schema.properties) {

                let kvs = [];
                Object.keys(schema.properties).forEach((key) => {
                    kvs.push(`${key}: ${schema.properties[key].type}`);
                });

                hoverContent += `\n\`\`\`js\n${schemaName} { \n\t${ kvs.join('\n\t') }\n }\n\`\`\`\n\n`;

                hoverContent += `**Details**\n\n`;
                hoverContent += `\n\`\`\`js\n${customStringify(schema.properties)}\n\`\`\`\n\n`;


            }


            if (schema.edges) {
               
                hoverContent += `### Edges\n\n`;
               
                let edges = Object.keys(schema.edges);

                if(edges.length){
                    edges.forEach((key) => {
                        hoverContent += ` - ${key}\n\n`;
                    });
                }

            }



            if(schema.relatedKVs){

                hoverContent += `### Related KVs\n\n`;
               
                let relatedKVs = Object.keys(schema.relatedKVs);

                if(relatedKVs.length){

                    relatedKVs.forEach((key) => {

                        hoverContent += `\`\`\`js \n \n`;
                        hoverContent += key;
                        hoverContent += `\n\`\`\`\n `;

                        hoverContent += `\n\n\`\`\`js \n`;
                        let kvExample = schema.relatedKVs[key];
                        hoverContent += customStringify(kvExample);

                        hoverContent += `\n\n\`\`\`\n\n`;

                    });
                }


            }



            let keys = Object.keys(schema);

            keys.forEach((key) => {

                if ([
                    'properties', 
                    'edges', 
                    'name', 
                    'description', 
                    'relatedKVs'
                ].includes(key)) return;

                hoverContent += `\n**${key}**\n\n\`js \n`;
                hoverContent += JSON.stringify(schema[key], null, '\t');
                hoverContent += `\n\`\`\`\n\n`;

            });

            return new vscode.Hover(new vscode.MarkdownString(hoverContent, true));

        }


        

    });

    context.subscriptions.push(hoverProvider);
}

function deactivate() {
    outputChannel.appendLine("🛑 Awesomeness Tooltip Deactivated!");
}

// ✅ Export as CommonJS (VS Code requires this)
module.exports = { activate, deactivate };
