const vscode = require("vscode");
const customStringify = require("../customStringify");

module.exports = ({
    targetName, 
    data,
    triggerType,
    outputChannel,
    postfixCommand
}) => {
    
    let hoverContent = `### [${targetName}](${data.fileUrl})\n`;

    if (data.description) {
        hoverContent += `\n${data.description}\n\n`;
    }

    if (data.properties) {
        const kvsList = Object.entries(data.properties).map(([k, v]) => `${k}: ${v.type}`);
        hoverContent += `\`\`\`js\n${targetName} {\n\t${kvsList.join('\n\t')}\n}\n\`\`\`\n`;
        hoverContent += `&nbsp;\n\n--- \n&nbsp;\n\n`;
        hoverContent += `### ✍️ Details\n\n`;
        hoverContent += `\n\`\`\`js\n${customStringify(data.properties)}\n\`\`\`\n\n`;
        hoverContent += `&nbsp;\n\n`;
    }

    hoverContent += `--- \n&nbsp;\n\n`;

    if (data.edges?.length) {
        hoverContent += `### 🕸️ Edges\n\n\n`;
        data.edges.forEach(([from, via, to]) => {
            hoverContent += `${from} --- \`${via}\` --> ${to}\n\n`;
        });
        hoverContent += `&nbsp;\n\n`;
    }

    hoverContent += `--- \n&nbsp;\n\n`;

    if (data.relatedKVs) {
        const keys = Object.keys(data.relatedKVs);
        hoverContent += `### 🗝️ Related KVs\n\n`;

        if (keys.length) {
            keys.forEach(key => {
                hoverContent += `\`\`\`js \n${key}\n\`\`\`\n`;
                hoverContent += `\n\`\`\`js\n${customStringify(data.relatedKVs[key])}\n\`\`\`\n\n`;
            });
        } else {
            hoverContent += `&nbsp;\n\nNo Related KVs Found\n\n&nbsp;\n\n`;
        }
    }

    hoverContent += `--- \n&nbsp;\n\n`;

    Object.keys(data).forEach((key) => {
        if ([
            "properties", 
            "edges", 
            "name", 
            "description", 
            "relatedKVs", 
            "fileUrl",
            "fileUri",
            "filePath"
        ].includes(key)) return;
        hoverContent += `\n**${key}**\n\n\`\`\`js\n${JSON.stringify(data[key], null, '\t')}\n\`\`\`\n\n`;
    });

    return hoverContent;

}