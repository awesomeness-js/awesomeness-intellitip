module.exports = function customStringify(obj, indent = 2, level = 0, unquotedValues = ['type']) {
    
    const isValidKey = key => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);

    function stringifyValue(value, key, level) {
        if (typeof value === "string") {
            if (unquotedValues.includes(key)) {
                return value;
            }
            return JSON.stringify(value);
        } else if (typeof value === "object" && value !== null) {
            return formatObject(value, level + 1);
        }
        return String(value);
    }

    function formatObject(obj, level) {
        if (Array.isArray(obj)) {
            const arrayContent = obj
                .map(item => " ".repeat(indent * (level + 1)) + stringifyValue(item, null, level))
                .join(",\n");
            return `[\n${arrayContent}\n${" ".repeat(indent * level)}]`;
        }

        const entries = Object.entries(obj).map(([key, value]) => {
            const formattedKey = isValidKey(key) ? key : JSON.stringify(key);
            return `${" ".repeat(indent * (level + 1))}${formattedKey}: ${stringifyValue(value, key, level)}`;
        });

        return `{\n${entries.join(",\n")}\n${" ".repeat(indent * level)}}`;
    }

    return formatObject(obj, level);
    
}