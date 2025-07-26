const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { log } = require("./log");
const watchSchemaFile = require("./watchSchemaFile");

let cache = {};

module.exports = async function loadTargetModule({
    targetName,
    basePath,
    triggerType,
    fileWatchers,
    outputChannel,
    customTypeKey // optional
}) {
    if (!targetName || !basePath || !triggerType) {
        log(outputChannel, `❌ loadTargetModule missing one of: targetName, basePath, triggerType`);
        return null;
    }

    const cacheKey = `${triggerType}::${targetName}`;
    if (cache[cacheKey]) return cache[cacheKey];

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
        log(outputChannel, `❌ No workspace folder found`);
        return null;
    }

    const root = workspaceFolders[0].uri.fsPath;

    let filePath;

    if (triggerType === "schemas") {
        filePath = path.join(root, basePath, `${targetName}.js`);
    } else if (triggerType === "uiComponents") {
        filePath = path.join(root, basePath, targetName, `_info.js`);
    } else if (triggerType === "customTypes") {

        const config = vscode.workspace.getConfiguration("awesomeness");
        const customTypeDef = config.customTypes?.[customTypeKey];

        const usesInfoFile = !!customTypeDef?._info;

        if(!usesInfoFile && targetName.endsWith(".js")) {

           targetName = targetName.replace(/\.js$/, ''); 

        }

        filePath = usesInfoFile
            ? path.join(root, basePath, targetName, `_info.js`)
            : path.join(root, basePath, `${targetName}.js`);

        log(outputChannel, `🔍 Custom type "${customTypeKey}" resolved to file: ${filePath}`);

    } else {
        log(outputChannel, `❌ Unknown triggerType: ${triggerType}`);
        return null;
    }

    if (!fs.existsSync(filePath)) {
        log(outputChannel, `❌ Target file does not exist: ${filePath}`);
        return null;
    }

    try {
        const fileUrl_main = pathToFileURL(filePath).href;
        const fileUrl = `${fileUrl_main}?t=${Date.now()}`;
        const mod = await import(fileUrl);
        const data = mod.default || {};
        data.fileUrl = fileUrl_main;

        cache[cacheKey] = data;
        watchSchemaFile(filePath, targetName, fileWatchers);

        log(outputChannel, `✅ Loaded ${triggerType} [${targetName}]`);
        return data;

    } catch (esmError) {
        log(outputChannel, `⚠️ ESM import failed, trying CJS for: ${filePath}`);

        try {
            delete require.cache[require.resolve(filePath)];
            const mod = require(filePath);
            cache[cacheKey] = mod;

            watchSchemaFile(filePath, targetName, fileWatchers);
            log(outputChannel, `✅ Loaded ${triggerType} [${targetName}] via CommonJS`);
            return mod;
        } catch (cjsError) {
            log(outputChannel, `❌ Failed to load ${triggerType} [${targetName}]: ${cjsError.message}`);
            return null;
        }
    }
};
