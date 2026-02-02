const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { log } = require("./log");
const watchSchemaFile = require("./watchSchemaFile");

let cache = {};

module.exports = async function loadTargetModule({
    targetName,
    triggerKey,
    basePath,
    triggerType,
    fileWatchers,
    outputChannel
}) {
    if (!targetName || !basePath || !triggerType) {
        log(outputChannel, `❌ Missing required params`);
        return null;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
        log(outputChannel, `❌ No workspace folder`);
        return null;
    }

    const root = workspaceFolders[0].uri.fsPath;
    const parts = Array.isArray(targetName) ? [...targetName] : [targetName];
    const name = parts.join(".");
    const last = parts[parts.length - 1];

    const basePaths = Array.isArray(basePath) ? basePath : [basePath];

    // try each configured basePath until a matching file is found
    for (const currentBasePath of basePaths) {
        log(outputChannel, `🔍 Using base path candidate: ${currentBasePath}`);

        // If the configured base path is absolute, use it directly; otherwise resolve against workspace root
        const dir = path.isAbsolute(String(currentBasePath))
            ? path.join(String(currentBasePath), ...parts.slice(0, -1))
            : path.join(root, String(currentBasePath), ...parts.slice(0, -1));

        const tryPaths = [];

        if (triggerType === "components") {
            tryPaths.push(
                path.join(dir, `${last}.md`),
                path.join(dir, last, `readme.md`),
                path.join(dir, last, `README.md`),
                path.join(dir, last, `_info.js`)
            );
        }

        if (triggerType === "schemas") {
            if (path.isAbsolute(String(currentBasePath))) {
                tryPaths.push(path.join(String(currentBasePath), `${name}.js`));
            } else {
                tryPaths.push(path.join(root, String(currentBasePath), `${name}.js`));
            }
        }

        for (const filePath of tryPaths) {
        const cacheKey = `${triggerType}::${filePath}`;
        if (cache[cacheKey]) {
            log(outputChannel, `🔍 Using cached ${filePath}`);
            return cache[cacheKey];
        }

        log(outputChannel, `🔍 Trying to load file: ${filePath}`);

        if (!fs.existsSync(filePath)) continue;

        try {
            const fileUri = vscode.Uri.file(filePath);
            const ext = path.extname(filePath);

            if (ext === ".md") {
                let content = fs.readFileSync(filePath, "utf8");
                const mdDir = path.dirname(filePath);
                content = content.replace(/!\[([^\]]*)\]\((\.\/[^\)]+)\)/g, (m, alt, rel) =>
                    `![${alt}](${vscode.Uri.file(path.resolve(mdDir, rel)).toString()})`
                );

                const data = {
                    fileUri,
                    filePath,
                    fileUrl: fileUri.toString(),
                    name,
                    md: content
                };

                // record which basePath produced this result
                data.basePath = currentBasePath;

                watchSchemaFile({ filePath, fileWatchers, cache, cacheKey });
                cache[cacheKey] = data;
                log(outputChannel, `✅ Loaded markdown: ${filePath}`);
                return data;

            } else if (ext === ".js") {
                const fileUrl = `${fileUri.toString()}?t=${Date.now()}`;
                try {
                    const mod = await import(fileUrl);
                    const data = mod.default || {};
                    Object.assign(data, {
                        fileUri,
                        filePath,
                        fileUrl: fileUri.toString()
                    });

                    // record which basePath produced this result
                    data.basePath = currentBasePath;

                    watchSchemaFile({ filePath, fileWatchers, cache, cacheKey });
                    cache[cacheKey] = data;
                    log(outputChannel, `✅ Loaded JS (ESM): ${filePath}`);
                    return data;
                } catch (e) {
                    delete require.cache[require.resolve(filePath)];
                    const mod = require(filePath);
                    Object.assign(mod, {
                        fileUri,
                        filePath,
                        fileUrl: fileUri.toString()
                    });

                    // record which basePath produced this result
                    mod.basePath = currentBasePath;

                    watchSchemaFile({ filePath, fileWatchers, cache, cacheKey });
                    cache[cacheKey] = mod;
                    log(outputChannel, `✅ Loaded JS (CJS): ${filePath}`);
                    return mod;
                }
            }

        } catch (error) {
            log(outputChannel, `❌ Error loading file: ${filePath} - ${error.message}`);
        }
        }
    }

    log(outputChannel, `❌ No matching file found for ${name}`);
    return null;
};
