import { getCellTypeKey } from './cellRules.js';

const definitions = [
    ['foundation-cell', '基礎セル', 1, 1, 'foundation', 'foundation', 1],
    ['brick-tile', '真鍮縁どり赤煉瓦床タイル', 1, 1, 'tile-brick', 'tile', 1],
    ['concrete-tile', '青鋼コンクリートパネル', 1, 1, 'tile-concrete', 'tile', 1],
    ['grate-tile', '鋳鉄格子デッキ（メッシュ）', 1, 1, 'tile-grate', 'tile', 1],
    ['wood-tile', '銘木防水板仕上げ床', 1, 1, 'tile-wood', 'tile', 1],
    ['stone-tile', '玄武岩耐熱石畳', 1, 1, 'tile-stone', 'tile', 1],
    ['drain-tile', '陶器排水タイル', 1, 1, 'tile-drain', 'tile', 1],
    ['access-tile', '真鍮点検口付き舗装', 1, 1, 'tile-access', 'tile', 1],
    ['hearth-tile', '石炭炉前鋳鉄床', 1, 1, 'tile-hearth', 'tile', 1],
    ['rail-track', '直線線路', 1, 1, 'rail-straight', 'rail', 2],
    ['rail-curve', '曲線線路', 1, 1, 'rail-curve', 'rail', 2],
    ['rail-switch', '分岐線路', 1, 1, 'rail-switch', 'rail', 3],
    ['rail-signal', '信号付き直線線路', 1, 1, 'rail-signal', 'rail', 3],
    ['simple-furnace', '簡易炉', 1, 1, 'furnace', 'outpost'],
    ['simple-storage', '簡易ストレージ', 1, 1, 'storage', 'outpost'],
    ['hand-pump', '手回し式揚管ポンプ', 1, 1, 'pump', 'outpost'],
    ['pressure-gauge-tower', '圧力計ペデスタル塔', 1, 1, 'gauge', 'outpost'],
    ['fog-vent', '霧よけスチームベント', 1, 1, 'vent', 'outpost'],
    ['gear-forge', '歯車生成炉', 2, 2, 'forge', 'outpost'],
    ['steam-fountain', '真鍮噴水 / スチームファンテン', 2, 2, 'fountain', 'outpost'],
    ['warehouse', 'ストレージ倉庫', 2, 2, 'storage', 'outpost'],
    ['craft-bench', '手鋸・細工作業台', 2, 2, 'workshop', 'outpost'],
    ['drying-rack', '木材乾燥棚', 2, 2, 'workshop', 'outpost'],
    ['charcoal-kiln', '炭焼き窯', 2, 2, 'furnace', 'outpost'],
    ['fog-cistern', '霧水貯蔵槽', 2, 2, 'tank', 'outpost'],
    ['boiler-forge', '炉', 3, 3, 'boiler', 'production'],
    ['ore-washer', '水洗選鉱プラント', 3, 3, 'washer', 'production'],
    ['ceramic-kiln', '耐熱ガラス・陶器窯', 3, 3, 'furnace', 'production'],
    ['water-tower', '蒸気揚水・濾過タワー', 3, 3, 'tower', 'production'],
    ['machine-lathe', '蒸気駆動機械旋盤所', 4, 4, 'workshop', 'production'],
    ['alchemical-distillery', '蒸気式錬金蒸留プラント', 4, 4, 'distillery', 'production'],
    ['rail-freight-station', '蒸気軌道貨物ステーション', 4, 4, 'station', 'production'],
    ['steam-accumulator', '蒸気蓄圧器', 3, 3, 'tank', 'production'],
    ['resin-workshop', '樹脂パッキン加工所', 3, 3, 'workshop', 'production'],
    ['brass-workshop', '真鍮工房', 3, 2, 'workshop', 'production'],
    ['steam-tower', '蒸気炉塔', 2, 3, 'tower', 'production'],
    ['freight-platform', '貨物駅', 3, 2, 'station', 'production'],
    ['central-turbine', '中央蒸気タービン発電炉', 5, 5, 'turbine', 'automation'],
    ['difference-tower', '機械式階差演算タワー', 5, 5, 'difference', 'automation'],
    ['deep-drill', '巨大深部土壌掘削ドリル', 5, 5, 'drill', 'automation'],
    ['automaton-factory', 'オートマトン製造工場', 6, 6, 'automaton', 'automation'],
    ['airship-workshop', '開拓気球・軽飛空艇ドック', 6, 6, 'airship', 'automation'],
    ['settler-lodge', '生態系試験棟', 3, 3, 'lodge', 'automation'],
    ['council-hall', 'テラフォーミング管制棟', 7, 7, 'guild', 'mega'],
    ['relic-reactor', '古代遺物共振解読炉', 7, 7, 'relic', 'mega'],
    ['airship-dockyard', '大型飛空艇ドックヤード', 8, 8, 'airship', 'mega'],
    ['filter-tower', '環境浄化スチームタワー', 8, 8, 'filter', 'mega'],
    ['walking-city-frame', '移動都市用走行脚フレーム', 10, 10, 'walker', 'final'],
    ['geothermal-collector', '地熱ダイレクト蒸気コレクター', 12, 12, 'geothermal', 'final'],
    ['terraforming-dome', '新天地テラフォーミングドーム', 16, 16, 'dome', 'final'],
    ['steam-locomotive', '蒸気機関車', 1, 1, 'locomotive', 'rail'],
    ['ore-wagon', '鉱石貨車', 1, 1, 'ore-wagon', 'rail'],
    ['freight-wagon', '木箱貨車', 1, 1, 'freight-wagon', 'rail']
];

export const BUILDING_MATERIAL_COSTS_BY_ID = Object.freeze({
    'foundation-cell': [['limestone', 2], ['clay', 1], ['stone', 2]],
    'brick-tile': [['clay', 2], ['limestone', 1]],
    'concrete-tile': [['limestone', 2], ['iron-ore', 1]],
    'grate-tile': [['iron-plate', 2], ['steel-ingot', 1]],
    'wood-tile': [['sealed-board', 2], ['resin-lacquer', 1]],
    'stone-tile': [['pumice', 2], ['clay', 1]],
    'drain-tile': [['ceramic-body', 2]],
    'access-tile': [['iron-plate', 1], ['brass-sheet', 1]],
    'hearth-tile': [['steel-ingot', 1], ['ceramic-barrier', 1]],
    'rail-track': [['wood', 2], ['iron-plate', 2]],
    'rail-curve': [['wood', 2], ['iron-plate', 3]],
    'rail-switch': [['wood', 3], ['iron-plate', 4], ['iron-screw', 2]],
    'rail-signal': [['wood', 3], ['iron-plate', 2], ['brass-sheet', 1], ['pressure-gauge', 1]],
    'simple-furnace': [['clay', 3], ['limestone', 2], ['wood', 2]],
    'simple-storage': [['lumber', 4], ['rivet', 2]],
    'hand-pump': [['lumber', 2], ['crank-handle', 1], ['bronze-bearing', 1]],
    'pressure-gauge-tower': [['brass-sheet', 1], ['copper-capillary', 2], ['iron-plate', 1]],
    'fog-vent': [['steam-nozzle', 1], ['ceramic-barrier', 1], ['copper-capillary', 1]],
    'gear-forge': [['ceramic-crucible', 2], ['bronze-ingot', 3], ['steel-spring', 1]],
    'steam-fountain': [['brass-sheet', 3], ['lumber', 2], ['copper-capillary', 1]],
    warehouse: [['lumber', 8], ['rivet', 4], ['steel-ingot', 2]],
    'craft-bench': [['wood', 8]],
    'drying-rack': [['wood', 4], ['sealed-board', 2]],
    'charcoal-kiln': [['clay', 6], ['limestone', 4], ['lumber', 3]],
    'fog-cistern': [['sealed-board', 5], ['copper-capillary', 2], ['rivet', 4]],
    'boiler-forge': [['iron-ingot', 12], ['brass-stock', 8], ['clay', 12]],
    'ore-washer': [['iron-plate', 6], ['brass-stock', 3], ['sealed-board', 3]],
    'ceramic-kiln': [['steel-ingot', 5], ['clay', 8], ['sand', 5], ['limestone', 5]],
    'water-tower': [['lumber', 8], ['sealed-board', 6], ['filter-cartridge', 2], ['iron-plate', 4]],
    'machine-lathe': [['steel-ingot', 10], ['iron-plate', 8], ['brass-stock', 6]],
    'alchemical-distillery': [['glass-vial', 8], ['ceramic-barrier', 4], ['sealed-board', 6], ['copper-capillary', 4]],
    'rail-freight-station': [['steel-ingot', 8], ['lumber', 8], ['axle', 4], ['rail-track', 6]],
    'steam-accumulator': [['steel-ingot', 8], ['iron-plate', 6], ['ceramic-barrier', 4], ['pressure-case', 2]],
    'resin-workshop': [['sealed-board', 6], ['iron-plate', 4], ['copper-capillary', 2]],
    'brass-workshop': [['brass-stock', 8], ['lumber', 6], ['bronze-bearing', 3], ['iron-screw', 8]],
    'steam-tower': [['steel-ingot', 8], ['iron-plate', 6], ['copper-capillary', 4], ['ceramic-barrier', 2]],
    'freight-platform': [['lumber', 8], ['steel-ingot', 4], ['rail-track', 4], ['iron-screw', 6]],
    'central-turbine': [['steel-ingot', 24], ['bronze-bearing', 8], ['steel-spring', 6], ['ceramic-barrier', 8], ['copper-capillary', 6]],
    'difference-tower': [['brass-sheet', 12], ['bronze-bearing', 8], ['steel-spring', 4], ['pressure-diaphragm', 4], ['axle', 6]],
    'deep-drill': [['steel-ingot', 24], ['iron-plate', 16], ['obsidian', 6], ['axle', 6], ['steel-spring', 4]],
    'automaton-factory': [['steel-ingot', 20], ['steel-spring', 12], ['brass-sheet', 10], ['bronze-bearing', 8], ['relic-core', 1]],
    'airship-workshop': [['sealed-board', 12], ['lumber', 10], ['rope', 8], ['brass-sheet', 6], ['survey-kit', 1]],
    'settler-lodge': [['lumber', 20], ['sealed-board', 10], ['glass-blank', 6], ['herb-extract', 3], ['rivet', 12]],
    'council-hall': [['steel-ingot', 48], ['lumber', 30], ['sealed-board', 20], ['glass-blank', 16], ['iron-plate', 24]],
    'relic-reactor': [['relic-fragment', 12], ['navigation-crystal', 6], ['steel-ingot', 20], ['brass-sheet', 12]],
    'airship-dockyard': [['steel-ingot', 72], ['lumber', 48], ['sealed-board', 32], ['axle', 16], ['rope', 20]],
    'filter-tower': [['steel-ingot', 56], ['filter-cartridge', 20], ['ceramic-barrier', 16], ['copper-capillary', 12], ['brass-sheet', 10], ['tar', 12]],
    'walking-city-frame': [['steel-ingot', 80], ['iron-plate', 48], ['axle', 24], ['steel-spring', 24], ['bronze-bearing', 20]],
    'geothermal-collector': [['steel-ingot', 72], ['ceramic-barrier', 24], ['copper-capillary', 24], ['pressure-case', 8], ['mica-laminate', 12], ['steam-valve', 4], ['burner-cup', 4]],
    'terraforming-dome': [['steel-ingot', 120], ['glass-blank', 64], ['sealed-board', 48], ['filter-cartridge', 24], ['bronze-bearing', 16], ['climate-control-core', 1], ['closed-loop-unit', 1], ['ecosystem-starter', 1]],
    'steam-locomotive': [['steel-ingot', 10], ['steel-spring', 3], ['axle', 2], ['bronze-bearing', 2], ['brass-sheet', 2]],
    'ore-wagon': [['iron-plate', 4], ['axle', 2], ['lumber', 2]],
    'freight-wagon': [['lumber', 5], ['iron-plate', 2], ['axle', 2]]
});

const BUILDING_UTILITY_CONFIG_BY_ID = Object.freeze({
    'hand-pump': { ports: [{ resource: 'water', mode: 'output' }], rates: { waterOutputPerSecond: 1 } },
    'steam-fountain': { ports: [{ resource: 'water', mode: 'input' }] },
    'fog-cistern': { ports: [{ resource: 'water', mode: 'both' }], storageCapacity: { water: 100 } },
    'water-tower': { ports: [{ resource: 'water', mode: 'both' }] },
    'pressure-gauge-tower': { ports: [{ resource: 'steam', mode: 'input' }] },
    'fog-vent': { ports: [{ resource: 'steam', mode: 'input' }] },
    'boiler-forge': {
        ports: [{ resource: 'water', mode: 'input' }, { resource: 'steam', mode: 'output' }],
        rates: { waterInputPerSecond: 1, coalInputPerSecond: 0.1, steamOutputPerSecond: 1 }
    },
    'steam-accumulator': { ports: [{ resource: 'steam', mode: 'both' }], storageCapacity: { steam: 100 } },
    'steam-tower': { ports: [{ resource: 'steam', mode: 'both' }] },
    'central-turbine': { ports: [{ resource: 'steam', mode: 'input' }] },
    'geothermal-collector': { ports: [{ resource: 'steam', mode: 'output' }] }
});

const BUILDING_REQUIREMENTS_BY_ID = Object.freeze({
    'terraforming-dome': [
        'deep-drill',
        'geothermal-collector',
        'central-turbine',
        'relic-reactor',
        'difference-tower',
        'filter-tower',
        'settler-lodge',
        'council-hall'
    ]
});

const BUILDING_DESCRIPTIONS_BY_ID = Object.freeze({
    'simple-storage': '小型の物理資材庫。建築メニューから資材を預け入れ・取り出しできます。',
    warehouse: '大容量の物理資材庫。建築メニューから資材を預け入れ・取り出しできます。',
    'drying-rack': '木材を乾燥させ、製材板を作るための作業設備です。',
    'settler-lodge': 'ドームへ植生を定着させる生態系培地を準備します。',
    'council-hall': 'テラフォーミング設備を統括し、ドーム建設計画を管理する管制拠点です。'
});

export const BUILDING_DEFINITIONS = definitions.map(([id, name, width, height, kind, group, brassCost, tileEffects = []]) => {
    const role = group === 'foundation' ? 'foundation'
        : group === 'tile' ? 'decoration'
            : group === 'rail' && ['locomotive', 'ore-wagon', 'freight-wagon'].includes(kind) ? 'vehicle'
                : group === 'rail' ? 'rail' : 'structure';
    return {
    id,
    name,
    width,
    height,
    kind,
    group,
    brassCost: brassCost ?? Math.max(1, Math.ceil((width + height) * 0.65)),
    materialCosts: BUILDING_MATERIAL_COSTS_BY_ID[id],
    role,
    blocksConstruction: role === 'structure' || role === 'rail' || role === 'vehicle',
    requiresFoundation: role === 'structure' && width * height >= 9,
    utilityPorts: (BUILDING_UTILITY_CONFIG_BY_ID[id]?.ports || []).map(port => ({ ...port })),
    utilityStorageCapacity: { ...(BUILDING_UTILITY_CONFIG_BY_ID[id]?.storageCapacity || {}) },
    utilityRates: { ...(BUILDING_UTILITY_CONFIG_BY_ID[id]?.rates || {}) },
    storageCapacity: id === 'simple-storage' ? 50 : id === 'warehouse' ? 300 : 0,
    requiredBuildings: [...(BUILDING_REQUIREMENTS_BY_ID[id] || [])],
    description: BUILDING_DESCRIPTIONS_BY_ID[id] || '',
    tileEffects: tileEffects.map(effect => ({ ...effect }))
    };
});

export const BUILDING_BY_ID = new Map(BUILDING_DEFINITIONS.map(building => [building.id, building]));

export function normalizeBuildingUtilityState(buildingId, savedState) {
    const building = BUILDING_BY_ID.get(buildingId);
    if (!building) return null;
    const capacities = building.utilityStorageCapacity;
    const needsCoalProgress = buildingId === 'boiler-forge';
    if (!Object.keys(capacities).length && !needsCoalProgress) return null;
    const saved = savedState?.version === 1 && savedState && typeof savedState === 'object' && !Array.isArray(savedState)
        ? savedState
        : {};
    const storedValues = saved.stored && typeof saved.stored === 'object' && !Array.isArray(saved.stored)
        ? saved.stored
        : {};
    const stored = Object.fromEntries(Object.entries(capacities).map(([resource, capacity]) => {
        const amount = Number(storedValues[resource]);
        return [resource, Number.isFinite(amount) ? Math.min(capacity, Math.max(0, amount)) : 0];
    }));
    const utilityState = { version: 1, stored };
    if (needsCoalProgress) {
        const coalBurnRemaining = Number(saved.coalBurnRemaining);
        utilityState.coalBurnRemaining = Number.isFinite(coalBurnRemaining) ? Math.min(10, Math.max(0, coalBurnRemaining)) : 0;
    }
    return utilityState;
}

export function canPlaceBuildingOnTerrainCell(building, tile) {
    if (!tile) return false;
    const type = getCellTypeKey(tile);
    if (building?.role === 'rail') return type !== 'SEA' && type !== 'LAKE';
    return tile.isLand !== false && !tile.isSea && !tile.isLake && !tile.isOcean && !tile.isRuin
        && !['SEA', 'LAKE', 'RUIN'].includes(type);
}

const RAIL_CONNECTIONS = Object.freeze({
    'rail-straight': [[0, -1], [0, 1]],
    'rail-curve': [[0, -1], [1, 0]],
    'rail-switch': [[0, -1], [1, 0], [0, 1], [-1, 0]],
    'rail-signal': [[0, -1], [0, 1]]
});

export function getRailConnections(kind, rotation = 0) {
    return (RAIL_CONNECTIONS[kind] || []).map(([dx, dy]) => {
        for (let turn = 0; turn < rotation % 4; turn++) [dx, dy] = [-dy, dx];
        return [dx, dy];
    });
}

export function getRailAutoRotation(building, x, y, placedBuildings) {
    if (building?.role !== 'rail') return 0;
    const railsByPosition = new Map(placedBuildings
        .filter(placed => BUILDING_BY_ID.get(placed.id)?.role === 'rail')
        .map(placed => [`${placed.x},${placed.y}`, placed]));
    let bestRotation = 0;
    let bestScore = 0;
    for (let rotation = 0; rotation < 4; rotation++) {
        const score = getRailConnections(building.kind, rotation).filter(([dx, dy]) => {
            const neighbor = railsByPosition.get(`${x + dx},${y + dy}`);
            const neighborBuilding = BUILDING_BY_ID.get(neighbor?.id);
            return neighborBuilding && getRailConnections(neighborBuilding.kind, neighbor.rotation || 0)
                .some(([neighborDx, neighborDy]) => neighborDx === -dx && neighborDy === -dy);
        }).length;
        if (score > bestScore) {
            bestRotation = rotation;
            bestScore = score;
        }
    }
    return bestRotation;
}

export function getVehicleRailRotation(building, x, y, placedBuildings) {
    if (building?.role !== 'vehicle') return 0;
    const rail = placedBuildings.find(placed => placed.x === x && placed.y === y
        && BUILDING_BY_ID.get(placed.id)?.role === 'rail');
    return Number(rail?.rotation) || 0;
}

const buildingIconImages = new Map();
const vehicleSideIconImages = new Map();
const VEHICLE_SIDE_ICON_IDS = Object.freeze({
    'steam-locomotive': 'vehicle-steam-locomotive-side',
    'ore-wagon': 'vehicle-ore-wagon-side',
    'freight-wagon': 'vehicle-freight-wagon-side'
});
const buildingIconLoadPromises = new Map();
let buildingIconSpritePromise = null;
let vehicleSideIconSpritePromise = null;

function loadBuildingIconSprite() {
    if (!buildingIconSpritePromise) {
        buildingIconSpritePromise = (async () => {
        const response = await fetch(new URL('../assets/building-icons.svg', import.meta.url));
        if (!response.ok) throw new Error(`Building icon sprite failed: ${response.status}`);
        const sprite = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
        if (sprite.querySelector('parsererror')) throw new Error('Building icon sprite is invalid SVG.');
        const definitions = sprite.querySelector('svg > defs');
        const sharedSymbols = [...(definitions?.children || [])]
            .filter(symbol => !symbol.id?.startsWith('building-'))
            .map(symbol => symbol.outerHTML)
            .join('');
        return { sprite, sharedSymbols };
        })().catch(error => {
            buildingIconSpritePromise = null;
            throw error;
        });
    }
    return buildingIconSpritePromise;
}

function loadVehicleSideIconSprite() {
    if (!vehicleSideIconSpritePromise) {
        vehicleSideIconSpritePromise = (async () => {
            const response = await fetch(new URL('../assets/vehicle-side-icons.svg', import.meta.url));
            if (!response.ok) throw new Error(`Vehicle side icon sprite failed: ${response.status}`);
            const sprite = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
            if (sprite.querySelector('parsererror')) throw new Error('Vehicle side icon sprite is invalid SVG.');
            return sprite;
        })().catch(error => {
            vehicleSideIconSpritePromise = null;
            throw error;
        });
    }
    return vehicleSideIconSpritePromise;
}

async function loadIconImage(svg) {
    const objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const image = new Image();
    image.src = objectUrl;
    try {
        await image.decode();
        return image;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

export function loadBuildingIconImages(buildingIds = BUILDING_DEFINITIONS.map(building => building.id)) {
    const requestedBuildings = BUILDING_DEFINITIONS.filter(building => buildingIds.includes(building.id));
    const pending = requestedBuildings.map(building => {
        if (buildingIconImages.has(building.id)) return Promise.resolve();
        const existing = buildingIconLoadPromises.get(building.id);
        if (existing) return existing;

        const promise = (async () => {
            const { sprite, sharedSymbols } = await loadBuildingIconSprite();
            const symbol = sprite.getElementById(`building-${building.id}`);
            if (symbol) {
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${symbol.getAttribute('viewBox')}" preserveAspectRatio="none"><defs>${sharedSymbols}</defs>${symbol.innerHTML}</svg>`;
                buildingIconImages.set(building.id, await loadIconImage(svg));
            }
            const sideSymbolId = VEHICLE_SIDE_ICON_IDS[building.id];
            if (sideSymbolId) {
                try {
                    const sideSprite = await loadVehicleSideIconSprite();
                    const sideSymbol = sideSprite.getElementById(sideSymbolId);
                    if (sideSymbol) {
                        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${sideSymbol.getAttribute('viewBox')}">${sideSymbol.innerHTML}</svg>`;
                        vehicleSideIconImages.set(building.id, await loadIconImage(svg));
                    }
                } catch (error) {
                    console.warn('Vehicle side icon atlas failed to load; using front icons for all directions.', error);
                }
            }
        })().finally(() => buildingIconLoadPromises.delete(building.id));
        buildingIconLoadPromises.set(building.id, promise);
        return promise;
    });
    return Promise.all(pending).then(() => buildingIconImages.size + vehicleSideIconImages.size);
}

export function getTileEffectsUnderFootprint(placedItems, x, y, width, height) {
    const effects = [];
    placedItems.forEach(placed => {
        const definition = BUILDING_BY_ID.get(placed.id);
        if (definition?.role !== 'decoration' || !definition.tileEffects.length) return;
        if (placed.x < x || placed.y < y || placed.x >= x + width || placed.y >= y + height) return;
        definition.tileEffects.forEach(effect => effects.push({ ...effect, tileId: placed.id, x: placed.x, y: placed.y }));
    });
    return effects;
}

function getBuildingUtilityGraph(placedBuildings) {
    const utilityBuildings = placedBuildings.flatMap(placed => {
        const definition = BUILDING_BY_ID.get(placed.id);
        const ports = definition?.utilityPorts || [];
        return ports.length && typeof placed.instanceId === 'string' ? [{ placed, definition, ports }] : [];
    });
    const utilityBuildingsById = new Map(utilityBuildings.map(building => [building.placed.instanceId, building]));
    const graph = new Map(utilityBuildings.map(({ placed }) => [placed.instanceId, new Map()]));
    const canSend = mode => mode !== 'input';
    const canReceive = mode => mode !== 'output';

    for (let firstIndex = 0; firstIndex < utilityBuildings.length; firstIndex++) {
        const first = utilityBuildings[firstIndex];
        for (let secondIndex = firstIndex + 1; secondIndex < utilityBuildings.length; secondIndex++) {
            const second = utilityBuildings[secondIndex];
            const horizontalOverlap = Math.max(first.placed.y, second.placed.y)
                < Math.min(first.placed.y + first.definition.height, second.placed.y + second.definition.height);
            const verticalOverlap = Math.max(first.placed.x, second.placed.x)
                < Math.min(first.placed.x + first.definition.width, second.placed.x + second.definition.width);
            const touchesSide = (first.placed.x + first.definition.width === second.placed.x
                || second.placed.x + second.definition.width === first.placed.x) && horizontalOverlap;
            const touchesEnd = (first.placed.y + first.definition.height === second.placed.y
                || second.placed.y + second.definition.height === first.placed.y) && verticalOverlap;
            if (!touchesSide && !touchesEnd) continue;

            const connectedResources = new Set();
            first.ports.forEach(firstPort => second.ports.forEach(secondPort => {
                if (firstPort.resource !== secondPort.resource) return;
                const canConnect = canSend(firstPort.mode) && canReceive(secondPort.mode)
                    || canSend(secondPort.mode) && canReceive(firstPort.mode);
                if (canConnect) connectedResources.add(firstPort.resource);
            }));
            connectedResources.forEach(resource => {
                for (const [sourceId, targetId] of [[first.placed.instanceId, second.placed.instanceId], [second.placed.instanceId, first.placed.instanceId]]) {
                    const neighborsByResource = graph.get(sourceId);
                    if (!neighborsByResource.has(resource)) neighborsByResource.set(resource, new Set());
                    neighborsByResource.get(resource).add(targetId);
                }
            });
        }
    }
    return { utilityBuildingsById, graph };
}

export function getBuildingUtilityConnections(placedBuildings) {
    const { graph } = getBuildingUtilityGraph(placedBuildings);
    return new Map([...graph].map(([instanceId, neighborsByResource]) => [instanceId, new Set(neighborsByResource.keys())]));
}

export function getBuildingUtilityNetworkComponents(placedBuildings) {
    const { utilityBuildingsById, graph } = getBuildingUtilityGraph(placedBuildings);
    const resources = new Set([...graph.values()].flatMap(neighborsByResource => [...neighborsByResource.keys()]));
    const components = [];

    resources.forEach(resource => {
        const visited = new Set();
        graph.forEach((neighborsByResource, instanceId) => {
            if (visited.has(instanceId) || !neighborsByResource.has(resource)) return;
            const pending = [instanceId];
            const componentIds = [];
            visited.add(instanceId);
            while (pending.length) {
                const currentId = pending.pop();
                componentIds.push(currentId);
                (graph.get(currentId).get(resource) || []).forEach(neighborId => {
                    if (visited.has(neighborId)) return;
                    visited.add(neighborId);
                    pending.push(neighborId);
                });
            }
            components.push({
                resource,
                buildings: componentIds.map(id => utilityBuildingsById.get(id))
            });
        });
    });
    return components;
}

function path(ctx, points, fill, stroke = '#26332d', lineWidth = 1) {
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }
}

function gear(ctx, x, y, radius, teeth, fill) {
    const points = [];
    for (let tooth = 0; tooth < teeth; tooth++) {
        const angle = tooth * Math.PI * 2 / teeth;
        for (const [offset, size] of [[-.5, .72], [-.28, .72], [-.28, 1], [.28, 1], [.28, .72], [.5, .72]]) {
            const theta = angle + offset * Math.PI * 2 / teeth;
            points.push([x + Math.cos(theta) * radius * size, y + Math.sin(theta) * radius * size]);
        }
    }
    path(ctx, points, fill, '#26332d', Math.max(1, radius * .08));
    ctx.beginPath();
    ctx.arc(x, y, radius * .27, 0, Math.PI * 2);
    ctx.fillStyle = '#33473d';
    ctx.fill();
    ctx.strokeStyle = '#e1c36c';
    ctx.lineWidth = Math.max(1, radius * .08);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, radius * .08, 0, Math.PI * 2);
    ctx.fillStyle = '#e1c36c';
    ctx.fill();
}

function drawGauge(ctx, x, y, radius) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#d7cfad';
    ctx.fill();
    ctx.strokeStyle = '#714c31';
    ctx.lineWidth = Math.max(1.4, radius * .15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + radius * .52, y - radius * .54);
    ctx.strokeStyle = '#a94435';
    ctx.lineWidth = Math.max(1, radius * .1);
    ctx.stroke();
}

function drawInvalidGhostOverlay(ctx, x, y, width, height, detail, ghost, valid) {
    if (!ghost || valid) return;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 27, 42, 0.68)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#ff1e32';
    ctx.lineWidth = Math.max(4, detail * 3.2);
    ctx.setLineDash([Math.max(5, detail * 4), Math.max(3, detail * 2)]);
    ctx.strokeRect(x + detail, y + detail, width - detail * 2, height - detail * 2);
    ctx.setLineDash([]);
    ctx.restore();
}

export function drawBuilding(ctx, building, tileSize, { ghost = false, valid = true, zoom = 1 } = {}) {
    const x = building.x * tileSize;
    const y = building.y * tileSize;
    const width = building.width * tileSize;
    const height = building.height * tileSize;
    const pad = Math.max(1.5, Math.min(width, height) * .07);
    const accent = building.kind === 'relic' || building.kind === 'dome' ? '#83bdb0' : '#d5ad59';
    const steel = '#586d62';
    const brass = '#a87542';
    const wall = '#624a36';
    const detail = Math.max(1, Math.min(width, height) * .025);
    const centerX = x + width / 2;
    const floorY = y + height - pad;
    const upperY = y + pad;
    const bodyTop = y + height * .28;
    const bodyBottom = y + height * .82;
    const bodyLeft = x + width * .18;
    const bodyRight = x + width * .82;

    const vehicleRotation = ((Number(building.rotation) || 0) % 4 + 4) % 4;
    const approvedIcon = buildingIconImages.get(building.id);
    if (approvedIcon) {
        ctx.save();
        ctx.globalAlpha = ghost ? .68 : 1;
        if (building.role === 'vehicle') {
            const lowerQuarter = Math.floor(vehicleRotation);
            const blend = vehicleRotation - lowerQuarter;
            const upperQuarter = (lowerQuarter + 1) % 4;
            const iconForQuarter = quarter => quarter % 2 === 1
                ? vehicleSideIconImages.get(building.id) || approvedIcon
                : approvedIcon;
            ctx.globalAlpha *= 1 - blend;
            drawVehicleIcon(ctx, iconForQuarter(lowerQuarter), x, y, width, height, centerX, y + height / 2, lowerQuarter, vehicleRotation);
            if (blend > 0) {
                ctx.globalAlpha = (ghost ? .68 : 1) * blend;
                drawVehicleIcon(ctx, iconForQuarter(upperQuarter), x, y, width, height, centerX, y + height / 2, upperQuarter, vehicleRotation);
            }
            ctx.restore();
            if (ghost && !valid) drawInvalidGhostOverlay(ctx, x, y, width, height, detail, ghost, valid);
            else if (ghost) {
                ctx.save();
                ctx.strokeStyle = '#91e1ba';
                ctx.lineWidth = Math.max(1.5, detail * 1.6);
                ctx.setLineDash([Math.max(3, tileSize * .15), Math.max(2, tileSize * .1)]);
                ctx.strokeRect(x + pad, y + pad, width - pad * 2, height - pad * 2);
                ctx.setLineDash([]);
                ctx.restore();
            }
            return;
        }
        if (building.role === 'rail' && building.rotation) {
            ctx.translate(centerX, y + height / 2);
            ctx.rotate((building.rotation % 4) * Math.PI / 2);
            ctx.translate(-centerX, -(y + height / 2));
        }
        ctx.drawImage(approvedIcon, x, y, width, height);
        ctx.restore();
        if (ghost && !valid) {
            drawInvalidGhostOverlay(ctx, x, y, width, height, detail, ghost, valid);
        } else if (ghost) {
            ctx.save();
            ctx.strokeStyle = '#91e1ba';
            ctx.lineWidth = Math.max(1.5, detail * 1.6);
            ctx.setLineDash([Math.max(3, tileSize * .15), Math.max(2, tileSize * .1)]);
            ctx.strokeRect(x + pad, y + pad, width - pad * 2, height - pad * 2);
            ctx.setLineDash([]);
            ctx.restore();
        }
        return;
    }

    if (building.role === 'foundation' || building.role === 'decoration') {
        const tileColors = {
            foundation: ['#6d7775', '#c0c5b8'],
            'tile-brick': ['#96523c', '#d6b45e'],
            'tile-concrete': ['#657875', '#a7b7ae'],
            'tile-grate': ['#45544f', '#c3ab6c'],
            'tile-wood': ['#815b3a', '#d2b46a'],
            'tile-stone': ['#736b60', '#c1b595'],
            'tile-drain': ['#788a82', '#c2d0c4'],
            'tile-access': ['#52635c', '#ddbd66'],
            'tile-hearth': ['#444b48', '#c68a5a']
        }[building.kind] || ['#68756f', '#c4ad68'];
        ctx.save();
        ctx.globalAlpha = ghost ? .58 : .88;
        ctx.fillStyle = tileColors[0];
        ctx.fillRect(x + pad * .2, y + pad * .2, width - pad * .4, height - pad * .4);
        ctx.strokeStyle = tileColors[1];
        ctx.lineWidth = Math.max(1, detail * .8);
        ctx.strokeRect(x + pad * .2, y + pad * .2, width - pad * .4, height - pad * .4);
        if (building.kind === 'tile-grate' || building.kind === 'tile-wood') {
            for (let index = 1; index < 4; index++) {
                const lineX = x + width * index / 4;
                ctx.beginPath();
                ctx.moveTo(lineX, y + pad);
                ctx.lineTo(lineX, y + height - pad);
                ctx.stroke();
            }
        } else if (building.kind === 'tile-drain') {
            ctx.fillStyle = '#26362f';
            ctx.fillRect(x + width * .35, y + height * .35, width * .3, height * .3);
            ctx.beginPath();
            ctx.moveTo(x + width * .4, y + height * .4);
            ctx.lineTo(x + width * .6, y + height * .6);
            ctx.moveTo(x + width * .6, y + height * .4);
            ctx.lineTo(x + width * .4, y + height * .6);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(x + pad, y + height / 2);
            ctx.lineTo(x + width - pad, y + height / 2);
            ctx.moveTo(x + width / 2, y + pad);
            ctx.lineTo(x + width / 2, y + height - pad);
            ctx.stroke();
        }
        ctx.restore();
        drawInvalidGhostOverlay(ctx, x, y, width, height, detail, ghost, valid);
        return;
    }

    if (building.role === 'rail') {
        ctx.save();
        ctx.globalAlpha = ghost ? .58 : 1;
        ctx.translate(centerX, y + height / 2);
        ctx.rotate(((Number(building.rotation) || 0) % 4) * Math.PI / 2);
        ctx.translate(-centerX, -(y + height / 2));
        const railWidth = Math.max(2, Math.min(width, height) * .1);
        const trackBedWidth = Math.min(10, Math.min(width, height) * .3125);
        const sleeperThickness = Math.max(2.5, railWidth * .95);
        const drawTrackBed = drawPath => {
            ctx.beginPath();
            drawPath();
            ctx.strokeStyle = '#51483a';
            ctx.lineWidth = trackBedWidth + 1.5;
            ctx.lineCap = 'butt';
            ctx.stroke();
            ctx.strokeStyle = '#78694e';
            ctx.lineWidth = trackBedWidth;
            ctx.stroke();
            ctx.strokeStyle = 'rgba(205, 181, 137, .72)';
            ctx.lineWidth = Math.max(.7, trackBedWidth * .07);
            ctx.stroke();
        };
        const drawRail = drawPath => {
            ctx.beginPath();
            drawPath();
            ctx.strokeStyle = '#303632';
            ctx.lineWidth = railWidth * 1.8;
            ctx.lineCap = 'round';
            ctx.stroke();
            ctx.strokeStyle = '#7b8580';
            ctx.lineWidth = railWidth * 1.35;
            ctx.stroke();
            ctx.strokeStyle = '#d2d6cb';
            ctx.lineWidth = railWidth * .78;
            ctx.stroke();
            ctx.strokeStyle = '#f4efd9';
            ctx.lineWidth = Math.max(.65, railWidth * .12);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(54, 64, 58, .72)';
            ctx.lineWidth = Math.max(.55, railWidth * .09);
            ctx.stroke();
        };
        const drawSleeper = (sleeperX, sleeperY, length, angle) => {
            ctx.save();
            ctx.translate(sleeperX, sleeperY);
            ctx.rotate(angle);
            const halfLength = length / 2;
            const halfThickness = sleeperThickness / 2;
            ctx.fillStyle = 'rgba(34, 29, 22, .48)';
            ctx.fillRect(-halfLength + 1, -halfThickness + 1, length, sleeperThickness);
            const grain = ctx.createLinearGradient(0, -halfThickness, 0, halfThickness);
            grain.addColorStop(0, '#c9a471');
            grain.addColorStop(.2, '#9a754d');
            grain.addColorStop(.72, '#79583a');
            grain.addColorStop(1, '#59402e');
            ctx.fillStyle = grain;
            ctx.fillRect(-halfLength, -halfThickness, length, sleeperThickness);
            ctx.strokeStyle = 'rgba(231, 200, 151, .76)';
            ctx.lineWidth = .7;
            ctx.beginPath();
            ctx.moveTo(-halfLength + 1, -halfThickness + .5);
            ctx.lineTo(halfLength - 1, -halfThickness + .5);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(55, 39, 28, .8)';
            ctx.lineWidth = .55;
            ctx.beginPath();
            ctx.moveTo(-halfLength * .55, 0);
            ctx.lineTo(halfLength * .45, 0);
            ctx.stroke();
            ctx.restore();
        };
        const drawTiePlate = (plateX, plateY, horizontalRail, angle = 0) => {
            ctx.save();
            ctx.translate(plateX, plateY);
            ctx.rotate(angle);
            const plateWidth = railWidth * 1.45;
            const plateHeight = railWidth * 1.3;
            ctx.fillStyle = '#45463f';
            ctx.fillRect(-plateWidth / 2, -plateHeight / 2, plateWidth, plateHeight);
            ctx.fillStyle = '#a7a18d';
            ctx.fillRect(-plateWidth * .36, -plateHeight * .32, plateWidth * .72, plateHeight * .42);
            for (const direction of [-1, 1]) {
                const boltX = horizontalRail ? 0 : direction * plateWidth * .34;
                const boltY = horizontalRail ? direction * plateHeight * .34 : 0;
                ctx.beginPath();
                ctx.arc(boltX, boltY, Math.max(.4, railWidth * .1), 0, Math.PI * 2);
                ctx.fillStyle = '#e8d8b7';
                ctx.fill();
            }
            ctx.restore();
        };
        const drawHorizontalTrack = () => {
            const railYs = [y + height * .3125, y + height * .6875];
            railYs.forEach(railY => drawTrackBed(() => { ctx.moveTo(x, railY); ctx.lineTo(x + width, railY); }));
            for (let sleeperX = x + 8; sleeperX <= x + width - 8; sleeperX += 12) {
                drawSleeper(sleeperX, y + height / 2, height * .875, Math.PI / 2);
                railYs.forEach(railY => drawTiePlate(sleeperX, railY, true));
            }
            railYs.forEach(railY => {
                drawRail(() => { ctx.moveTo(x, railY); ctx.lineTo(x + width, railY); });
            });
        };
        const drawVerticalTrack = () => {
            const railXs = [x + width * .3125, x + width * .6875];
            railXs.forEach(railX => drawTrackBed(() => { ctx.moveTo(railX, y); ctx.lineTo(railX, y + height); }));
            for (let sleeperY = y + 8; sleeperY <= y + height - 8; sleeperY += 12) {
                drawSleeper(x + width / 2, sleeperY, width * .875, 0);
                railXs.forEach(railX => drawTiePlate(railX, sleeperY, false));
            }
            railXs.forEach(railX => {
                drawRail(() => { ctx.moveTo(railX, y); ctx.lineTo(railX, y + height); });
            });
        };
        if (building.kind === 'rail-curve') {
            const curves = [
                [
                    { x: x + width * .3125, y },
                    { x: x + width * .3125, y: y + height * .5 },
                    { x: x + width * .5, y: y + height * .6875 },
                    { x: x + width, y: y + height * .6875 }
                ],
                [
                    { x: x + width * .6875, y },
                    { x: x + width * .6875, y: y + height * .3 },
                    { x: x + width * .88, y: y + height * .3125 },
                    { x: x + width, y: y + height * .3125 }
                ]
            ];
            const drawCurvePath = points => {
                ctx.moveTo(points[0].x, points[0].y);
                ctx.bezierCurveTo(points[1].x, points[1].y, points[2].x, points[2].y, points[3].x, points[3].y);
            };
            curves.forEach(points => drawTrackBed(() => drawCurvePath(points)));
            const getCurvePoint = (points, progress) => {
                const inverse = 1 - progress;
                return {
                    x: inverse ** 3 * points[0].x + 3 * inverse ** 2 * progress * points[1].x + 3 * inverse * progress ** 2 * points[2].x + progress ** 3 * points[3].x,
                    y: inverse ** 3 * points[0].y + 3 * inverse ** 2 * progress * points[1].y + 3 * inverse * progress ** 2 * points[2].y + progress ** 3 * points[3].y
                };
            };
            const getCurveTangent = (points, progress) => {
                const inverse = 1 - progress;
                return {
                    x: 3 * inverse ** 2 * (points[1].x - points[0].x) + 6 * inverse * progress * (points[2].x - points[1].x) + 3 * progress ** 2 * (points[3].x - points[2].x),
                    y: 3 * inverse ** 2 * (points[1].y - points[0].y) + 6 * inverse * progress * (points[2].y - points[1].y) + 3 * progress ** 2 * (points[3].y - points[2].y)
                };
            };
            for (const progress of [.25, .5, .75]) {
                const firstRailPoint = getCurvePoint(curves[0], progress);
                const secondRailPoint = getCurvePoint(curves[1], progress);
                const firstTangent = getCurveTangent(curves[0], progress);
                const secondTangent = getCurveTangent(curves[1], progress);
                const centerX = (firstRailPoint.x + secondRailPoint.x) / 2;
                const centerY = (firstRailPoint.y + secondRailPoint.y) / 2;
                const railAngle = Math.atan2(firstTangent.y + secondTangent.y, firstTangent.x + secondTangent.x);
                const sleeperAngle = railAngle + Math.PI / 2;
                const halfGauge = Math.min(width, height) * .1875;
                const sleeperLength = Math.min(Math.min(width, height) * .875, halfGauge * 2 + 16);
                drawSleeper(centerX, centerY, sleeperLength, sleeperAngle);
                const normalX = Math.cos(sleeperAngle) * halfGauge;
                const normalY = Math.sin(sleeperAngle) * halfGauge;
                drawTiePlate(centerX - normalX, centerY - normalY, true, railAngle);
                drawTiePlate(centerX + normalX, centerY + normalY, true, railAngle);
            }
            curves.forEach(points => drawRail(() => drawCurvePath(points)));
        } else if (building.kind === 'rail-switch') {
            drawHorizontalTrack();
            drawVerticalTrack();
            const direction = Number(building.rotation) % 4;
            const arrowAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
            const angle = arrowAngles[direction] || 0;
            const arrowCenterX = x + width / 2;
            const arrowCenterY = y + height / 2;
            ctx.save();
            ctx.translate(arrowCenterX, arrowCenterY);
            ctx.rotate(angle);
            ctx.fillStyle = '#f0c65e';
            ctx.strokeStyle = '#4b3924';
            ctx.lineWidth = Math.max(1, railWidth * .2);
            ctx.beginPath();
            ctx.moveTo(width * .27, 0);
            ctx.lineTo(width * .08, -height * .12);
            ctx.lineTo(width * .08, -height * .045);
            ctx.lineTo(-width * .12, -height * .045);
            ctx.lineTo(-width * .12, height * .045);
            ctx.lineTo(width * .08, height * .045);
            ctx.lineTo(width * .08, height * .12);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        } else {
            drawVerticalTrack();
            if (building.kind === 'rail-signal') {
                const postX = x + width * .12;
                ctx.strokeStyle = '#825938';
                ctx.lineWidth = railWidth * .8;
                ctx.beginPath();
                ctx.moveTo(postX, y + height * .3);
                ctx.lineTo(postX, y + height * .06);
                ctx.stroke();
                ctx.fillStyle = '#a44a39';
                ctx.beginPath();
                ctx.arc(postX, y + height * .08, railWidth * .7, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#e2c16a';
                ctx.lineWidth = Math.max(1, railWidth * .18);
                ctx.stroke();
            }
        }
        ctx.restore();
        drawInvalidGhostOverlay(ctx, x, y, width, height, detail, ghost, valid);
        return;
    }

    ctx.save();
    ctx.globalAlpha = ghost ? .52 : 1;
    ctx.fillStyle = '#121a15';
    ctx.beginPath();
    ctx.ellipse(centerX, floorY, width * .47, Math.max(pad, height * .11), 0, 0, Math.PI * 2);
    ctx.fill();
    path(ctx, [[x + pad, floorY - pad * 1.5], [x + width - pad, floorY - pad * 1.5], [x + width - pad * .2, floorY], [x + pad * 1.5, floorY]], '#766044', '#d3b260', detail);

    if (building.kind === 'locomotive') {
        const wheelY = floorY - height * .15;
        const wheelRadius = Math.min(height * .13, width * .075);
        for (const wheelX of [x + width * .2, x + width * .42, x + width * .7]) {
            ctx.beginPath();
            ctx.arc(wheelX, wheelY, wheelRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#26342d';
            ctx.fill();
            ctx.strokeStyle = accent;
            ctx.lineWidth = Math.max(1.5, detail * 1.2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(wheelX, wheelY, wheelRadius * .27, 0, Math.PI * 2);
            ctx.fillStyle = '#d7b45c';
            ctx.fill();
        }
        path(ctx, [[x + width * .1, y + height * .42], [x + width * .68, y + height * .42], [x + width * .82, y + height * .58], [x + width * .82, wheelY], [x + width * .12, wheelY]], '#596f64', '#26332d', detail);
        ctx.beginPath();
        ctx.ellipse(x + width * .4, y + height * .43, width * .22, height * .17, 0, Math.PI, Math.PI * 2);
        ctx.fillStyle = '#b27640';
        ctx.fill();
        ctx.strokeStyle = '#edcd73';
        ctx.lineWidth = detail;
        ctx.stroke();
        path(ctx, [[x + width * .14, y + height * .39], [x + width * .58, y + height * .39], [x + width * .54, y + height * .59], [x + width * .14, y + height * .59]], '#a66d3f', '#26332d', detail);
        path(ctx, [[x + width * .68, y + height * .29], [x + width * .85, y + height * .29], [x + width * .85, y + height * .62], [x + width * .68, y + height * .62]], steel, '#26332d', detail);
        path(ctx, [[x + width * .26, y + height * .36], [x + width * .37, y + height * .36], [x + width * .37, y + height * .21], [x + width * .26, y + height * .21]], brass, '#26332d', detail);
        drawGauge(ctx, x + width * .75, y + height * .37, Math.max(2, Math.min(width, height) * .055));
        ctx.strokeStyle = '#dac16d';
        ctx.lineWidth = detail * 1.3;
        ctx.beginPath();
        ctx.moveTo(x + width * .14, y + height * .3);
        ctx.lineTo(x + width * .14, y + height * .18);
        ctx.lineTo(x + width * .23, y + height * .18);
        ctx.stroke();
    } else if (building.kind === 'ore-wagon' || building.kind === 'freight-wagon') {
        const wheelY = floorY - height * .16;
        for (const wheelX of [x + width * .2, x + width * .8]) {
            ctx.beginPath();
            ctx.arc(wheelX, wheelY, Math.max(2, height * .09), 0, Math.PI * 2);
            ctx.fillStyle = '#26342d';
            ctx.fill();
            ctx.strokeStyle = accent;
            ctx.lineWidth = detail;
            ctx.stroke();
        }
        path(ctx, [[x + width * .12, bodyTop], [x + width * .88, bodyTop], [x + width * .82, wheelY], [x + width * .18, wheelY]], '#53685d', '#26332d', detail);
        path(ctx, [[x + width * .2, bodyTop - pad], [x + width * .8, bodyTop - pad], [x + width * .74, bodyTop + height * .25], [x + width * .26, bodyTop + height * .25]], building.kind === 'ore-wagon' ? '#785d41' : '#90613c', '#d3b05d', detail);
        if (building.kind === 'ore-wagon') {
            for (let index = 0; index < 5; index++) {
                ctx.beginPath();
                ctx.arc(x + width * (.32 + index * .09), bodyTop + height * .07, Math.max(1.5, height * .045), 0, Math.PI * 2);
                ctx.fillStyle = ['#7b8279', '#a69474', '#4e5450'][index % 3];
                ctx.fill();
            }
        } else {
            for (let index = 0; index < 3; index++) {
                const crateX = x + width * (.27 + index * .2);
                ctx.fillStyle = '#a16e3e';
                ctx.fillRect(crateX, bodyTop, width * .17, height * .2);
                ctx.strokeStyle = '#e0c16c';
                ctx.lineWidth = detail * .7;
                ctx.strokeRect(crateX, bodyTop, width * .17, height * .2);
            }
        }
        ctx.strokeStyle = '#e0c16c';
        ctx.lineWidth = detail;
        ctx.beginPath();
        ctx.moveTo(x + width * .08, wheelY);
        ctx.lineTo(x + width * .92, wheelY);
        ctx.stroke();
    } else {
        path(ctx, [[bodyLeft, bodyTop], [bodyRight, bodyTop], [bodyRight, bodyBottom], [bodyLeft, bodyBottom]], wall, '#26332d', detail);
        path(ctx, [[bodyLeft - pad, bodyTop], [centerX, upperY], [bodyRight + pad, bodyTop]], building.kind === 'dome' ? '#5d8d83' : brass, '#e0bf68', detail);
        path(ctx, [[bodyLeft - pad * .3, bodyTop], [centerX, upperY + pad], [bodyRight + pad * .3, bodyTop]], steel, null);
        ctx.fillStyle = '#293c34';
        const windowCount = Math.max(1, Math.min(7, Math.floor(building.width / 2)));
        const windowWidth = (bodyRight - bodyLeft) / (windowCount * 2.5);
        for (let index = 0; index < windowCount; index++) {
            const windowX = bodyLeft + (index + .5) * (bodyRight - bodyLeft) / windowCount - windowWidth / 2;
            ctx.fillRect(windowX, bodyTop + height * .09, windowWidth, height * .13);
            ctx.strokeStyle = '#a8c4b5';
            ctx.lineWidth = detail * .6;
            ctx.strokeRect(windowX, bodyTop + height * .09, windowWidth, height * .13);
        }

        if (['furnace', 'forge', 'boiler', 'turbine', 'geothermal'].includes(building.kind)) {
            const furnaceX = centerX;
            const furnaceY = bodyBottom - height * .13;
            ctx.fillStyle = '#2b332d';
            ctx.fillRect(furnaceX - width * .12, furnaceY - height * .16, width * .24, height * .16);
            ctx.fillStyle = '#e17b42';
            ctx.beginPath();
            ctx.moveTo(furnaceX - width * .08, furnaceY);
            ctx.quadraticCurveTo(furnaceX - width * .1, furnaceY - height * .16, furnaceX, furnaceY - height * .12);
            ctx.quadraticCurveTo(furnaceX + width * .12, furnaceY - height * .04, furnaceX + width * .08, furnaceY);
            ctx.fill();
        }
        if (['tower', 'filter', 'dome', 'geothermal', 'difference', 'drill'].includes(building.kind)) {
            const towerWidth = Math.max(width * .13, pad * 2);
            path(ctx, [[centerX - towerWidth, bodyTop], [centerX + towerWidth, bodyTop], [centerX + towerWidth * .72, upperY], [centerX - towerWidth * .72, upperY]], steel, '#26332d', detail);
            ctx.strokeStyle = accent;
            ctx.lineWidth = detail;
            for (let tier = 1; tier <= 3; tier++) {
                const tierY = upperY + (bodyTop - upperY) * tier / 4;
                ctx.beginPath();
                ctx.moveTo(centerX - towerWidth * .8, tierY);
                ctx.lineTo(centerX + towerWidth * .8, tierY);
                ctx.stroke();
            }
            path(ctx, [[centerX - towerWidth, upperY + pad * .2], [centerX + towerWidth, upperY + pad * .2], [centerX + towerWidth * 1.25, upperY + pad * .8], [centerX - towerWidth * 1.25, upperY + pad * .8]], brass, '#26332d', detail);
        }
        if (['storage', 'tank', 'accumulator', 'washer'].includes(building.kind)) {
            ctx.beginPath();
            ctx.ellipse(centerX, bodyTop + height * .19, width * .22, height * .11, 0, 0, Math.PI * 2);
            ctx.fillStyle = '#6d8d80';
            ctx.fill();
            ctx.strokeStyle = '#d8b660';
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(centerX, bodyTop + height * .38, width * .22, height * .11, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        if (['workshop', 'distillery', 'station', 'airship', 'guild', 'lodge'].includes(building.kind)) {
            const doorWidth = Math.max(width * .15, pad * 2);
            ctx.fillStyle = '#26372f';
            ctx.fillRect(centerX - doorWidth / 2, bodyBottom - height * .2, doorWidth, height * .2);
            ctx.strokeStyle = accent;
            ctx.lineWidth = detail;
            ctx.strokeRect(centerX - doorWidth / 2, bodyBottom - height * .2, doorWidth, height * .2);
        }
        if (building.kind === 'dome') {
            ctx.beginPath();
            ctx.ellipse(centerX, bodyTop + height * .19, width * .26, height * .16, 0, Math.PI, Math.PI * 2);
            ctx.strokeStyle = '#d6e2d2';
            ctx.lineWidth = detail * 1.4;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(centerX, upperY + pad);
            ctx.lineTo(centerX, bodyBottom);
            ctx.stroke();
        }
        if (building.kind === 'airship') {
            ctx.beginPath();
            ctx.ellipse(centerX, bodyTop + height * .13, width * .2, height * .1, 0, 0, Math.PI * 2);
            ctx.fillStyle = '#b97049';
            ctx.fill();
            ctx.strokeStyle = '#e0c276';
            ctx.lineWidth = detail;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(centerX, bodyTop + height * .23);
            ctx.lineTo(centerX, bodyTop + height * .33);
            ctx.stroke();
        }
        if (building.kind === 'walker') {
            ctx.strokeStyle = brass;
            ctx.lineWidth = Math.max(2, width * .035);
            for (const side of [-1, 1]) {
                const legX = centerX + side * width * .24;
                ctx.beginPath();
                ctx.moveTo(legX, bodyBottom - height * .08);
                ctx.lineTo(legX + side * width * .1, floorY - pad * 1.5);
                ctx.lineTo(legX + side * width * .17, floorY - pad * .2);
                ctx.stroke();
            }
        }
        if (building.kind === 'drill') {
            path(ctx, [[centerX - width * .07, bodyBottom], [centerX + width * .07, bodyBottom], [centerX, floorY]], '#c78b49', '#e7c66d', detail);
        }

        const gearRadius = Math.max(2, Math.min(width, height) * .09);
        gear(ctx, bodyLeft + gearRadius * 1.35, bodyBottom - gearRadius * 1.35, gearRadius, 10, building.kind === 'relic' ? '#8ca99c' : brass);
        if (width > tileSize * 2.5) {
            gear(ctx, bodyRight - gearRadius * 1.35, bodyBottom - gearRadius * 1.35, gearRadius * .78, 9, steel);
        }
        if (['gauge', 'boiler', 'turbine', 'filter', 'geothermal'].includes(building.kind)) {
            drawGauge(ctx, bodyRight - pad * 2, bodyTop + height * .18, Math.max(2, Math.min(width, height) * .055));
        }
        if (['boiler', 'turbine', 'filter', 'geothermal'].includes(building.kind)) {
            const pipeX = bodyRight - pad * 1.5;
            ctx.strokeStyle = '#ba8245';
            ctx.lineWidth = Math.max(1.5, detail * 1.5);
            ctx.beginPath();
            ctx.moveTo(pipeX, bodyTop + height * .36);
            ctx.lineTo(pipeX + pad, bodyTop + height * .36);
            ctx.lineTo(pipeX + pad, upperY + pad * .5);
            ctx.stroke();
        }
    }

    drawInvalidGhostOverlay(ctx, x, y, width, height, detail, ghost, valid);
    ctx.strokeStyle = ghost ? (valid ? '#91e1ba' : '#ef6a5b') : accent;
    ctx.lineWidth = Math.max(1.5, detail * 1.6);
    ctx.setLineDash(ghost ? [Math.max(3, tileSize * .15), Math.max(2, tileSize * .1)] : []);
    ctx.strokeRect(x + pad, y + pad, width - pad * 2, height - pad * 2);
    ctx.setLineDash([]);
    ctx.restore();
}

function drawVehicleIcon(ctx, image, x, y, width, height, centerX, centerY, quarter, rotation) {
    const baseQuarter = quarter === 0 && rotation > 3 ? 4 : quarter;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((rotation - baseQuarter) * Math.PI / 2);
    if (quarter === 3) ctx.scale(-1, 1);
    ctx.translate(-centerX, -centerY);
    ctx.drawImage(image, x, y, width, height);
    ctx.restore();
}