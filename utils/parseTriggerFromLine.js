const vscode = require("vscode");
const { log } = require("./log");

function parseTriggerFromLine({ line, position, outputChannel, config }) {
    
    const sections = {
        schemas: config.schemas || {},
        tipMap: config.tipMap || {},
    };

    for (const [sectionKey, triggerMap] of Object.entries(sections)) {

        for (const triggerKey of Object.keys(triggerMap)) {

            const regexLiteral = parseRegexLiteral(triggerKey);

            if (regexLiteral) {
                let regexMatch;
                while ((regexMatch = regexLiteral.exec(line)) !== null) {
                    const fullMatch = regexMatch[0] || "";
                    const fullMatchIndex = regexMatch.index;

                    const namedTarget = regexMatch.groups?.target;
                    const capturedTarget = namedTarget || regexMatch[1] || fullMatch;

                    if (!capturedTarget) continue;

                    const cursorChar = position.character;
                    const targetOffset = fullMatch.indexOf(capturedTarget);
                    const targetStart = targetOffset >= 0 ? fullMatchIndex + targetOffset : fullMatchIndex;
                    const targetEnd = targetStart + capturedTarget.length;

                    log(outputChannel, `✅ Regex trigger matched [${triggerKey}] target="${capturedTarget}"`);

                    if (cursorChar >= targetStart && cursorChar <= targetEnd) {
                        log(outputChannel, `🎯 Cursor is over regex target: "${capturedTarget}"`);

                        return parseResult({
                            sectionKey,
                            triggerKey,
                            targetName: capturedTarget,
                            postfixCommand: null
                        });
                    }
                }

                continue;
            }
            
            const hasNoAt = !triggerKey.includes('@');

            if (hasNoAt) {

                const assignedFunctionTarget = extractAwaitedFunctionAssignment({
                    text: line,
                    triggerKey,
                    position,
                    outputChannel
                });

                if (assignedFunctionTarget) {
                    return parseResult({
                        sectionKey,
                        triggerKey,
                        targetName: assignedFunctionTarget,
                        postfixCommand: null
                    });
                }
            
                // does line contain a prefix?
                const parts = extractPathByPrefix(line, triggerKey);

                if(parts.length > 0) {

                    log(outputChannel, `✅ Match found in [${triggerKey}] part: ${parts.join(', ')}`);

                    return parseResult({
                        sectionKey, 
                        triggerKey, 
                        targetName: parts,
                        postfixCommand: null
                    });


                }

                const functionCallTarget = extractFunctionFirstArg({
                    text: line,
                    triggerKey,
                    position,
                    outputChannel
                });

                if (functionCallTarget) {
                    return parseResult({
                        sectionKey,
                        triggerKey,
                        targetName: functionCallTarget,
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

function parseRegexLiteral(triggerKey) {
    if (typeof triggerKey !== 'string') return null;

    const literal = triggerKey.match(/^\/(.+)\/([a-z]*)$/i);
    if (!literal) return null;

    try {
        const source = literal[1];
        const flagsRaw = literal[2] || '';
        const flags = flagsRaw.includes('g') ? flagsRaw : `${flagsRaw}g`;
        return new RegExp(source, flags);
    } catch (e) {
        return null;
    }
}

function normalizeFunctionTrigger(triggerKey) {
    if (typeof triggerKey !== 'string') return '';

    return triggerKey
        .replace(/\s*\(\s*$/, '')
        .replace(/\s*\(\s*['"`]\s*$/, '')
        .trim();
}

function extractFunctionFirstArg({ text, triggerKey, position, outputChannel }) {
    const normalizedTrigger = normalizeFunctionTrigger(triggerKey);
    if (!normalizedTrigger) return null;

    const escaped = normalizedTrigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = escaped + "\\s*\\(\\s*(?:(['\"`])([^'\"`]+)\\1|([A-Za-z_$][\\w$]*))";
    const regex = new RegExp(pattern, 'g');
    const cursorChar = position.character;

    let match;
    while ((match = regex.exec(text)) !== null) {
        const fullMatch = match[0] || '';
        const matchedTarget = match[2] || match[3];
        if (!matchedTarget) continue;
        const fullMatchIndex = match.index;
        const targetOffset = fullMatch.indexOf(matchedTarget);
        const targetStart = targetOffset >= 0 ? fullMatchIndex + targetOffset : fullMatchIndex;
        const targetEnd = targetStart + matchedTarget.length;

        log(outputChannel, `✅ Function call trigger matched [${triggerKey}] target="${matchedTarget}"`);

        if (cursorChar >= targetStart && cursorChar <= targetEnd) {
            log(outputChannel, `🎯 Cursor is over function call target: "${matchedTarget}"`);
            return matchedTarget;
        }
    }

    return null;
}

function extractAwaitedFunctionAssignment({ text, triggerKey, position, outputChannel }) {
    const normalizedTrigger = normalizeFunctionTrigger(triggerKey);
    if (!normalizedTrigger) return null;

    const escaped = normalizedTrigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*await\\s+${escaped}\\s*\\(`;
    const regex = new RegExp(pattern, 'g');
    const cursorChar = position.character;

    let match;
    while ((match = regex.exec(text)) !== null) {
        const targetName = match[1];
        const targetOffset = match[0].indexOf(targetName);
        const targetStart = match.index + targetOffset;
        const targetEnd = targetStart + targetName.length;

        log(outputChannel, `✅ Awaited function assignment matched [${triggerKey}] target="${targetName}"`);

        if (cursorChar >= targetStart && cursorChar <= targetEnd) {
            log(outputChannel, `🎯 Cursor is over assigned function target: "${targetName}"`);
            return targetName;
        }
    }

    return null;
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
