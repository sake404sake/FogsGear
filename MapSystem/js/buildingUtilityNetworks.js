import { BUILDING_BY_ID, getBuildingUtilityNetworkComponents } from './buildingData.js?v=23';

const UTILITY_EPSILON = 0.000001;

function getNetworkAmount(network, resource) {
    return network.buildings.reduce((total, { placed }) => total + (Number(placed.utilityState?.stored?.[resource]) || 0), 0);
}

function getNetworkCapacity(network, resource) {
    return network.buildings.reduce((total, { definition }) => total + (Number(definition.utilityStorageCapacity[resource]) || 0), 0);
}

export function getBuildingUtilityStatus(placedBuildings) {
    const statuses = new Map();
    placedBuildings.forEach(placed => {
        const definition = BUILDING_BY_ID.get(placed.id);
        if (!definition?.utilityPorts.length || typeof placed.instanceId !== 'string') return;
        statuses.set(placed.instanceId, new Map([...new Set(definition.utilityPorts.map(port => port.resource))]
            .map(resource => [resource, { connected: false, amount: 0, capacity: 0, pressure: null }])));
    });

    getBuildingUtilityNetworkComponents(placedBuildings).forEach(network => {
        const amount = getNetworkAmount(network, network.resource);
        const capacity = getNetworkCapacity(network, network.resource);
        const pressure = network.resource === 'steam' && capacity > 0
            ? Math.max(0, Math.min(100, Math.floor(amount / capacity * 100)))
            : null;
        network.buildings.forEach(({ placed }) => {
            const status = statuses.get(placed.instanceId)?.get(network.resource);
            if (!status) return;
            Object.assign(status, { connected: true, amount, capacity, pressure });
        });
    });
    return statuses;
}

function storeNetworkAmount(network, resource, amount) {
    let remaining = Math.max(0, Number(amount) || 0);
    let changed = false;
    const storageBuildings = network.buildings
        .filter(({ definition }) => Number(definition.utilityStorageCapacity[resource]) > 0)
        .sort((first, second) => first.placed.instanceId.localeCompare(second.placed.instanceId));

    storageBuildings.forEach(({ placed, definition }) => {
        const capacity = Number(definition.utilityStorageCapacity[resource]) || 0;
        const stored = placed.utilityState.stored;
        const nextAmount = Math.min(capacity, remaining);
        if (Math.abs((Number(stored[resource]) || 0) - nextAmount) > UTILITY_EPSILON) {
            stored[resource] = nextAmount;
            changed = true;
        }
        remaining -= nextAmount;
    });
    return changed;
}

function isWaterSource(tile) {
    return Boolean(tile && (tile.isSea || tile.isOcean || tile.isLake
        || tile.type === 'SEA' || tile.type === 'LAKE' || tile.type === 3));
}

function buildingTouchesWater(placed, definition, worldMap) {
    const left = placed.x;
    const top = placed.y;
    const right = left + definition.width - 1;
    const bottom = top + definition.height - 1;
    for (let column = left; column <= right; column++) {
        if (isWaterSource(worldMap[top - 1]?.[column]) || isWaterSource(worldMap[bottom + 1]?.[column])) return true;
    }
    for (let row = top; row <= bottom; row++) {
        if (isWaterSource(worldMap[row]?.[left - 1]) || isWaterSource(worldMap[row]?.[right + 1])) return true;
    }
    return false;
}

export function simulateBuildingUtilityNetworks(placedBuildings, worldMap, coalInventory, elapsedSeconds) {
    const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
    const networks = getBuildingUtilityNetworkComponents(placedBuildings);
    const networksByBuilding = new Map();
    networks.forEach(network => network.buildings.forEach(({ placed }) => {
        networksByBuilding.set(`${network.resource}:${placed.instanceId}`, network);
    }));
    let nextCoalInventory = Math.max(0, Number(coalInventory) || 0);
    let coalChanged = false;
    let stateChanged = false;
    const operationStatuses = new Map(placedBuildings
        .filter(placed => placed.id === 'boiler-forge')
        .map(placed => [placed.instanceId, '水網未接続']));
    operationStatuses.forEach((status, instanceId) => {
        if (networksByBuilding.has(`water:${instanceId}`)) operationStatuses.set(instanceId, '蒸気網未接続');
    });

    networks.filter(network => network.resource === 'water').forEach(waterNetwork => {
        let availableWater = getNetworkAmount(waterNetwork, 'water');
        waterNetwork.buildings.forEach(({ placed, definition }) => {
            const outputRate = Number(definition.utilityRates.waterOutputPerSecond) || 0;
            if (outputRate > 0 && buildingTouchesWater(placed, definition, worldMap)) availableWater += outputRate * elapsed;
        });

        const boilers = waterNetwork.buildings
            .filter(({ placed }) => placed.id === 'boiler-forge')
            .sort((first, second) => first.placed.instanceId.localeCompare(second.placed.instanceId));
        boilers.forEach(({ placed, definition }) => {
            const steamNetwork = networksByBuilding.get(`steam:${placed.instanceId}`);
            if (!steamNetwork) return;
            const rates = definition.utilityRates;
            const waterRate = Number(rates.waterInputPerSecond) || 0;
            const steamRate = Number(rates.steamOutputPerSecond) || 0;
            const coalRate = Number(rates.coalInputPerSecond) || 0;
            if (waterRate <= 0 || steamRate <= 0 || coalRate <= 0) return;

            const steamCapacity = getNetworkCapacity(steamNetwork, 'steam');
            const currentSteam = getNetworkAmount(steamNetwork, 'steam');
            const steamHeadroom = Math.max(0, steamCapacity - currentSteam);
            let boilerStatus = '稼働中';
            if (steamCapacity <= UTILITY_EPSILON) boilerStatus = '蓄圧器なし';
            else if (steamHeadroom <= UTILITY_EPSILON) boilerStatus = '蓄圧器満杯';
            else if (availableWater <= UTILITY_EPSILON) boilerStatus = '水不足';
            else if ((Number(placed.utilityState?.coalBurnRemaining) || 0) <= UTILITY_EPSILON
                && Math.floor(nextCoalInventory) < 1) boilerStatus = '石炭不足';
            operationStatuses.set(placed.instanceId, boilerStatus);
            let runSeconds = Math.min(elapsed, availableWater / waterRate, steamHeadroom / steamRate);
            if (runSeconds <= UTILITY_EPSILON) return;

            let coalBurnRemaining = Number(placed.utilityState?.coalBurnRemaining) || 0;
            let wholeCoalConsumed = 0;
            let steamProduced = 0;
            while (runSeconds > UTILITY_EPSILON) {
                if (coalBurnRemaining <= UTILITY_EPSILON) {
                    if (Math.floor(nextCoalInventory) < 1) break;
                    nextCoalInventory -= 1;
                    wholeCoalConsumed += 1;
                    coalBurnRemaining = 1 / coalRate;
                }
                const burnSeconds = Math.min(runSeconds, coalBurnRemaining);
                runSeconds -= burnSeconds;
                coalBurnRemaining -= burnSeconds;
                availableWater -= burnSeconds * waterRate;
                steamProduced += burnSeconds * steamRate;
            }

            if (wholeCoalConsumed > 0) coalChanged = true;
            if (Math.abs((Number(placed.utilityState.coalBurnRemaining) || 0) - coalBurnRemaining) > UTILITY_EPSILON) {
                placed.utilityState.coalBurnRemaining = coalBurnRemaining;
                stateChanged = true;
            }
            if (steamProduced > UTILITY_EPSILON) {
                const storedSteam = getNetworkAmount(steamNetwork, 'steam');
                stateChanged = storeNetworkAmount(steamNetwork, 'steam', storedSteam + steamProduced) || stateChanged;
            }
        });

        stateChanged = storeNetworkAmount(waterNetwork, 'water', availableWater) || stateChanged;
    });

    return { stateChanged, coalChanged, coalInventory: nextCoalInventory, operationStatuses };
}