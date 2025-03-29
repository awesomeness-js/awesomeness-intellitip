const vscode = require("vscode");

module.exports = (schema, hoverContent = "") => {
    
    if (schema.edges?.length) {

        schema.edges.forEach((edge) => {
            hoverContent += `${edge[0]} --- \`${edge[1]}\` --> ${edge[2]}\n\n`;
        });

    } else {

        hoverContent += `&nbsp;\n\n`;
        hoverContent += `### No Edges Found\n\n\n`;
        hoverContent += `&nbsp;\n\n`;

    }

    return new vscode.Hover(new vscode.MarkdownString(hoverContent, true));

}