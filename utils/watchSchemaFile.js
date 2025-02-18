const fs = require("fs");

module.exports = function watchSchemaFile(filePath, schemaName, fileWatchers) {
    
    if (fileWatchers[filePath]) { return; }

    const watcher = fs.watch(filePath, (eventType) => {
        if (eventType === "change") { delete schemaCache[schemaName]; }
    });

    fileWatchers[filePath] = watcher;
    
}