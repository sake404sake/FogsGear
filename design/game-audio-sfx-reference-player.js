const manifestUrl = new URL('./audio-sources/pdsounds/manifest.json', import.meta.url);
const sourceList = document.getElementById('referenceSources');
const sourceStatus = document.getElementById('referenceSourceStatus');
const assetBuffers = new Map();
const pendingAssets = new Map();
const maxCachedAssets = 4;

const stepRecipe = (impact, texture, settings = {}) => ({
    duration: 3.2,
    layers: [
        {
            source: impact,
            mode: 'hits',
            start: settings.impactStart ?? 0.08,
            period: settings.interval ?? 0.56,
            count: 5,
            clip: settings.impactClip ?? 0.28,
            gain: settings.impactGain ?? 0.82,
            rate: settings.rate ?? 0.94,
            cutoff: settings.cutoff ?? 5200
        },
        {
            source: texture,
            mode: 'hits',
            start: settings.textureStart ?? 0.15,
            period: settings.interval ?? 0.56,
            count: 4,
            clip: settings.textureClip ?? 0.2,
            gain: settings.textureGain ?? 0.43,
            rate: settings.textureRate ?? 1.04,
            cutoff: settings.textureCutoff ?? 7600
        }
    ].filter(layer => layer.source)
});

const mechanismRecipe = (bed, impact, detail, settings = {}) => ({
    duration: 3.6,
    layers: [
        {
            source: bed,
            mode: 'bed',
            start: 0.06,
            clip: 3.35,
            gain: settings.bedGain ?? 0.34,
            rate: settings.bedRate ?? 0.9,
            cutoff: settings.bedCutoff ?? 5200
        },
        {
            source: impact,
            mode: 'hits',
            start: 0.14,
            period: settings.impactPeriod ?? 0.78,
            count: settings.impactCount ?? 4,
            clip: settings.impactClip ?? 0.24,
            gain: settings.impactGain ?? 0.76,
            rate: settings.impactRate ?? 0.94,
            cutoff: settings.impactCutoff ?? 6800
        },
        {
            source: detail,
            mode: 'hits',
            start: 0.42,
            period: settings.detailPeriod ?? 1.08,
            count: settings.detailCount ?? 3,
            clip: settings.detailClip ?? 0.17,
            gain: settings.detailGain ?? 0.38,
            rate: settings.detailRate ?? 1.05,
            cutoff: settings.detailCutoff ?? 9200
        }
    ].filter(layer => layer.source)
});

const profileRecipes = {
    grass: stepRecipe('foot_dull', 'foot_wet_leaves', { interval: 0.5, rate: 1.02, cutoff: 6500 }),
    leaves: stepRecipe('foot_wet_leaves', 'foot_wet_stone', { interval: 0.52, rate: 0.97, cutoff: 7200 }),
    mountain: stepRecipe('foot_gravel', 'foot_stone', { interval: 0.58, rate: 0.9, cutoff: 4800 }),
    sand: stepRecipe('foot_gravel', 'grain_pour', { interval: 0.51, rate: 0.86, textureGain: 0.62, cutoff: 4400 }),
    ruin: stepRecipe('foot_dull', 'foot_stone', { interval: 0.56, rate: 0.98, cutoff: 3800 }),
    ironOre: stepRecipe('metal_drop', 'metal_lid_setdown', { interval: 0.54, rate: 0.94, impactClip: 0.2, impactGain: 1.28, textureStart: 0.1, textureClip: 0.24, textureGain: 1.62, textureRate: 0.96, textureCutoff: 6200, cutoff: 4800 }),
    copperOre: stepRecipe('foot_gravel', 'metal_lid_setdown', { interval: 0.55, rate: 0.9, impactGain: 0.98, textureStart: 0.1, textureClip: 0.24, textureGain: 1.24, textureRate: 0.92, textureCutoff: 4200, cutoff: 4300 }),
    coal: stepRecipe('foot_dull', 'foot_stone', { interval: 0.6, rate: 0.82, textureGain: 0.31, cutoff: 3600 }),
    sulfur: stepRecipe('foot_gravel', 'fire_grass', { interval: 0.56, rate: 0.98, textureGain: 0.2, cutoff: 4900 }),
    clay: stepRecipe('foot_wet_stone', 'wet_squelch', { interval: 0.6, rate: 0.86, impactGain: 1.45, impactClip: 0.36, textureGain: 1.55, textureClip: 0.38, textureStart: 0.12, textureRate: 0.77, textureCutoff: 3600, cutoff: 3400 }),
    limestone: stepRecipe('foot_gravel', 'foot_dull', { interval: 0.56, rate: 0.93, cutoff: 4300 }),
    peat: stepRecipe('foot_wet_leaves', 'wet_squelch', { interval: 0.62, rate: 0.81, textureGain: 0.73, textureRate: 0.76, textureCutoff: 2800, cutoff: 3200 }),
    saltMarsh: stepRecipe('foot_wet_stone', 'water_splash', { interval: 0.64, rate: 0.87, textureGain: 0.66, textureCutoff: 4200, cutoff: 3200 }),
    oil: stepRecipe('wet_squelch', 'wet_squelch', { interval: 0.67, rate: 0.8, impactClip: 0.42, impactGain: 1.35, impactStart: 0.06, textureStart: 0.28, textureClip: 0.4, textureGain: 1.18, textureRate: 0.65, textureCutoff: 3200, cutoff: 3000 }),
    fiber: stepRecipe('foot_dull', 'plant_mint', { interval: 0.51, rate: 1.06, textureStart: 0.13, textureClip: 0.22, textureGain: 0.46, textureRate: 0.9, textureCutoff: 5800, cutoff: 4600 }),
    reeds: stepRecipe('foot_wet_leaves', 'plant_mint', { interval: 0.6, rate: 1.1, textureStart: 0.2, textureClip: 0.24, textureGain: 0.35, textureRate: 0.77, textureCutoff: 3900, cutoff: 6100 }),
    ash: stepRecipe('foot_dull', 'fire_grass', { interval: 0.49, rate: 0.84, textureGain: 0.24, cutoff: 3200 }),
    magnetite: stepRecipe('foot_gravel', 'metal_lid_setdown', { interval: 0.61, rate: 0.82, impactGain: 0.98, textureStart: 0.12, textureClip: 0.22, textureGain: 1.16, textureRate: 0.78, textureCutoff: 3500, cutoff: 3800 }),
    mica: stepRecipe('foot_gravel', 'metal_brush', { interval: 0.54, rate: 1.09, textureGain: 0.55, textureCutoff: 10600, cutoff: 5900 }),
    obsidian: stepRecipe('foot_gravel', 'glass_bing', { interval: 0.56, rate: 1.05, textureGain: 0.53, textureCutoff: 10400, cutoff: 6200 }),
    pumice: stepRecipe('foot_gravel', 'foot_stone', { interval: 0.51, rate: 1.12, textureGain: 0.3, cutoff: 7400 }),
    seaweed: stepRecipe('foot_wet_leaves', 'water_splash', { interval: 0.64, rate: 0.91, textureGain: 0.72, textureCutoff: 4900, cutoff: 3900 }),
    tinOre: stepRecipe('foot_gravel', 'metal_clasp', { interval: 0.57, rate: 1.08, textureGain: 0.31, cutoff: 6900 }),
    zincOre: stepRecipe('metal_drop', 'metal_lid_setdown', { interval: 0.59, rate: 0.86, impactClip: 0.19, impactGain: 1.18, textureStart: 0.11, textureClip: 0.23, textureGain: 1.48, textureRate: 0.84, textureCutoff: 5400, cutoff: 3900 }),
    crystal: stepRecipe('foot_gravel', 'glass_bing', { interval: 0.55, rate: 1.14, textureGain: 0.62, textureCutoff: 11500, cutoff: 7900 }),
    mycelium: stepRecipe('foot_wet_leaves', 'wet_squelch', { interval: 0.67, rate: 0.78, textureGain: 0.47, textureCutoff: 2500, cutoff: 3000 }),
    herbs: stepRecipe('foot_wet_leaves', 'plant_mint', { interval: 0.48, rate: 1.12, impactGain: 0.72, textureStart: 0.16, textureClip: 0.22, textureGain: 0.62, textureRate: 1.08, textureCutoff: 7200, cutoff: 7600 }),
    resinForest: stepRecipe('foot_wet_leaves', 'wet_squelch', { interval: 0.59, rate: 0.9, textureGain: 0.53, textureRate: 0.85, textureCutoff: 3400, cutoff: 5100 }),
    machineWreck: stepRecipe('foot_wet_stone', 'metal_drop', { interval: 0.64, rate: 0.9, impactClip: 0.31, impactGain: 0.98, textureStart: 0.13, textureClip: 0.19, textureGain: 0.48, textureRate: 0.84, textureCutoff: 4000, cutoff: 3900 }),
    airshipWreck: stepRecipe('wood_door_close', 'metal_clasp', { interval: 0.7, rate: 0.88, textureGain: 0.52, cutoff: 3600 }),
    foundation: stepRecipe('foot_dull', 'foot_stone', { interval: 0.57, rate: 0.91, cutoff: 3800 }),
    shoreSea: {
        duration: 4.2,
        layers: [
            { source: 'water_rocks', mode: 'hits', start: 0.05, period: 1.18, count: 4, clip: 0.88, gain: 0.78, rate: 0.86, cutoff: 5800 },
            { source: 'shore_pebble', mode: 'hits', start: 0.16, period: 1.2, count: 4, clip: 0.94, gain: 0.72, rate: 0.92, cutoff: 6400 },
            { source: 'water_splash', mode: 'hits', start: 0.36, period: 1.15, count: 4, clip: 0.32, gain: 0.3, rate: 0.94, cutoff: 6100 }
        ]
    },
    shoreLake: {
        duration: 4.2,
        layers: [
            { source: 'water_slosh', mode: 'hits', start: 0.12, period: 1.4, count: 3, clip: 0.56, gain: 0.52, rate: 0.92, cutoff: 4800 },
            { source: 'water_rivulet', mode: 'hits', start: 0.3, period: 1.5, count: 3, clip: 0.42, gain: 0.32, rate: 0.9, cutoff: 4300 },
            { source: 'water_splash', mode: 'hits', start: 0.58, period: 1.48, count: 3, clip: 0.23, gain: 0.18, rate: 0.88, cutoff: 4000 }
        ]
    },
    foundationFloor: stepRecipe('foot_dull', 'foot_stone', { interval: 0.6, rate: 0.94, cutoff: 3600 }),
    brickFloor: stepRecipe('foot_gravel', 'grain_pour', { interval: 0.58, rate: 0.93, textureGain: 0.32, cutoff: 4400 }),
    concreteFloor: stepRecipe('foot_dull', 'foot_stone', { interval: 0.57, rate: 0.86, textureGain: 0.22, cutoff: 2700 }),
    grateFloor: stepRecipe('metal_drop', 'metal_cabinet', { interval: 0.62, rate: 0.9, textureGain: 0.58, cutoff: 4200 }),
    woodFloor: stepRecipe('wood_hit', 'wood_door_handle', { interval: 0.58, rate: 0.93, textureGain: 0.32, cutoff: 4900 }),
    basaltFloor: stepRecipe('foot_gravel', 'foot_stone', { interval: 0.59, rate: 0.83, cutoff: 3300 }),
    ceramicFloor: stepRecipe('foot_dull', 'glass_bing', { interval: 0.57, rate: 1.12, textureGain: 0.31, cutoff: 7900 }),
    brassFloor: stepRecipe('metal_drop', 'metal_clasp', { interval: 0.57, rate: 1.04, textureGain: 0.44, cutoff: 7100 }),
    castIronFloor: stepRecipe('metal_drop', 'metal_cabinet', { interval: 0.61, rate: 0.82, textureGain: 0.58, cutoff: 3500 }),
    straightRail: mechanismRecipe('machine_steam_engine', 'metal_drop', 'machine_train_motor', { bedGain: 0.36, bedRate: 0.86, impactPeriod: 0.62, impactGain: 0.66, detailRate: 0.83 }),
    curveRail: mechanismRecipe('machine_steam_engine', 'metal_clasp_alt', 'metal_brush', { bedGain: 0.31, bedRate: 0.91, impactPeriod: 0.72, impactGain: 0.53, detailGain: 0.58, detailRate: 1.1, detailCutoff: 8600 }),
    railSwitch: mechanismRecipe('machine_train_motor', 'metal_clasp', 'metal_drop', { bedGain: 0.24, bedRate: 0.88, impactPeriod: 1.05, impactGain: 0.91, detailGain: 0.61 }),
    railSignal: mechanismRecipe('machine_steam_engine', 'metal_clasp_alt', 'glass_bing', { bedGain: 0.26, bedRate: 0.96, impactPeriod: 1.2, impactGain: 0.42, detailGain: 0.75, detailRate: 1.16 }),
    simpleFurnace: {
        duration: 3.6,
        layers: [
            { source: 'firewood_crackle', mode: 'hits', start: 0.08, period: 0.46, count: 7, clip: 0.22, gain: 0.72, rate: 0.94, cutoff: 6200 }
        ]
    },
    smallStorage: mechanismRecipe('wood_drawer', 'wood_door_close', 'metal_clasp', { bedGain: 0.3, bedRate: 0.92, impactGain: 0.72, impactPeriod: 1.2, detailGain: 0.48 }),
    scrollStand: {
        duration: 3.8,
        layers: [
            { source: 'mechanism_gearbox', mode: 'bed', start: 0.04, clip: 3.65, gain: 0.54, rate: 0.86, cutoff: 6200 },
            { source: 'mechanism_gearbox', mode: 'hits', start: 0.16, period: 0.34, count: 10, clip: 0.2, gain: 0.3, rate: 0.9, cutoff: 5500 },
            { source: 'wood_drawer', mode: 'hits', start: 0.62, period: 1.48, count: 2, clip: 0.18, gain: 0.18, rate: 1.06, cutoff: 4200 }
        ]
    },
    handPump: mechanismRecipe('machine_pump', 'water_faucet', 'water_slosh', { bedGain: 0.35, bedRate: 0.9, impactGain: 0.59, impactPeriod: 0.62, detailGain: 0.48, detailPeriod: 0.62 }),
    pressureGauge: mechanismRecipe('machine_coffee', 'metal_clasp', 'metal_drop', { bedGain: 0.17, bedRate: 0.88, impactGain: 0.29, impactPeriod: 1.08, detailGain: 0.21, detailPeriod: 1.35 }),
    fogVent: mechanismRecipe('machine_boiler', 'steam_hot_stone', 'metal_clasp', { bedGain: 0.38, bedRate: 0.83, bedCutoff: 4000, impactGain: 0.56, impactRate: 0.82, detailGain: 0.35 }),
    gearForge: mechanismRecipe('machine_grinder', 'metal_drop', 'machine_boiler', { bedGain: 0.31, bedRate: 0.86, impactGain: 0.75, impactPeriod: 0.84, detailGain: 0.37 }),
    steamFountain: mechanismRecipe('water_stream', 'steam_hot_stone', 'water_splash', { bedGain: 0.44, bedRate: 0.96, bedCutoff: 8500, impactGain: 0.36, impactRate: 0.92, detailGain: 0.42, detailRate: 1.04 }),
    warehouse: mechanismRecipe('wood_door_close', 'wood_drawer', 'metal_clasp', { bedGain: 0.28, bedRate: 0.8, impactGain: 0.78, impactRate: 0.82, detailGain: 0.53 }),
    craftBench: mechanismRecipe('machine_grinder', 'wood_hit', 'wood_drawer', { bedGain: 0.22, bedRate: 1.03, bedCutoff: 6500, impactGain: 0.68, impactRate: 1.06, detailGain: 0.24 }),
    dryingRack: mechanismRecipe('foot_wet_leaves', 'wood_door_handle', 'wood_hit', { bedGain: 0.19, bedRate: 0.96, bedCutoff: 5700, impactGain: 0.3, impactPeriod: 1.3, detailGain: 0.22 }),
    charcoalKiln: {
        duration: 3.8,
        layers: [
            { source: 'firewood_crackle', mode: 'hits', start: 0.05, period: 0.39, count: 9, clip: 0.25, gain: 1.18, rate: 0.82, cutoff: 4700 }
        ]
    },
    fogCistern: mechanismRecipe('water_faucet', 'water_slosh', 'water_rivulet', { bedGain: 0.38, bedRate: 0.89, impactGain: 0.36, impactPeriod: 1.1, detailGain: 0.27 }),
    boiler: mechanismRecipe('fire_barbecue', 'machine_boiler', 'metal_drop', { bedGain: 0.46, bedRate: 0.86, bedCutoff: 5600, impactGain: 0.44, impactClip: 0.2, impactPeriod: 1.12, impactRate: 0.88, detailGain: 0.26, detailPeriod: 1.32 }),
    oreWasher: mechanismRecipe('water_faucet', 'foot_stone', 'water_slosh', { bedGain: 0.4, bedRate: 0.95, impactGain: 0.54, impactPeriod: 0.65, detailGain: 0.46 }),
    ceramicKiln: mechanismRecipe('steam_hot_stone', 'machine_boiler', 'glass_bing', { bedGain: 0.33, bedRate: 0.85, bedCutoff: 6800, impactGain: 0.35, detailGain: 0.55, detailRate: 1.08 }),
    waterTower: mechanismRecipe('machine_pump', 'water_stream', 'metal_clasp', { bedGain: 0.33, bedRate: 0.86, impactGain: 0.48, impactPeriod: 1.05, detailGain: 0.32 }),
    machineLathe: mechanismRecipe('machine_grinder', 'machine_espresso', 'metal_brush', { bedGain: 0.38, bedRate: 0.93, impactGain: 0.38, impactPeriod: 0.66, detailGain: 0.53, detailRate: 1.12 }),
    distillery: mechanismRecipe('machine_espresso', 'water_faucet', 'glass_bing', { bedGain: 0.32, bedRate: 0.9, impactGain: 0.4, detailGain: 0.48, detailRate: 1.15 }),
    railFreightStation: mechanismRecipe('machine_steam_engine', 'metal_drop', 'vehicle_cobble', { bedGain: 0.38, bedRate: 0.8, impactGain: 0.63, detailGain: 0.42 }),
    steamAccumulator: {
        duration: 3.8,
        layers: [
            { source: 'machine_compressor', mode: 'bed', start: 0.04, clip: 3.65, gain: 0.62, rate: 0.84, cutoff: 4300 },
            { source: 'machine_compressor', mode: 'hits', start: 0.42, period: 1.3, count: 2, clip: 0.35, gain: 0.23, rate: 0.8, cutoff: 3500 },
            { source: 'metal_clasp_alt', mode: 'hits', start: 0.25, period: 1.42, count: 2, clip: 0.18, gain: 0.23, rate: 0.86, cutoff: 4800 }
        ]
    },
    resinWorkshop: mechanismRecipe('wet_squelch', 'wood_hit', 'machine_espresso', { bedGain: 0.22, bedRate: 0.77, bedCutoff: 3100, impactGain: 0.45, detailGain: 0.29 }),
    brassWorkshop: mechanismRecipe('machine_grinder', 'metal_drop', 'metal_brush', { bedGain: 0.32, bedRate: 0.98, impactGain: 0.66, detailGain: 0.57, detailRate: 1.14 }),
    steamTower: mechanismRecipe('machine_boiler', 'metal_cabinet', 'steam_hot_stone', { bedGain: 0.41, bedRate: 0.81, impactGain: 0.58, detailGain: 0.46 }),
    freightPlatform: mechanismRecipe('machine_train_motor', 'metal_clasp', 'wood_drawer', { bedGain: 0.31, bedRate: 0.82, impactGain: 0.64, detailGain: 0.48 }),
    centralTurbine: mechanismRecipe('machine_train_motor', 'machine_grinder', 'machine_boiler', { bedGain: 0.42, bedRate: 0.8, impactGain: 0.46, detailGain: 0.34 }),
    differenceTower: mechanismRecipe('machine_coffee', 'metal_clasp_alt', 'metal_drop', { bedGain: 0.22, bedRate: 0.94, impactGain: 0.49, detailGain: 0.35, detailRate: 1.1 }),
    deepDrill: mechanismRecipe('machine_grinder', 'foot_stone', 'machine_train_motor', { bedGain: 0.43, bedRate: 0.79, bedCutoff: 3500, impactGain: 0.69, detailGain: 0.45 }),
    automatonFactory: {
        duration: 4,
        layers: [
            { source: 'machine_grinder', mode: 'bed', start: 0.04, clip: 3.85, gain: 0.76, rate: 0.88, cutoff: 6500 },
            { source: 'mechanism_gearbox', mode: 'bed', start: 0.12, clip: 3.55, gain: 0.58, rate: 0.88, cutoff: 7800 },
            { source: 'metal_cabinet', mode: 'hits', start: 0.18, period: 0.84, count: 4, clip: 0.24, gain: 0.62, rate: 0.88, cutoff: 5200 },
            { source: 'metal_drop', mode: 'hits', start: 0.52, period: 1.28, count: 3, clip: 0.18, gain: 0.6, rate: 0.86, cutoff: 4300 }
        ]
    },
    airshipWorkshop: mechanismRecipe('wood_drawer', 'wood_door_handle', 'metal_clasp_alt', { bedGain: 0.18, bedRate: 1.12, impactGain: 0.4, detailGain: 0.35, detailRate: 1.12 }),
    settlerLodge: mechanismRecipe('foot_wet_leaves', 'water_rivulet', 'wood_hit', { bedGain: 0.22, bedRate: 1.02, bedCutoff: 9000, impactGain: 0.3, detailGain: 0.21 }),
    fieldAutomaton: {
        duration: 4,
        layers: [
            { source: 'mechanism_gearbox', mode: 'bed', start: 0.04, clip: 3.85, gain: 0.56, rate: 0.88, cutoff: 7200 },
            { source: 'mechanism_gearbox', mode: 'hits', start: 0.12, period: 0.32, count: 11, clip: 0.21, gain: 0.36, rate: 0.88, cutoff: 6500 },
            { source: 'machine_compressor', mode: 'bed', start: 0.08, clip: 3.8, gain: 0.42, rate: 0.88, cutoff: 4300 },
            { source: 'metal_drop', mode: 'hits', start: 0.34, period: 0.9, count: 3, clip: 0.18, gain: 0.5, rate: 0.94, cutoff: 4600 }
        ]
    },
    councilHall: mechanismRecipe('wood_drawer', 'wood_door_handle', 'metal_clasp', { bedGain: 0.14, bedRate: 0.96, impactGain: 0.33, detailGain: 0.24 }),
    relicReactor: mechanismRecipe('machine_espresso', 'glass_bing', 'machine_boiler', { bedGain: 0.25, bedRate: 0.75, impactGain: 0.52, detailGain: 0.33 }),
    airshipDockyard: mechanismRecipe('shore_harbour', 'metal_door', 'metal_clasp_alt', { bedGain: 0.36, bedRate: 0.8, impactGain: 0.69, detailGain: 0.51 }),
    filterTower: mechanismRecipe('water_faucet', 'machine_pump', 'steam_hot_stone', { bedGain: 0.27, bedRate: 0.87, impactGain: 0.53, detailGain: 0.33 }),
    walkingCity: mechanismRecipe('machine_steam_engine', 'foot_gravel', 'metal_cabinet', { bedGain: 0.42, bedRate: 0.75, impactGain: 0.8, impactPeriod: 0.93, detailGain: 0.38 }),
    geothermalCollector: mechanismRecipe('steam_hot_stone', 'machine_boiler', 'water_rivulet', { bedGain: 0.38, bedRate: 0.88, bedCutoff: 5400, impactGain: 0.45, detailGain: 0.28 }),
    terraformingDome: mechanismRecipe('water_rivulet', 'machine_pump', 'foot_wet_leaves', { bedGain: 0.2, bedRate: 1.04, bedCutoff: 9200, impactGain: 0.26, detailGain: 0.23 }),
    steamLocomotive: mechanismRecipe('machine_steam_engine', 'machine_train_motor', 'metal_drop', { bedGain: 0.47, bedRate: 0.78, impactGain: 0.65, impactPeriod: 0.66, detailGain: 0.52 }),
    oreWagon: mechanismRecipe('machine_steam_engine', 'foot_stone', 'metal_drop', { bedGain: 0.35, bedRate: 0.88, impactGain: 0.51, detailGain: 0.47 }),
    freightWagon: mechanismRecipe('machine_steam_engine', 'wood_drawer', 'metal_clasp', { bedGain: 0.32, bedRate: 0.91, impactGain: 0.57, detailGain: 0.47 })
};

export const AUDIO_PROFILE_NAMES = Object.freeze(Object.keys(profileRecipes));

function sourceCard(source) {
    const card = document.createElement('article');
    const title = document.createElement('h3');
    const details = document.createElement('p');
    const links = document.createElement('p');
    const sourceLink = document.createElement('a');
    const licenseLink = document.createElement('a');
    const audio = document.createElement('audio');

    title.textContent = source.title;
    details.textContent = `${source.author} — ${source.license}${source.attributionRequired ? ' — クレジット必須・速度/帯域/包絡を改変' : ''}`;
    sourceLink.href = source.sourcePage;
    sourceLink.target = '_blank';
    sourceLink.rel = 'noreferrer';
    sourceLink.textContent = '録音の出典';
    licenseLink.href = source.licenseUrl;
    licenseLink.target = '_blank';
    licenseLink.rel = 'noreferrer';
    licenseLink.textContent = 'ライセンス';
    links.append(sourceLink, document.createTextNode(' | '), licenseLink);
    audio.controls = true;
    audio.preload = 'none';
    audio.src = new URL(`./audio-sources/pdsounds/${source.file}`, import.meta.url).href;
    audio.setAttribute('aria-label', `原音を再生: ${source.title}`);
    card.append(title, details, links, audio);
    return card;
}

async function loadManifest() {
    const response = await fetch(manifestUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`音源台帳を読み込めません (${response.status})`);
    const manifest = await response.json();
    if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
        throw new Error('音源台帳に利用可能な録音がありません。');
    }
    if (sourceList) {
        for (const asset of manifest.assets) sourceList.append(sourceCard(asset));
    }
    if (sourceStatus) {
        sourceStatus.textContent = `${manifest.assets.length}件の同梱録音を利用できます。各原音と出典・ライセンスを上で確認できます。`;
    }
    return new Map(manifest.assets.map(asset => [asset.id, asset]));
}

let manifestPromise = null;

function getManifest() {
    if (!manifestPromise) {
        manifestPromise = loadManifest().catch(error => {
            if (sourceStatus) sourceStatus.textContent = `同梱録音を利用できません: ${error.message}`;
            console.error('同梱録音の音源台帳を読み込めません', error);
            throw error;
        });
    }
    return manifestPromise;
}

if (sourceList) void getManifest().catch(() => {});

async function getAudioBuffer(assetId, context, sources) {
    if (assetBuffers.has(assetId)) {
        const buffer = assetBuffers.get(assetId);
        assetBuffers.delete(assetId);
        assetBuffers.set(assetId, buffer);
        return buffer;
    }
    if (pendingAssets.has(assetId)) return pendingAssets.get(assetId);
    const asset = sources.get(assetId);
    if (!asset) throw new Error(`音源台帳に ${assetId} がありません。`);
    const pending = (async () => {
        const url = new URL(`./audio-sources/pdsounds/${asset.file}`, import.meta.url);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${asset.file} を読み込めません (${response.status})`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        assetBuffers.set(assetId, buffer);
        while (assetBuffers.size > maxCachedAssets) {
            assetBuffers.delete(assetBuffers.keys().next().value);
        }
        if (sourceStatus) sourceStatus.textContent = `音源読込済み: ${asset.title}`;
        return buffer;
    })();
    pendingAssets.set(assetId, pending);
    try {
        return await pending;
    } catch (error) {
        if (sourceStatus) sourceStatus.textContent = `音源を読み込めません: ${asset.title} (${error.message})`;
        console.error(`音源を読み込めません: ${assetId}`, error);
        throw error;
    } finally {
        pendingAssets.delete(assetId);
    }
}

function activeOffset(buffer, duration, random) {
    const maxOffset = Math.max(0, buffer.duration - duration);
    if (maxOffset === 0) return 0;
    let bestOffset = 0;
    let bestScore = -1;
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    const stride = Math.max(1, Math.floor(buffer.sampleRate * duration / 180));
    const sampleCount = Math.max(1, Math.floor(buffer.sampleRate * duration / stride));
    for (let candidate = 0; candidate < 12; candidate++) {
        const offset = random() * maxOffset;
        const start = Math.floor(offset * buffer.sampleRate);
        let sum = 0;
        for (const channel of channels) {
            for (let i = 0; i < sampleCount; i++) {
                const value = channel[start + i * stride] || 0;
                sum += value * value;
            }
        }
        const score = sum / (sampleCount * channels.length);
        if (score > bestScore) {
            bestScore = score;
            bestOffset = offset;
        }
    }
    return bestOffset;
}

function playLayer(layer, buffer, context, output, recipe, random) {
    const count = layer.mode === 'bed' ? 1 : layer.count;
    for (let index = 0; index < count; index++) {
        const rate = layer.rate * (0.97 + random() * 0.06);
        const desiredDuration = layer.mode === 'bed' ? recipe.duration : layer.clip;
        const duration = Math.min(desiredDuration, buffer.duration / rate);
        const sourceDuration = duration * rate;
        const offset = layer.mode === 'bed'
            ? random() * Math.max(0, buffer.duration - sourceDuration)
            : activeOffset(buffer, sourceDuration, random);
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const envelope = context.createGain();
        const jitter = index ? (random() - 0.5) * Math.min(0.06, (layer.period || 0) * 0.12) : 0;
        const when = context.currentTime + 0.05 + layer.start + (layer.period || 0) * index + jitter;
        const end = when + duration;
        source.buffer = buffer;
        source.playbackRate.value = rate;
        filter.type = 'lowpass';
        filter.frequency.value = Math.min(context.sampleRate / 2, layer.cutoff);
        filter.Q.value = 0.65;
        envelope.gain.setValueAtTime(0.0001, when);
        envelope.gain.linearRampToValueAtTime(layer.gain, when + Math.min(0.025, duration * 0.2));
        envelope.gain.setValueAtTime(layer.gain, Math.max(when + 0.03, end - Math.min(0.08, duration * 0.3)));
        envelope.gain.exponentialRampToValueAtTime(0.0001, end);
        source.connect(filter);
        filter.connect(envelope);
        envelope.connect(output);
        source.onended = () => {
            source.disconnect();
            filter.disconnect();
            envelope.disconnect();
        };
        source.start(when, offset, sourceDuration);
        source.stop(end + 0.015);
    }
}

export async function playFogsGearReferenceRecording(
    profileName,
    context,
    output,
    isCurrent = () => true,
    { singleHit = false } = {}
) {
    const recipe = profileRecipes[profileName];
    if (!recipe) throw new Error(`${profileName}: 対応する実録音の音響レシピがありません。`);
    const sources = await getManifest();
    const missingSources = recipe.layers.map(layer => layer.source).filter(id => !sources.has(id));
    if (missingSources.length) {
        throw new Error(`${profileName}: 必要な録音が音源台帳にありません (${[...new Set(missingSources)].join(', ')})`);
    }
    const buffers = await Promise.all(recipe.layers.map(layer => getAudioBuffer(layer.source, context, sources)));
    if (!isCurrent()) return 0;
    const playbackRecipe = singleHit
        ? {
            duration: 0.58,
            layers: recipe.layers.map(layer => ({
                ...layer,
                mode: 'hits',
                count: 1,
                period: 0,
                clip: Math.min(layer.clip || 0.48, 0.48)
            }))
        }
        : recipe;
    const random = Math.random;
    playbackRecipe.layers.forEach((layer, index) => playLayer(layer, buffers[index], context, output, playbackRecipe, random));
    return playbackRecipe.duration + 0.14;
}

window.playFogsGearReferenceRecording = playFogsGearReferenceRecording;
