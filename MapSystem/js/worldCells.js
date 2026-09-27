export const WORLD_CELL_TYPES = Object.freeze({
    SEA: { label: '海', color: '#1e4d6b', category: 'initial', collect: 'water' },
    LAKE: { label: '湖沼', color: '#3b82f6', category: 'initial', collect: 'water' },
    PLAINS: { label: '草原', color: '#8db87c', category: 'initial', collect: 'grain' },
    FOREST: { label: '森林', color: '#3e6b48', category: 'initial', collect: 'wood' },
    MOUNTAIN: { label: '山岳', color: '#746b60', category: 'initial', collect: 'stone' },
    SAND: { label: '砂地', color: '#d5bd8a', category: 'initial', collect: 'sand' },
    RUIN: { label: '古代遺跡', color: '#6f2c2c', category: 'initial', collect: 'relic_fragment' },
    IRON_VEIN: { label: '鉄鉱脈', color: '#59625f', category: 'direct', collect: 'iron_ore' },
    COPPER_VEIN: { label: '銅鉱脈', color: '#80533d', category: 'direct', collect: 'copper_ore' },
    COAL_SEAM: { label: '石炭層', color: '#414644', category: 'direct', collect: 'coal' },
    SULFUR_DEPOSIT: { label: '硫黄鉱床', color: '#776c36', category: 'direct', collect: 'sulfur' },
    CLAY_BED: { label: '粘土層', color: '#865e51', category: 'direct', collect: 'clay' },
    LIMESTONE: { label: '石灰岩層', color: '#827c68', category: 'direct', collect: 'limestone' },
    PEAT_BOG: { label: '泥炭地', color: '#584d38', category: 'direct', collect: 'peat' },
    SALT_MARSH: { label: '塩沼', color: '#63776e', category: 'direct', collect: 'salt' },
    OIL_SEEP: { label: '油浸地', color: '#42483e', category: 'direct', collect: 'tar' },
    TIN_VEIN: { label: '錫鉱脈', color: '#6b7770', category: 'item', collect: 'tin_ore' },
    ZINC_VEIN: { label: '亜鉛鉱脈', color: '#536b62', category: 'item', collect: 'zinc_ore' },
    CRYSTAL_VEIN: { label: '水晶脈', color: '#397783', category: 'item', collect: 'crystal_shard' },
    MYCELIUM: { label: '菌糸群落', color: '#756c5c', category: 'item', collect: 'spores' },
    HERB_FIELD: { label: '薬草地', color: '#5f824f', category: 'item', collect: 'herbs' },
    RESIN_FOREST: { label: '樹脂林', color: '#3e674a', category: 'item', collect: 'resin' },
    MACHINE_WRECK: { label: '機械の残骸', color: '#545d59', category: 'event', collect: 'salvage' },
    AIRSHIP_WRECK: { label: '飛行船の墜落跡', color: '#625949', category: 'event', collect: 'navigation_crystal' }
});

export const TERRAIN_TRANSFORM_RECIPES = Object.freeze({
    TIN_VEIN: { mining_sample: 1, coke: 1 },
    ZINC_VEIN: { tin_ore: 1, sulfur: 1, vein_mold: 1 },
    CRYSTAL_VEIN: { navigation_crystal: 1, salt: 1, limestone: 1 },
    MYCELIUM: { preserved_spores: 1, peat: 1 },
    HERB_FIELD: { ancient_seed: 1, mycelium_compost: 1 },
    RESIN_FOREST: { forest_seed: 1, mycelium_compost: 1 }
});

export const CELL_MATERIALS = Object.freeze({
    water: { label: '水', icon: '💧' },
    grain: { label: '穀物', icon: '🌾' },
    wood: { label: '木材', icon: '🪵' },
    stone: { label: '石材', icon: '◈' },
    sand: { label: '砂', icon: '⠿' },
    relic_fragment: { label: '古代遺物片', icon: '⚙' },
    iron_ore: { label: '鉄鉱石', icon: '◆' },
    copper_ore: { label: '銅鉱石', icon: '◆' },
    coal: { label: '石炭', icon: '⬟' },
    sulfur: { label: '硫黄', icon: '✦' },
    clay: { label: '粘土', icon: '●' },
    limestone: { label: '石灰石', icon: '▤' },
    peat: { label: '泥炭', icon: '▰' },
    salt: { label: '塩', icon: '◇' },
    tar: { label: 'タール', icon: '⬭' },
    tin_ore: { label: '錫鉱石', icon: '◆' },
    zinc_ore: { label: '亜鉛鉱石', icon: '◆' },
    crystal_shard: { label: '水晶片', icon: '♦' },
    spores: { label: '胞子', icon: '♧' },
    herbs: { label: '薬草', icon: '♣' },
    resin: { label: '樹脂', icon: '●' },
    salvage: { label: '部品くず', icon: '⚙' },
    mining_sample: { label: '採掘標本', icon: '▣' },
    coke: { label: 'コークス', icon: '⬟' },
    vein_mold: { label: '鉱脈型', icon: '⛭' },
    navigation_crystal: { label: '航法結晶片', icon: '◈' },
    preserved_spores: { label: '保存胞子', icon: '⚗' },
    mycelium_compost: { label: '菌糸堆肥', icon: '▰' },
    forest_seed: { label: '森林の種', icon: '♧' },
    ancient_seed: { label: '古種', icon: '❖' }
});

export const ACTIVE_SCROLL_TARGETS_KEY = 'fogsgear_active_scroll_targets';

export function cellChangesKey(seed) {
    return `fogsgear_world_cell_changes:${String(seed || '')}`;
}

export function readCellChanges(seed) {
    try {
        const changes = JSON.parse(localStorage.getItem(cellChangesKey(seed)) || '{}');
        return changes && typeof changes === 'object' && !Array.isArray(changes) ? changes : {};
    } catch (error) {
        return {};
    }
}

export function applyCellChanges(grid, seed) {
    const changes = readCellChanges(seed);
    Object.entries(changes).forEach(([key, change]) => {
        const [x, y] = key.split(',').map(Number);
        const tile = grid[y]?.[x];
        const definition = WORLD_CELL_TYPES[change?.type];
        if (!tile || !definition) return;
        tile.initialType = change.initialType || tile.initialType || tile.type;
        tile.type = change.type;
        tile.color = definition.color;
        tile.isSea = change.type === 'SEA';
        tile.isOcean = tile.isSea;
        tile.isLake = change.type === 'LAKE';
        tile.isLand = !tile.isSea && !tile.isLake;
        tile.isRuin = change.type === 'RUIN';
        tile.collectionCount = Number(change.collectionCount) || 0;
        tile.transformCount = Number(change.transformCount) || 0;
        tile.transformCount = Number(change.transformCount) || 0;
    });
    return changes;
}

export function saveCellChange(seed, x, y, change) {
    const changes = readCellChanges(seed);
    const key = `${x},${y}`;
    if (change.type === change.initialType && !change.collectionCount && !change.transformCount) delete changes[key];
    else changes[key] = change;
    localStorage.setItem(cellChangesKey(seed), JSON.stringify(changes));
    return changes;
}

export function chooseEraCellType(seed, x, y, count, initialType, currentType) {
    const regularTypes = Object.keys(WORLD_CELL_TYPES).filter(type => ['initial', 'direct', 'item'].includes(WORLD_CELL_TYPES[type].category) && type !== currentType);
    const eraTypes = Object.keys(WORLD_CELL_TYPES).filter(type => WORLD_CELL_TYPES[type].category === 'event');
    const options = initialType === 'RUIN' ? [...regularTypes, ...eraTypes.filter(type => type !== currentType)] : regularTypes;
    let hash = 2166136261;
    for (const character of `${seed}:${x}:${y}:${count}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    const index = (hash >>> 0) % options.length;
    return options[index];
}

export function getCellDrops(type, collectionCount = 0) {
    if (type === 'COAL_SEAM') return [collectionCount % 3 === 2 ? 'coke' : 'coal'];
    if (type === 'FOREST') return [collectionCount % 5 === 4 ? 'forest_seed' : 'wood'];
    if (type === 'MYCELIUM') return [collectionCount % 2 ? 'mycelium_compost' : 'spores'];
    if (type === 'MACHINE_WRECK') {
        return [['salvage', 'mining_sample', 'vein_mold'][collectionCount % 3]];
    }
    if (type === 'AIRSHIP_WRECK') {
        return [['navigation_crystal', 'preserved_spores', 'ancient_seed'][collectionCount % 3]];
    }
    const material = WORLD_CELL_TYPES[type]?.collect;
    return material ? [material] : [];
}