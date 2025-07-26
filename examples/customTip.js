export default function ({
    targetName,
    data,
}) {
    
    let hoverContent = `### Custom Hover for \`${targetName}\`\n\n`;
    hoverContent += `&nbsp;\n\n`;

    const keys = Object.keys(data);
   
    keys.forEach(key => {
        const val = typeof data[key] === 'object'
            ? JSON.stringify(data[key], null, 2)
            : String(data[key]);

        hoverContent += `**${key}**: \n\`\`\`js\n${val}\n\`\`\`\n\n`;
    });

    return hoverContent;
}
