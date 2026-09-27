const ICON_SOURCE_SIZE = 96;
const TYPE_INDEX = Object.freeze({
    SEA: 0,
    LAKE: 1,
    PLAINS: 2,
    FOREST: 3,
    MOUNTAIN: 4,
    SAND: 5,
    RUIN: 6
});
const NUMERIC_TYPES = Object.freeze(['PLAINS', 'MOUNTAIN', 'FOREST', 'SEA', 'SAND']);
let atlasPromise = null;

export function loadCellIconAtlas() {
    if (!atlasPromise) {
        atlasPromise = new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Cell icon atlas failed to load'));
            image.src = new URL('../cell-icons.svg?v=2', import.meta.url).href;
        });
    }
    return atlasPromise;
}

export function drawCellIcon(context, atlas, tile, x, y, size) {
    let type = tile?.type;
    if (tile?.isLake || type === 'LAKE') type = 'LAKE';
    else if (tile?.isSea || tile?.isOcean || type === 'SEA' || type === 'OCEAN') type = 'SEA';
    else if (typeof type === 'number') type = NUMERIC_TYPES[type];
    else type = String(type || 'PLAINS').toUpperCase();

    const index = TYPE_INDEX[type];
    if (index === undefined) return;
    context.drawImage(atlas, index * ICON_SOURCE_SIZE, 0, ICON_SOURCE_SIZE, ICON_SOURCE_SIZE, x, y, size, size);
}