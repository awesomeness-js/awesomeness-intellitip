const vscode = require("vscode");
const { log } = require("./log");

function parseTriggerFromLine({ line, position, outputChannel }) {
    const config = vscode.workspace.getConfiguration("awesomeness");

    const sections = {
        schemas: config.schemas || {},
        uiComponents: config.uiComponents || {},
    };

    // Flatten customTypes triggers into section-style format
    const customTypes = config.customTypes || {};
    for (const [typeName, def] of Object.entries(customTypes)) {
        if (def.triggers) {
            sections[`customTypes:${typeName}`] = def.triggers;
        }
    }

    for (const [sectionKey, triggerMap] of Object.entries(sections)) {
        for (const triggerKey of Object.keys(triggerMap)) {
            const escapedPath = triggerKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`${escapedPath}\\s+(\\S+)((?:\\s+(?:--|-)(?:kv|kvs|edge|edges))*)`, 'gi');
            log(outputChannel, `🔍 Testing [${sectionKey}] regex: ${regex} against "${line}"`);

            let match;
            while ((match = regex.exec(line)) !== null) {
                const [fullMatch, matchedTarget, postfixChunk] = match;
                const fullMatchIndex = match.index;

                log(outputChannel, `✅ Match found in [${sectionKey}]: "${matchedTarget}", postfixChunk="${postfixChunk}"`);

                const cursorChar = position.character;

                const targetOffset = match[0].indexOf(matchedTarget);
                const targetStart = fullMatchIndex + targetOffset;
                const targetEnd = targetStart + matchedTarget.length;

                if (cursorChar >= targetStart && cursorChar <= targetEnd) {
                    log(outputChannel, `🎯 Cursor is over target: "${matchedTarget}"`);

                    return parseResult(sectionKey, triggerKey, matchedTarget, null);
                }

                const postfixMatches = [...postfixChunk.matchAll(/(?:--|-)(kv|kvs|edge|edges)/g)];
                for (const pm of postfixMatches) {
                    const raw = pm[1];
                    const normalized = raw.startsWith('kv') ? 'kv' : 'edges';
                    const postfixOffset = match[0].indexOf(pm[0], targetOffset + matchedTarget.length);
                    const postfixStart = fullMatchIndex + postfixOffset;
                    const postfixEnd = postfixStart + pm[0].length;

                    log(outputChannel, `   ↪ Found postfix: "${pm[0]}" as "${normalized}" at [${postfixStart}, ${postfixEnd}]`);

                    if (cursorChar >= postfixStart && cursorChar <= postfixEnd) {
                        log(outputChannel, `🎯 Cursor is over postfix "${normalized}"`);

                        return parseResult(sectionKey, triggerKey, matchedTarget, normalized);
                    }
                }

                log(outputChannel, `🚫 No cursor match inside this trigger line`);
            }
        }
    }

    return {
        targetName: null,
        postfixCommand: null,
        triggerKey: null,
        triggerType: null,
        customTypeKey: null
    };
}

function parseResult(sectionKey, triggerKey, targetName, postfixCommand) {
    if (sectionKey.startsWith("customTypes:")) {
        const [, customTypeKey] = sectionKey.split(":");
        return {
            targetName,
            postfixCommand,
            triggerKey,
            triggerType: "customTypes",
            customTypeKey
        };
    }

    return {
        targetName,
        postfixCommand,
        triggerKey,
        triggerType: sectionKey,
        customTypeKey: null
    };
}

module.exports = parseTriggerFromLine;
