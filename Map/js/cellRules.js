export const CELL_DEFINITIONS = Object.freeze({
    SEA: { label: '海', color: '#1e4d6b', allowed: false, requiredItems: [] },
    LAKE: { label: '湖沼', color: '#3b82f6', allowed: false, requiredItems: [] },
    PLAINS: { label: '草原', color: '#8db87c', allowed: true, requiredItems: [] },
    FOREST: { label: '森林', color: '#3e6b48', allowed: true, requiredItems: [] },
    MOUNTAIN: { label: '山岳', color: '#a8947d', allowed: true, requiredItems: [] },
    RUIN: { label: '古代遺跡', color: '#6f2c2c', allowed: true, requiredItems: [] }
});

export function getMosaicColor(baseColor, x, y) {
    const color = String(baseColor || '#526f4e');
    const match = color.match(/^#([0-9a-f]{6})$/i);
    if (!match) return color;
    let hash = Math.imul((Number(x) | 0) + 1, 374761393);
    hash = Math.imul(hash ^ ((Number(y) | 0) + 1), 668265263);
    hash ^= hash >>> 13;
    const shift = (hash % 17) - 8;
    const red = Math.max(0, Math.min(255, parseInt(match[1].slice(0, 2), 16) + shift));
    const green = Math.max(0, Math.min(255, parseInt(match[1].slice(2, 4), 16) + shift));
    const blue = Math.max(0, Math.min(255, parseInt(match[1].slice(4, 6), 16) + shift));
    return `rgb(${red}, ${green}, ${blue})`;
}

const NUMERIC_CELL_TYPES = {
    0: 'PLAINS',
    1: 'MOUNTAIN',
    2: 'FOREST',
    3: 'SEA'
};

export function getCellTypeKey(tile) {
    if (!tile) return 'PLAINS';
    if (typeof tile.type === 'number') return NUMERIC_CELL_TYPES[tile.type] || 'PLAINS';
    if (tile.isLake || tile.type === 'LAKE') return 'LAKE';
    if (tile.isSea || tile.isOcean || tile.type === 'SEA' || tile.type === 'OCEAN') return 'SEA';
    return CELL_DEFINITIONS[tile.type] ? tile.type : 'PLAINS';
}

export function getCellDefinition(tile) {
    return CELL_DEFINITIONS[getCellTypeKey(tile)] || CELL_DEFINITIONS.PLAINS;
}

export function getCellEntryRule(tile, rules = {}) {
    const typeKey = getCellTypeKey(tile);
    const typeRule = rules.types?.[typeKey] || {};
    const cellKey = tile && Number.isInteger(tile.x) && Number.isInteger(tile.y) ? `${tile.x},${tile.y}` : '';
    const cellRule = cellKey ? rules.cells?.[cellKey] || {} : {};
    return {
        ...getCellDefinition(tile),
        ...typeRule,
        ...cellRule,
        requiredItems: Array.isArray(cellRule.requiredItems)
            ? cellRule.requiredItems
            : Array.isArray(typeRule.requiredItems)
                ? typeRule.requiredItems
                : getCellDefinition(tile).requiredItems
    };
}

export function canEnterCell(tile, { rules = {}, items = new Set() } = {}) {
    const rule = getCellEntryRule(tile, rules);
    if (rule.allowed === false) return false;
    const itemSet = items instanceof Set ? items : new Set(Array.isArray(items) ? items : Object.keys(items || {}));
    return rule.requiredItems.every((itemId) => itemSet.has(itemId));
}
