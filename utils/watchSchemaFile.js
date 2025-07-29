const fs = require("fs");

module.exports = function watchSchemaFile({ filePath, fileWatchers, cache, cacheKey }) {
    
    if (fileWatchers[filePath]) { return; }

    const watcher = fs.watch(filePath, (eventType) => {
        if (eventType === "change") { delete cache[cacheKey]; }
    });

    fileWatchers[filePath] = watcher;
    
}