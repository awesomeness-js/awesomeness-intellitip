const vscode = require("vscode");

module.exports = ({
    targetName, 
    data,
    triggerType,
    outputChannel,
    postfixCommand
}) => {
    
    let hoverContent = `### [${typeof targetName === 'string' ? targetName : targetName.join('.')}](${data.fileUrl})\n`;

    if (data.description) {
        hoverContent += `\n${data.description}\n\n`;
    }

    hoverContent += `--- \n&nbsp;\n\n`;

    Object.keys(data).forEach((key) => {
        hoverContent += `\n**${key}**\n\n\`\`\`js\n${JSON.stringify(data[key], null, '\t')}\n\`\`\`\n\n`;
    });

    return hoverContent;

}