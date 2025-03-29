const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const watchSchemaFile = require("./watchSchemaFile");

// Cache for loaded schemas
let schemaCache = {};

module.exports = async function loadSchema(schemaName, schemaPathStart, fileWatchers) {

    if (schemaCache[schemaName]) return schemaCache[schemaName];

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return null;

    const schemaPath = path.join(workspaceFolders[0].uri.fsPath, schemaPathStart, `${schemaName}.js`);

    if (!fs.existsSync(schemaPath)) { return null; }

    try {

        // Append a timestamp query parameter to bypass the ESM cache.
        const fileUrl_main = pathToFileURL(schemaPath).href;
        const fileUrl = fileUrl_main + `?t=${new Date().getTime()}`;
        const schemaModule = await import(fileUrl);
        const schema = schemaModule.default || {};
        schema.fileUrl = fileUrl_main;
        schemaCache[schemaName] = schema;
        watchSchemaFile(schemaPath, schemaName, fileWatchers);
        return schema;

    } catch (esmError) {

        try {
            // For CommonJS, remove from require cache before requiring
            delete require.cache[require.resolve(schemaPath)];
            const schemaModule = require(schemaPath);
            schemaCache[schemaName] = schemaModule;
            watchSchemaFile(schemaPath, schemaName, fileWatchers);
            return schemaModule;
        } catch (cjsError) {
            outputChannel.appendLine(`Failed to load schema ${schemaName}: ${cjsError.message}`);
            return null;
        }

    }

}