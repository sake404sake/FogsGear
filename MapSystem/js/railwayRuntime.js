import { getRailConnections } from './buildingData.js';

const positionKey = ({ x, y }) => `${x},${y}`;

export const VEHICLE_DEFAULTS = Object.freeze({
    running: false,
    stopReason: '',
    previousRail: null,
    movement: null,
    movement: null,
    movementScrollId: '',
    speedCellsPerSecond: 1,
    resources: { power: 0, steam: 0 },
    powerPerCell: 1,
    steamPerCell: 0.2,
    nextMoveAt: 0
});

export const STATION_CONTROL_DEFAULTS = Object.freeze({
    departureDirection: '',
    destinations: [],
    conditions: [],
    movementScrollId: ''
});

export function findNextRailStep(buildings, buildingById, position, previousPosition = null, preferredDirection = null, usePreferredAtJunction = false) {
    const rails = new Map();
    buildings.forEach(placed => {
        if (buildingById.get(placed.id)?.role === 'rail') rails.set(positionKey(placed), placed);
    });
    const current = rails.get(positionKey(position));
    const currentDefinition = buildingById.get(current?.id);
    if (!current || !currentDefinition) return { error: 'missing-track' };

    const neighbors = [];
    let hasMismatch = false;
    let hasGap = false;
    for (const [dx, dy] of getRailConnections(currentDefinition.kind, current.rotation || 0)) {
        const neighborPosition = { x: position.x + dx, y: position.y + dy };
        const neighbor = rails.get(positionKey(neighborPosition));
        if (!neighbor) {
            hasGap = true;
            continue;
        }
        const neighborDefinition = buildingById.get(neighbor.id);
        const reciprocal = neighborDefinition && getRailConnections(neighborDefinition.kind, neighbor.rotation || 0)
            .some(([neighborDx, neighborDy]) => neighborDx === -dx && neighborDy === -dy);
        if (!reciprocal) {
            hasMismatch = true;
            continue;
        }
        if (previousPosition && neighborPosition.x === previousPosition.x && neighborPosition.y === previousPosition.y) continue;
        neighbors.push({ position: neighborPosition, direction: [dx, dy] });
    }

    if (hasMismatch) return { error: 'connection-mismatch' };
    if (preferredDirection && (usePreferredAtJunction || neighbors.length === 1
        || !previousPosition && getRailConnections(currentDefinition.kind, current.rotation || 0).length === 2)) {
        const preferred = neighbors.find(({ direction }) => direction[0] === preferredDirection[0] && direction[1] === preferredDirection[1]);
        if (preferred) return preferred;
    }
    if (neighbors.length === 1) return neighbors[0];
    if (neighbors.length > 1 && !previousPosition && getRailConnections(currentDefinition.kind, current.rotation || 0).length === 2) {
        return neighbors[0];
    }
    if (neighbors.length > 1) return { error: 'ambiguous-junction' };
    if (hasGap) return { error: 'disconnected-track' };
    return { error: 'track-ended' };
}

export function getTrackDirection(rotation = 0) {
    const directions = [[0, 1], [-1, 0], [0, -1], [1, 0]];
    return directions[((Number(rotation) || 0) % 4 + 4) % 4];
}

export function directionToVehicleRotation([dx, dy]) {
    if (dx === 1) return 1;
    if (dy === 1) return 2;
    if (dx === -1) return 3;
    return 0;
}

export function getVehicleRenderState(placed, now) {
    const movement = placed.vehicle?.movement;
    if (!movement) return { x: placed.x, y: placed.y, rotation: placed.rotation || 0, moving: false };
    const duration = Math.max(1, Number(movement.durationMs) || 1);
    const progress = Math.max(0, Math.min(1, (now - movement.startedAt) / duration));
    const from = movement.from;
    const to = movement.to;
    const rotationDelta = ((movement.toRotation - movement.fromRotation + 2) % 4 + 4) % 4 - 2;
    return {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
        rotation: movement.fromRotation + rotationDelta * progress,
        moving: true
    };
}