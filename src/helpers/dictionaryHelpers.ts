
/* istanbul ignore next */
function mapReviver(_, value) {
    if (typeof value === 'object' && value !== null) {
        if (value.dataType === 'Map') {
            return new Map(value.value);
        }
    }

    return value;
}

/* istanbul ignore next */
function mapReplacer(_, value) {
    if (value instanceof Map) {
        return {
            dataType: 'Map',
            value: Array.from(value.entries()), // or with spread: value: [...value]
        };
    } else {
        return value;
    }
}

export {
    mapReviver,
    mapReplacer
}
