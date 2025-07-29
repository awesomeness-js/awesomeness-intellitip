const path = require("path");
const vscode = require("vscode");
const fs = require("fs");
const { pathToFileURL } = require("url");

module.exports = function replaceSchemasWithLinks({
    hoverContent,
    config,
    log,
    outputChannel
}) {

    // 🔽 Replace {{schema}} references with markdown links using config.schemas paths
    if (hoverContent.includes("{{")) {
        const schemaPaths = config.schemas;

        if (schemaPaths && typeof schemaPaths === "object") {
            const workspaceRoot = vscode.workspace.rootPath || "";

            hoverContent = hoverContent.replace(/{{([\w.-]+)}}/g, (match, schemaName) => {
                for (const alias in schemaPaths) {
                    const basePath = schemaPaths[alias];
                    const schemaFilePath = path.resolve(workspaceRoot, basePath, `${schemaName}.js`);

                    if (fs.existsSync(schemaFilePath)) {
                        const fileUrl = pathToFileURL(schemaFilePath).href;
                        return ` [**${schemaName}**](${fileUrl})`;
                    }
                }

                log(outputChannel, `⚠️ Schema "{{${schemaName}}}" not found in any configured schema paths.`);
                return match;
            });
        }
    }

    return hoverContent;

    
}