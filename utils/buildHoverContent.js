const customStringify = require("./customStringify");
const { log } = require("./log");
const edges = require("./hoverContent/edges");
const kvs = require("./hoverContent/kvs");
const schemas = require("./hoverContent/schemas");
const generic = require("./hoverContent/generic");
const path = require("path");
const vscode = require("vscode");
const fs = require("fs");
const { pathToFileURL } = require("url");

async function buildHoverContent({
    targetName, 
    data,
    triggerType,
    outputChannel,
    postfixCommand,
    contentFunctionLocation
}) {
    
    log(outputChannel, `🔍 Building hover content for ${targetName} (${triggerType})`);


    // 🔽 For customTypes, dynamically call the hover builder function
    if (triggerType === "customTypes" && contentFunctionLocation) {

        const absFnPath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, contentFunctionLocation);
        
        if (!fs.existsSync(absFnPath)) {
            
            log(outputChannel, `❌ Hover builder not found: ${absFnPath} - using generic hover instead`);

        } else {

            const fileUrl = pathToFileURL(absFnPath).href + `?t=${Date.now()}`;
            const hoverModule = await import(fileUrl);
            const customHoverFn = hoverModule.default;

            if (typeof customHoverFn !== "function") {
                log(outputChannel, `❌ contentFunctionLocation must export a function`);
                return;
            }

            return customHoverFn({
                targetName,
                data,
                postfixCommand
            });

        }

    }



    if (postfixCommand === "edges") {
        return edges(data, `### [${targetName}](${data.fileUrl})\n`);
    }

    if (postfixCommand === "kv") {
        return kvs(data, `### [${targetName}](${data.fileUrl})\n`);
    }

    if (triggerType === "schemas") {
        return schemas({
            targetName, 
            data,
            triggerType,
            outputChannel,
            postfixCommand
        });
    }

    return generic({
        targetName, 
        data,
        triggerType,
        outputChannel,
        postfixCommand
    });

    
}

module.exports = buildHoverContent;
