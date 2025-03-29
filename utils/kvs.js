const vscode = require("vscode");
const customStringify = require("./customStringify");

module.exports = (schema, hoverContent = "") => {
    
    let relatedKVs = Object.keys(schema.relatedKVs);
    
    hoverContent += `&nbsp;\n\n`;

    if (relatedKVs.length) {
        
        relatedKVs.forEach((key) => {
            hoverContent += `\`\`\`js \n${key}\t\t\n\`\`\`\n `;
            hoverContent += `\n\n\`\`\`js \n${customStringify(schema.relatedKVs[key])}\n\n\`\`\`\n\n`;
            hoverContent += `&nbsp;\n\n`;
            hoverContent += `--- \n`;
            hoverContent += `&nbsp;\n\n`;

        });
        
    } else {
        hoverContent += `&nbsp;\n\n`;
        hoverContent += `### No Related KVs Found\n\n`;
        hoverContent += `&nbsp;\n\n`;
    }

    return new vscode.Hover(new vscode.MarkdownString(hoverContent, true));

}