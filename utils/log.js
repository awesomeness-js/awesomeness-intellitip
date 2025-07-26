const vscode = require("vscode");

let debugEnabled = false;

function initLogger(config) {
    debugEnabled = !!config.debug;
}

function log(outputChannel, message) {
    if (debugEnabled && outputChannel) {
        outputChannel.appendLine(message);
    }
}

module.exports = {
    initLogger,
    log,
};
