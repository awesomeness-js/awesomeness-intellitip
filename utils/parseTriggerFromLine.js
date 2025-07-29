const vscode = require("vscode");
const { log } = require("./log");

function parseTriggerFromLine({ line, position, outputChannel }) {
    
    const config = vscode.workspace.getConfiguration("awesomeness");

    const sections = {
        schemas: config.schemas || {},
        components: config.components || {},
    };

    for (const [sectionKey, triggerMap] of Object.entries(sections)) {

        for (const triggerKey of Object.keys(triggerMap)) {
            
            const hasNoAt = !triggerKey.includes('@');

            if (hasNoAt) {
            
                // does line contain a prefix?
                const parts = extractPathByPrefix(line, triggerKey);

                if(parts.length > 0) {

                    log(outputChannel, `✅ Match found in ${triggerKey} part: ${parts.join(', ')}`);

                    return parseResult({
                        sectionKey, 
                        triggerKey, 
                        targetName: parts,
                        postfixCommand: null
                    });


                }

            }
            
           

            const escapedPath = triggerKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`${escapedPath}\\s+(\\S+)((?:\\s+(?:--|-)(?:kv|kvs|edge|edges))*)`, 'gi');
        


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

                    return parseResult({
                        sectionKey, 
                        triggerKey, 
                        targetName: matchedTarget, 
                        postfixCommand: null
                    });

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

                        return parseResult({
                            sectionKey, 
                            triggerKey, 
                            targetName: matchedTarget, 
                            postfixCommand: normalized
                        });
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

function parseResult({
    sectionKey, 
    triggerKey, 
    targetName, 
    postfixCommand
}) {

    return {
        targetName,
        postfixCommand,
        triggerKey,
        triggerType: sectionKey,
        customTypeKey: null
    };

}

const extractPathByPrefix = (text, triggerKey) => {
    const escaped = triggerKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape trigger for regex
    const regex = new RegExp(`${escaped}\\.([\\w\\d.]+)`);
    const match = text.match(regex);
    if (!match) return [];

    return match[1]
        .replace(/[();]+$/g, '') // strip trailing semicolons or parens
        .split('.')
        .filter(Boolean);
};

module.exports = parseTriggerFromLine;
