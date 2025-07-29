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
    triggerKey,
    data,
    basePath,
    triggerType,
    outputChannel,
    postfixCommand,
    contentFunctionLocation
}) {
    
    let targetArray = Array.isArray(targetName);

    // log(outputChannel, `🔍 Building hover content for ${targetName} (${triggerType})`);

       
    // show data keys
    // log(outputChannel, `🔍 Data keys: ${Object.keys(data).join(", ")}`);


    if(data?.hoverTip){
        
        log(outputChannel, `🔍 Using hoverTip data for ${targetName}`);
       
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders?.length) {
            log(outputChannel, `❌ No workspace folder found`);
            return null;
        }
    
        const root = workspaceFolders[0].uri.fsPath;
        
        let jsFn = null;

        // is this md or js?
        if (typeof data.hoverTip === "string") {

            const filePath = path.join(root, basePath, targetName, data.hoverTip);

            if(data.hoverTip.endsWith(".md")){
                
        
                log(outputChannel, `🔍 Using hoverTip markdown for ${targetName}`);
                
                if (fs.existsSync(filePath)) {
                    let content = `### [${targetName}](${data.fileUrl})\n`;
                    content += fs.readFileSync(filePath, "utf8");
                    log(outputChannel, `✅ Loaded hoverTip markdown ${content}`);
                    return content;
                }

                log(outputChannel, `❌ hoverTip file does not exist: ${filePath}`);

            }


            if (data.hoverTip.endsWith(".js")) {
                
                log(outputChannel, `🔍 Using hoverTip JS for ${targetName}`);
                
                try {

                    // Use require for CommonJS modules
                    const mod = require(filePath);
                    
                    jsFn = mod.default || mod;

                } catch (err) {

                    log(outputChannel, `❌ Error loading hoverTip JS: ${err.message}`);

                }

            }
            
        } else if (typeof data.hoverTip === "function") {

            jsFn = data.hoverTip;
        
        }

        log(outputChannel, `🔍 HoverTip function: ${typeof jsFn} `);

        if(typeof jsFn === "function") {

            log(outputChannel, `🔍 Executing hoverTip function for ${targetName}`);

            try {
                const result = await jsFn({
                    targetName, 
                    data,
                    basePath,
                    triggerType,
                    outputChannel,
                    postfixCommand,
                    contentFunctionLocation
                });
                
                return `### [${targetName}](${data.fileUrl})\n` + result;

            } catch (err) {
                log(outputChannel, `❌ Error executing hoverTip function: ${err.message}`);
            }

        }

    }

    if(data.md){

        log(outputChannel, `🔍 Using markdown content for ${targetName}`);
        return `### [${ data.name ? data.name : targetName}](${data.fileUrl})\n` + data.md;

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

    log(outputChannel, `🔍 Using generic hover content for ${targetName}`);

    return generic({
        targetName, 
        data,
        triggerType,
        outputChannel,
        postfixCommand
    });

    
}

module.exports = buildHoverContent;
