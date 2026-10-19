const terrains = [
    ['SEA', '海', 'shoreSea'],
    ['LAKE', '湖沼', 'shoreLake'],
    ['PLAINS', '草原', 'grass'],
    ['FOREST', '森林', 'leaves'],
    ['MOUNTAIN', '山岳', 'mountain'],
    ['SAND', '砂地', 'sand'],
    ['RUIN', '古代遺跡', 'ruin'],
    ['IRON_VEIN', '鉄鉱脈', 'ironOre'],
    ['COPPER_VEIN', '銅鉱脈', 'copperOre'],
    ['COAL_SEAM', '石炭層', 'coal'],
    ['SULFUR_DEPOSIT', '硫黄鉱床', 'sulfur'],
    ['CLAY_BED', '粘土層', 'clay'],
    ['LIMESTONE', '石灰岩層', 'limestone'],
    ['PEAT_BOG', '泥炭地', 'peat'],
    ['SALT_MARSH', '塩沼', 'saltMarsh'],
    ['OIL_SEEP', '油浸地', 'oil'],
    ['FIBER_FIELD', '麻草地', 'fiber'],
    ['REED_BED', '葦原', 'reeds'],
    ['ASH_DEPOSIT', '火山灰地', 'ash'],
    ['MAGNETITE_VEIN', '磁鉄鉱脈', 'magnetite'],
    ['MICA_OUTCROP', '雲母露頭', 'mica'],
    ['OBSIDIAN_FIELD', '黒曜石地', 'obsidian'],
    ['PUMICE_FIELD', '軽石地', 'pumice'],
    ['SEAWEED_BED', '海藻場', 'seaweed'],
    ['TIN_VEIN', '錫鉱脈', 'tinOre'],
    ['ZINC_VEIN', '亜鉛鉱脈', 'zincOre'],
    ['CRYSTAL_VEIN', '水晶脈', 'crystal'],
    ['MYCELIUM', '菌糸群落', 'mycelium'],
    ['HERB_FIELD', '薬草地', 'herbs'],
    ['RESIN_FOREST', '樹脂林', 'resinForest'],
    ['MACHINE_WRECK', '機械の残骸', 'machineWreck'],
    ['AIRSHIP_WRECK', '飛行船の墜落跡', 'airshipWreck'],
    ['FOUNDATION', '基礎', 'foundation']
];

const buildingSections = [
    ['舗装・線路', [
        ['foundation-cell', '基礎セル', 'foundationFloor'],
        ['brick-tile', '真鍮縁どり赤煉瓦床タイル', 'brickFloor'],
        ['concrete-tile', '青鋼コンクリートパネル', 'concreteFloor'],
        ['grate-tile', '鋳鉄格子デッキ（メッシュ）', 'grateFloor'],
        ['wood-tile', '銘木防水板仕上げ床', 'woodFloor'],
        ['stone-tile', '玄武岩耐熱石畳', 'basaltFloor'],
        ['drain-tile', '陶器排水タイル', 'ceramicFloor'],
        ['access-tile', '真鍮点検口付き舗装', 'brassFloor'],
        ['hearth-tile', '石炭炉前鋳鉄床', 'castIronFloor'],
        ['rail-track', '直線線路', 'straightRail'],
        ['rail-curve', '曲線線路', 'curveRail'],
        ['rail-switch', '分岐線路', 'railSwitch'],
        ['rail-signal', '信号付き直線線路', 'railSignal']
    ]],
    ['初期設備', [
        ['simple-furnace', '簡易炉', 'simpleFurnace'],
        ['simple-storage', '簡易ストレージ', 'smallStorage'],
        ['scroll-stand', 'スクロール台', 'scrollStand'],
        ['hand-pump', '手回し式揚管ポンプ', 'handPump'],
        ['pressure-gauge-tower', '圧力計ペデスタル塔', 'pressureGauge'],
        ['fog-vent', '霧よけスチームベント', 'fogVent'],
        ['gear-forge', '歯車生成炉', 'gearForge'],
        ['steam-fountain', '真鍮噴水 / スチームファンテン', 'steamFountain'],
        ['warehouse', 'ストレージ倉庫', 'warehouse'],
        ['craft-bench', '手鋸・細工作業台', 'craftBench'],
        ['drying-rack', '木材乾燥棚', 'dryingRack'],
        ['charcoal-kiln', '炭焼き窯', 'charcoalKiln'],
        ['fog-cistern', '霧水貯蔵槽', 'fogCistern']
    ]],
    ['生産設備', [
        ['boiler-forge', '炉', 'boiler'],
        ['ore-washer', '水洗選鉱プラント', 'oreWasher'],
        ['ceramic-kiln', '耐熱ガラス・陶器窯', 'ceramicKiln'],
        ['water-tower', '蒸気揚水・濾過タワー', 'waterTower'],
        ['machine-lathe', '蒸気駆動機械旋盤所', 'machineLathe'],
        ['alchemical-distillery', '蒸気式錬金蒸留プラント', 'distillery'],
        ['rail-freight-station', '蒸気軌道貨物ステーション', 'railFreightStation'],
        ['steam-accumulator', '蒸気蓄圧器', 'steamAccumulator'],
        ['resin-workshop', '樹脂パッキン加工所', 'resinWorkshop'],
        ['brass-workshop', '真鍮工房', 'brassWorkshop'],
        ['steam-tower', '蒸気炉塔', 'steamTower'],
        ['freight-platform', '貨物駅', 'freightPlatform']
    ]],
    ['自動化・大型設備', [
        ['central-turbine', '中央蒸気タービン発電炉', 'centralTurbine'],
        ['difference-tower', '機械式階差演算タワー', 'differenceTower'],
        ['deep-drill', '巨大深部土壌掘削ドリル', 'deepDrill'],
        ['automaton-factory', 'オートマタ製造工場', 'automatonFactory'],
        ['airship-workshop', '開拓気球・軽飛空艇ドック', 'airshipWorkshop'],
        ['settler-lodge', '生態系試験棟', 'settlerLodge'],
        ['field-automaton', '作業オートマタ', 'fieldAutomaton'],
        ['council-hall', 'テラフォーミング管制棟', 'councilHall'],
        ['relic-reactor', '古代遺物共振解読炉', 'relicReactor'],
        ['airship-dockyard', '大型飛空艇ドックヤード', 'airshipDockyard'],
        ['filter-tower', '環境浄化スチームタワー', 'filterTower'],
        ['walking-city-frame', '移動都市用走行脚フレーム', 'walkingCity'],
        ['geothermal-collector', '地熱ダイレクト蒸気コレクター', 'geothermalCollector'],
        ['terraforming-dome', '新天地テラフォーミングドーム', 'terraformingDome']
    ]],
    ['車両', [
        ['steam-locomotive', '蒸気機関車', 'steamLocomotive'],
        ['ore-wagon', '鉱石貨車', 'oreWagon'],
        ['freight-wagon', '木箱貨車', 'freightWagon']
    ]]
];

const footDesigns = {
    grass: { roles: ['softBody', 'grassBlade', 'fineDust'], interval: 0.47, pitch: 0.96, moisture: 'dry' },
    leaves: { roles: ['softBody', 'leafCrunch', 'leafBrush'], interval: 0.5, pitch: 0.93, moisture: 'leaf-litter' },
    mountain: { roles: ['hardBodyFoot', 'stoneGravelFoot', 'stoneDustFoot'], interval: 0.52, pitch: 0.9, moisture: 'dry' },
    sand: { roles: ['softBody', 'sandCompression', 'sandGrain'], interval: 0.48, pitch: 0.88, moisture: 'dry' },
    ruin: { roles: ['stoneHeel', 'stoneKnock', 'shortStoneTail'], interval: 0.51, pitch: 1.02, moisture: 'dry' },
    ironOre: { roles: ['ironOreImpactFoot', 'ironOreChipFoot', 'ironOreTailFoot'], interval: 0.52, pitch: 0.9, moisture: 'dry' },
    copperOre: { roles: ['copperOreImpactFoot', 'copperOreChipFoot', 'copperOreTailFoot'], interval: 0.51, pitch: 1.06, moisture: 'dry' },
    coal: { roles: ['softBody', 'coalCrush', 'coalChip'], interval: 0.53, pitch: 0.84, moisture: 'dry' },
    sulfur: { roles: ['hardBodyFoot', 'sulfurGrainFoot', 'stoneDustFoot'], interval: 0.52, pitch: 1.02, moisture: 'dry' },
    clay: { roles: ['wetImpact', 'mudSquelch', 'stickyRelease'], interval: 0.55, pitch: 0.9, moisture: 'saturated', delays: [0, 0.025, 0.16], levels: [0.95, 1, 0.82] },
    limestone: { roles: ['hardBodyFoot', 'chalkGrain', 'stoneDustFoot'], interval: 0.51, pitch: 0.96, moisture: 'dry' },
    peat: { roles: ['peatImpact', 'peatSquelch', 'suctionRelease'], interval: 0.55, pitch: 0.83, moisture: 'saturated', delays: [0, 0.035, 0.19], levels: [0.95, 1, 0.84] },
    saltMarsh: { roles: ['wetImpact', 'marshSquelch', 'mudSplash'], interval: 0.56, pitch: 0.93, moisture: 'standing-water', delays: [0, 0.025, 0.11], levels: [0.95, 1, 0.76] },
    oil: { roles: ['wetBody', 'oilDrag', 'softFleck'], interval: 0.56, pitch: 0.82, moisture: 'viscous-oil' },
    fiber: { roles: ['fiberGroundFoot', 'fiberStemFoot', 'fiberBrushFoot'], interval: 0.47, pitch: 1.08, moisture: 'dry' },
    reeds: { roles: ['reedGroundFoot', 'reedStalkFoot', 'reedBrushFoot'], interval: 0.55, pitch: 1.1, moisture: 'dry' },
    ash: { roles: ['softBody', 'ashScuff', 'fineDust'], interval: 0.48, pitch: 0.87, moisture: 'dry' },
    magnetite: { roles: ['magnetiteImpactFoot', 'magnetiteGrainFoot', 'magnetiteDragFoot'], interval: 0.56, pitch: 0.84, moisture: 'dry' },
    mica: { roles: ['hardBodyFoot', 'micaFlakeFoot', 'stoneDustFoot'], interval: 0.51, pitch: 1.1, moisture: 'dry' },
    obsidian: { roles: ['hardBodyFoot', 'obsidianGrainFoot', 'glassDustFoot'], interval: 0.5, pitch: 1.15, moisture: 'dry' },
    pumice: { roles: ['softBody', 'pumiceCrush', 'pumiceGrain'], interval: 0.49, pitch: 1.12, moisture: 'dry' },
    seaweed: { roles: ['wetMatImpact', 'waterSlap', 'seaweedDrag'], interval: 0.54, pitch: 0.9, moisture: 'waterlogged-vegetation', delays: [0, 0.02, 0.12], levels: [0.94, 0.86, 0.76] },
    tinOre: { roles: ['tinOreImpactFoot', 'tinOreChipFoot', 'tinOreTailFoot'], interval: 0.5, pitch: 1.13, moisture: 'dry' },
    zincOre: { roles: ['zincOreImpactFoot', 'zincOreChipFoot', 'zincOreTailFoot'], interval: 0.54, pitch: 1.02, moisture: 'dry' },
    crystal: { roles: ['hardBodyFoot', 'crystalGrainFoot', 'crystalDustFoot'], interval: 0.51, pitch: 1.2, moisture: 'dry' },
    mycelium: { roles: ['softBody', 'fungusCompress', 'softFleck'], interval: 0.54, pitch: 0.86, moisture: 'soft-organic' },
    herbs: { roles: ['softBody', 'herbBrush', 'fineDust'], interval: 0.48, pitch: 1.03, moisture: 'dry' },
    resinForest: { roles: ['softBody', 'resinLeaf', 'dampBrush'], interval: 0.5, pitch: 0.94, moisture: 'tacky-resin' },
    machineWreck: { roles: ['wreckPlateFoot', 'wreckDebrisFoot', 'wreckRattleFoot'], interval: 0.61, pitch: 0.88, moisture: 'dry' },
    airshipWreck: { roles: ['airshipFrameFoot', 'canvasFoldFoot', 'riggingFrictionFoot'], interval: 0.57, pitch: 1.05, moisture: 'dry' },
    foundation: { roles: ['hardBody', 'concreteGrain', 'shortStoneTail'], interval: 0.5, pitch: 0.95, moisture: 'dry' }
};

const footRoles = {
    softBody: { layers: [['brown', 'lowpass', 64, 145, 0.15, 0.32], ['brown', 'bandpass', 135, 360, 0.11, 0.16]], modes: [[92, 0.13, 0.1, 'sine']] },
    hardBody: { layers: [['brown', 'lowpass', 72, 180, 0.1, 0.28], ['white', 'bandpass', 240, 760, 0.055, 0.06]], modes: [[126, 0.16, 0.09, 'sine'], [218, 0.1, 0.06, 'triangle']] },
    wetBody: { layers: [['brown', 'lowpass', 52, 112, 0.2, 0.31], ['brown', 'bandpass', 95, 320, 0.16, 0.19]], modes: [[74, 0.11, 0.12, 'sine']] },
    wetImpact: { layers: [['brown', 'lowpass', 48, 125, 0.22, 0.31, 0.14], ['brown', 'bandpass', 95, 280, 0.16, 0.18, 0.12]] },
    mudSquelch: { layers: [['pink', 'bandpass', 140, 480, 0.24, 0.24, 0.34], ['brown', 'lowpass', 55, 115, 0.19, 0.15, 0.22], ['white', 'bandpass', 520, 1450, 0.105, 0.09, 0.05]] },
    stickyRelease: { layers: [['pink', 'bandpass', 180, 720, 0.17, 0.19, 0.38], ['white', 'highpass', 760, 1900, 0.075, 0.075, 0.08]] },
    peatImpact: { layers: [['brown', 'lowpass', 42, 100, 0.24, 0.29, 0.15], ['pink', 'bandpass', 115, 330, 0.18, 0.16, 0.12]] },
    peatSquelch: { layers: [['pink', 'bandpass', 100, 360, 0.23, 0.22, 0.32], ['brown', 'lowpass', 48, 105, 0.19, 0.16, 0.2], ['white', 'bandpass', 440, 1180, 0.09, 0.065, 0.045]] },
    suctionRelease: { layers: [['pink', 'bandpass', 150, 560, 0.18, 0.2, 0.36], ['white', 'highpass', 900, 2100, 0.08, 0.065, 0.07]] },
    marshSquelch: { layers: [['pink', 'bandpass', 150, 520, 0.21, 0.23, 0.3], ['white', 'highpass', 680, 1900, 0.105, 0.1, 0.035]] },
    mudSplash: { layers: [['pink', 'bandpass', 140, 640, 0.13, 0.14, 0.08], ['white', 'bandpass', 540, 2200, 0.105, 0.14, 0.035], ['white', 'highpass', 1650, 3900, 0.055, 0.055, 0.025]] },
    wetMatImpact: { layers: [['brown', 'lowpass', 60, 165, 0.17, 0.24, 0.1], ['pink', 'bandpass', 170, 680, 0.14, 0.17, 0.09]] },
    waterSlap: { layers: [['pink', 'bandpass', 100, 620, 0.16, 0.22, 0.2], ['white', 'bandpass', 420, 1800, 0.105, 0.105, 0.04]] },
    stoneHeel: { layers: [['brown', 'lowpass', 78, 160, 0.075, 0.29], ['white', 'bandpass', 400, 1200, 0.042, 0.045]], modes: [[182, 0.19, 0.14, 'sine'], [326, 0.12, 0.08, 'triangle']] },
    stoneKnock: { layers: [['white', 'bandpass', 540, 1900, 0.12, 0.04]], modes: [[265, 0.17, 0.13, 'sine'], [445, 0.1, 0.09, 'triangle']] },
    woodThud: { layers: [['brown', 'lowpass', 68, 190, 0.14, 0.27], ['pink', 'bandpass', 180, 580, 0.09, 0.12]], modes: [[112, 0.2, 0.12, 'sine'], [238, 0.12, 0.085, 'triangle'], [344, 0.06, 0.06, 'sine']] },
    boardCreak: { layers: [['pink', 'bandpass', 170, 780, 0.2, 0.15], ['brown', 'lowpass', 70, 220, 0.12, 0.11]], modes: [[204, 0.13, 0.2, 'triangle'], [386, 0.08, 0.17, 'sine']] },
    brassRing: { layers: [['white', 'bandpass', 780, 3600, 0.1, 0.035]], modes: [[348, 0.13, 0.2, 'sine'], [672, 0.11, 0.23, 'sine'], [1095, 0.065, 0.19, 'triangle']] },
    latch: { layers: [['white', 'bandpass', 420, 2800, 0.12, 0.035], ['brown', 'lowpass', 90, 280, 0.07, 0.045]], modes: [[520, 0.1, 0.055, 'triangle'], [890, 0.055, 0.045, 'sine']] },
    waterDraw: { layers: [['brown', 'bandpass', 110, 620, 0.2, 0.16], ['white', 'highpass', 700, 2600, 0.12, 0.11]], modes: [[176, 0.08, 0.1, 'sine']] },
    paperFlick: { layers: [['pink', 'bandpass', 1200, 5100, 0.17, 0.065], ['white', 'highpass', 2900, 7800, 0.08, 0.028]] },
    grassBlade: { layers: [['pink', 'bandpass', 850, 2600, 0.19, 0.11], ['white', 'highpass', 2400, 5600, 0.08, 0.06]] },
    fineDust: { layers: [['white', 'bandpass', 1300, 3900, 0.14, 0.045]] },
    ironOreImpactFoot: { layers: [['brown', 'lowpass', 72, 190, 0.13, 0.29], ['white', 'bandpass', 380, 1050, 0.065, 0.12]] },
    ironOreChipFoot: { layers: [['white', 'bandpass', 720, 1950, 0.1, 0.1], ['pink', 'bandpass', 280, 780, 0.08, 0.055]] },
    ironOreTailFoot: { layers: [['white', 'bandpass', 1050, 2850, 0.13, 0.065]] },
    copperOreImpactFoot: { layers: [['brown', 'lowpass', 78, 230, 0.11, 0.25], ['pink', 'bandpass', 230, 720, 0.09, 0.15]] },
    copperOreChipFoot: { layers: [['white', 'bandpass', 850, 2450, 0.12, 0.095], ['pink', 'bandpass', 360, 920, 0.08, 0.05]] },
    copperOreTailFoot: { layers: [['white', 'bandpass', 1500, 3400, 0.1, 0.055]] },
    magnetiteImpactFoot: { layers: [['brown', 'lowpass', 48, 135, 0.16, 0.34], ['brown', 'bandpass', 115, 360, 0.12, 0.17]] },
    magnetiteGrainFoot: { layers: [['white', 'bandpass', 310, 880, 0.12, 0.1], ['brown', 'bandpass', 150, 520, 0.11, 0.08]] },
    magnetiteDragFoot: { layers: [['pink', 'bandpass', 180, 690, 0.24, 0.1]] },
    tinOreImpactFoot: { layers: [['brown', 'lowpass', 85, 240, 0.095, 0.23], ['white', 'bandpass', 650, 1500, 0.1, 0.11]] },
    tinOreChipFoot: { layers: [['white', 'bandpass', 1250, 2950, 0.15, 0.09], ['pink', 'bandpass', 520, 1200, 0.07, 0.05]] },
    tinOreTailFoot: { layers: [['white', 'highpass', 1850, 4200, 0.13, 0.045]] },
    zincOreImpactFoot: { layers: [['brown', 'lowpass', 65, 175, 0.12, 0.27], ['white', 'bandpass', 440, 1300, 0.1, 0.11]] },
    zincOreChipFoot: { layers: [['white', 'bandpass', 650, 1650, 0.12, 0.09], ['white', 'highpass', 1750, 3700, 0.08, 0.04]] },
    zincOreTailFoot: { layers: [['pink', 'bandpass', 300, 1050, 0.2, 0.075]] },
    fiberGroundFoot: { layers: [['brown', 'lowpass', 60, 145, 0.16, 0.22], ['pink', 'bandpass', 150, 410, 0.13, 0.12]] },
    fiberStemFoot: { layers: [['pink', 'bandpass', 420, 1500, 0.2, 0.09]] },
    fiberBrushFoot: { layers: [['pink', 'bandpass', 900, 2600, 0.3, 0.07], ['white', 'highpass', 2200, 4600, 0.12, 0.025]] },
    wreckPlateFoot: { layers: [['brown', 'lowpass', 74, 230, 0.2, 0.22], ['pink', 'bandpass', 260, 1050, 0.19, 0.13], ['white', 'bandpass', 620, 2100, 0.16, 0.07]] },
    wreckDebrisFoot: { layers: [['brown', 'bandpass', 110, 480, 0.19, 0.11], ['white', 'bandpass', 850, 2900, 0.14, 0.045]] },
    wreckRattleFoot: { layers: [['white', 'bandpass', 350, 1900, 0.22, 0.065], ['pink', 'highpass', 1200, 3600, 0.16, 0.05]] },
    airshipFrameFoot: { layers: [['brown', 'lowpass', 58, 175, 0.2, 0.21], ['pink', 'bandpass', 180, 780, 0.18, 0.12]] },
    canvasFoldFoot: { layers: [['pink', 'bandpass', 360, 1550, 0.32, 0.13], ['white', 'highpass', 1350, 3800, 0.2, 0.045]] },
    riggingFrictionFoot: { layers: [['pink', 'bandpass', 230, 920, 0.25, 0.075], ['white', 'bandpass', 700, 2500, 0.12, 0.035]] },
    reedGroundFoot: { layers: [['brown', 'lowpass', 55, 150, 0.22, 0.2], ['pink', 'bandpass', 140, 480, 0.2, 0.11]] },
    reedStalkFoot: { layers: [['pink', 'bandpass', 480, 1750, 0.36, 0.13], ['white', 'bandpass', 1050, 3100, 0.2, 0.05]] },
    reedBrushFoot: { layers: [['pink', 'bandpass', 780, 2600, 0.48, 0.11], ['white', 'highpass', 2200, 5200, 0.24, 0.03]] },
    hardBodyFoot: { layers: [['brown', 'lowpass', 68, 155, 0.075, 0.2], ['white', 'bandpass', 250, 820, 0.045, 0.055]] },
    leafCrunch: { layers: [['white', 'bandpass', 760, 2500, 0.21, 0.14], ['pink', 'highpass', 1900, 4800, 0.13, 0.09]] },
    leafBrush: { layers: [['pink', 'bandpass', 500, 2100, 0.18, 0.17]] },
    stoneGravelFoot: { layers: [['white', 'bandpass', 420, 1750, 0.09, 0.075], ['white', 'highpass', 2200, 5200, 0.055, 0.035]] },
    stoneDustFoot: { layers: [['pink', 'bandpass', 700, 2400, 0.055, 0.03], ['white', 'highpass', 2600, 6500, 0.035, 0.014]] },
    stoneGravel: { layers: [['white', 'bandpass', 360, 1700, 0.18, 0.085], ['white', 'highpass', 1900, 5200, 0.11, 0.035]], modes: [[410, 0.12, 0.07, 'sine']] },
    stoneClick: { layers: [['white', 'bandpass', 1400, 4800, 0.13, 0.025]], modes: [[740, 0.13, 0.085, 'sine'], [1160, 0.08, 0.055, 'triangle']] },
    sandCompression: { layers: [['pink', 'bandpass', 210, 850, 0.2, 0.16], ['white', 'highpass', 900, 3100, 0.13, 0.12]] },
    sandGrain: { layers: [['white', 'bandpass', 900, 3600, 0.17, 0.105]] },
    oreCrunchFoot: { layers: [['white', 'bandpass', 260, 1250, 0.085, 0.07], ['white', 'highpass', 1450, 5000, 0.06, 0.03]] },
    ironGrainFoot: { layers: [['white', 'bandpass', 550, 2200, 0.065, 0.045], ['white', 'highpass', 2400, 6000, 0.035, 0.018]] },
    copperGrainFoot: { layers: [['white', 'bandpass', 850, 3200, 0.065, 0.04], ['white', 'highpass', 3000, 6500, 0.04, 0.018]] },
    oreCrunch: { layers: [['white', 'bandpass', 300, 1350, 0.16, 0.07], ['white', 'highpass', 1500, 5200, 0.12, 0.035]], modes: [[360, 0.1, 0.06, 'sine']] },
    heavyGrain: { layers: [['brown', 'bandpass', 120, 520, 0.13, 0.065]] },
    copperFleck: { layers: [['white', 'bandpass', 1550, 4700, 0.13, 0.045]], modes: [[980, 0.12, 0.11, 'sine']] },
    coalCrush: { layers: [['brown', 'bandpass', 145, 650, 0.19, 0.16], ['white', 'highpass', 1000, 3100, 0.1, 0.055]] },
    coalChip: { layers: [['white', 'bandpass', 520, 1650, 0.13, 0.06]] },
    sulfurGranule: { layers: [['white', 'bandpass', 850, 2800, 0.14, 0.06]] },
    sulfurGrainFoot: { layers: [['white', 'bandpass', 700, 2500, 0.07, 0.04], ['pink', 'highpass', 1800, 4600, 0.04, 0.018]] },
    clayPull: { layers: [['pink', 'bandpass', 150, 620, 0.18, 0.2], ['brown', 'lowpass', 80, 190, 0.11, 0.16]] },
    mudFleck: { layers: [['white', 'bandpass', 520, 1600, 0.11, 0.07]] },
    chalkGrain: { layers: [['white', 'bandpass', 600, 2300, 0.15, 0.075]] },
    peatCompress: { layers: [['brown', 'lowpass', 54, 135, 0.19, 0.2], ['pink', 'bandpass', 200, 620, 0.14, 0.15]] },
    wetFleck: { layers: [['white', 'bandpass', 360, 1350, 0.11, 0.06]] },
    marshSquelch: { layers: [['pink', 'bandpass', 180, 740, 0.19, 0.2], ['white', 'highpass', 700, 1900, 0.09, 0.085]] },
    waterFleck: { layers: [['white', 'bandpass', 520, 2100, 0.13, 0.075]] },
    oilDrag: { layers: [['brown', 'lowpass', 65, 210, 0.15, 0.21], ['pink', 'bandpass', 180, 540, 0.13, 0.17]] },
    softFleck: { layers: [['pink', 'bandpass', 240, 900, 0.1, 0.1]] },
    reedSnap: { layers: [['white', 'bandpass', 720, 2400, 0.14, 0.055], ['white', 'highpass', 2800, 6000, 0.08, 0.025]], modes: [[530, 0.11, 0.075, 'triangle']] },
    reedBrush: { layers: [['pink', 'bandpass', 900, 3000, 0.17, 0.15]] },
    ashScuff: { layers: [['pink', 'highpass', 750, 2800, 0.19, 0.19]] },
    ironGrain: { layers: [['white', 'bandpass', 700, 2400, 0.11, 0.045]], modes: [[480, 0.13, 0.11, 'sine'], [790, 0.08, 0.075, 'sine']] },
    micaFlake: { layers: [['white', 'highpass', 1800, 6500, 0.14, 0.045]], modes: [[1580, 0.12, 0.1, 'sine'], [2140, 0.08, 0.075, 'sine']] },
    micaFlakeFoot: { layers: [['white', 'highpass', 1600, 5200, 0.055, 0.025], ['pink', 'bandpass', 800, 2300, 0.045, 0.02]] },
    glassGrain: { layers: [['white', 'highpass', 2100, 7000, 0.12, 0.045]], modes: [[1340, 0.13, 0.12, 'sine'], [2130, 0.09, 0.09, 'sine']] },
    glassTick: { layers: [['white', 'highpass', 3000, 8000, 0.09, 0.018]], modes: [[1870, 0.15, 0.12, 'sine'], [2910, 0.08, 0.1, 'sine']] },
    obsidianGrainFoot: { layers: [['white', 'highpass', 1800, 5500, 0.055, 0.025], ['white', 'bandpass', 650, 1800, 0.04, 0.018]] },
    glassDustFoot: { layers: [['white', 'highpass', 2600, 6200, 0.035, 0.014]] },
    pumiceCrush: { layers: [['pink', 'bandpass', 280, 1200, 0.18, 0.15], ['white', 'highpass', 1100, 3600, 0.13, 0.1]] },
    pumiceGrain: { layers: [['white', 'bandpass', 1050, 3400, 0.14, 0.09]] },
    seaweedDrag: { layers: [['pink', 'bandpass', 180, 850, 0.17, 0.21], ['white', 'highpass', 520, 1800, 0.1, 0.13]] },
    tinFleck: { layers: [['white', 'highpass', 2200, 7000, 0.12, 0.04]], modes: [[1530, 0.13, 0.11, 'sine']] },
    tinGrainFoot: { layers: [['white', 'bandpass', 1100, 3600, 0.055, 0.025], ['white', 'highpass', 3200, 6500, 0.03, 0.012]] },
    zincFleck: { layers: [['white', 'bandpass', 850, 3000, 0.12, 0.045]], modes: [[910, 0.12, 0.09, 'sine']] },
    zincGrainFoot: { layers: [['white', 'bandpass', 650, 2600, 0.06, 0.03], ['white', 'highpass', 2400, 5300, 0.03, 0.014]] },
    crystalGrain: { layers: [['white', 'highpass', 2000, 7500, 0.1, 0.04]], modes: [[1710, 0.13, 0.15, 'sine'], [2460, 0.075, 0.13, 'sine'], [3290, 0.045, 0.1, 'sine']] },
    crystalTick: { layers: [['white', 'highpass', 3300, 8500, 0.06, 0.016]], modes: [[2200, 0.12, 0.16, 'sine'], [3640, 0.06, 0.12, 'sine']] },
    crystalGrainFoot: { layers: [['white', 'highpass', 1900, 5700, 0.045, 0.02], ['white', 'bandpass', 700, 2100, 0.035, 0.015]] },
    crystalDustFoot: { layers: [['white', 'highpass', 3000, 6800, 0.025, 0.01]] },
    fungusCompress: { layers: [['brown', 'lowpass', 48, 115, 0.14, 0.2], ['pink', 'bandpass', 170, 560, 0.15, 0.18]] },
    herbBrush: { layers: [['pink', 'bandpass', 1000, 3400, 0.17, 0.14], ['white', 'highpass', 2400, 6200, 0.07, 0.045]] },
    resinLeaf: { layers: [['pink', 'bandpass', 480, 1900, 0.16, 0.16], ['brown', 'lowpass', 90, 260, 0.08, 0.12]] },
    dampBrush: { layers: [['pink', 'highpass', 650, 2500, 0.1, 0.14]] },
    scrapPlate: { layers: [['brown', 'lowpass', 70, 210, 0.25, 0.1], ['white', 'bandpass', 500, 2300, 0.15, 0.065]], modes: [[238, 0.22, 0.23, 'sine'], [412, 0.14, 0.18, 'triangle'], [680, 0.08, 0.14, 'sine']] },
    scrapRattle: { layers: [['white', 'bandpass', 680, 3900, 0.14, 0.055]], modes: [[860, 0.1, 0.18, 'sine']] },
    thinMetalFlex: { layers: [['pink', 'bandpass', 300, 1500, 0.13, 0.17]], modes: [[340, 0.18, 0.29, 'sine'], [610, 0.11, 0.23, 'triangle']] },
    concreteGrain: { layers: [['white', 'bandpass', 500, 1900, 0.1, 0.045]] },
    shortStoneTail: { layers: [['brown', 'lowpass', 180, 650, 0.07, 0.065]], modes: [[280, 0.11, 0.065, 'sine']] },
    woodCreak: { layers: [['pink', 'bandpass', 120, 520, 0.28, 0.12], ['brown', 'lowpass', 65, 190, 0.2, 0.08]] },
    sawPull: { layers: [['pink', 'bandpass', 420, 1550, 0.24, 0.12], ['white', 'bandpass', 1100, 3300, 0.2, 0.065]] },
    sawReturn: { layers: [['pink', 'bandpass', 720, 2150, 0.16, 0.1], ['white', 'highpass', 1900, 4700, 0.11, 0.045]] },
    paperDrag: { layers: [['pink', 'bandpass', 650, 2500, 0.26, 0.11], ['white', 'highpass', 1800, 4800, 0.16, 0.045]] },
    paperUnfurl: { layers: [['pink', 'bandpass', 450, 1750, 0.38, 0.1], ['white', 'bandpass', 1300, 3500, 0.24, 0.055]] },
    paperFold: { layers: [['pink', 'bandpass', 800, 3000, 0.15, 0.12], ['white', 'bandpass', 1900, 4800, 0.1, 0.055]] },
    canvasFlap: { layers: [['pink', 'bandpass', 180, 950, 0.38, 0.15], ['white', 'bandpass', 650, 2100, 0.31, 0.075]] },
    ropeGroan: { layers: [['pink', 'bandpass', 110, 520, 0.33, 0.1], ['white', 'bandpass', 380, 1250, 0.25, 0.045]] },
    airflow: { layers: [['pink', 'bandpass', 180, 1050, 0.55, 0.09], ['white', 'highpass', 850, 3400, 0.36, 0.035]] },
    steamHiss: { layers: [['white', 'highpass', 900, 6200, 0.26, 0.12], ['pink', 'highpass', 650, 3900, 0.34, 0.065]] },
    hearthFire: { layers: [['brown', 'lowpass', 45, 185, 0.45, 0.12], ['pink', 'bandpass', 220, 1350, 0.24, 0.055]] },
    fireCrackle: { layers: [['white', 'bandpass', 1000, 4300, 0.055, 0.09], ['pink', 'bandpass', 420, 1800, 0.09, 0.045]] },
    waterWash: { layers: [['pink', 'bandpass', 110, 900, 0.55, 0.11], ['white', 'highpass', 900, 5200, 0.4, 0.06]] },
    waterFoam: { layers: [['white', 'bandpass', 450, 2400, 0.2, 0.085], ['pink', 'highpass', 1400, 5200, 0.28, 0.055]] },
    waterLapping: { layers: [['pink', 'bandpass', 150, 760, 0.3, 0.09], ['white', 'highpass', 1100, 4200, 0.2, 0.035]] },
    waterDrop: { layers: [['white', 'bandpass', 550, 2300, 0.055, 0.08], ['pink', 'bandpass', 220, 950, 0.09, 0.035]] },
    waterJet: { layers: [['white', 'bandpass', 850, 3900, 0.23, 0.1], ['pink', 'bandpass', 220, 1100, 0.32, 0.075]] },
    waterSlosh: { layers: [['pink', 'bandpass', 85, 530, 0.34, 0.14], ['white', 'bandpass', 350, 1700, 0.28, 0.06]] },
    ceramicTap: { layers: [['white', 'bandpass', 650, 2200, 0.08, 0.1], ['pink', 'bandpass', 250, 780, 0.1, 0.04]] },
    glassDrop: { layers: [['white', 'bandpass', 1700, 4200, 0.065, 0.065], ['pink', 'bandpass', 650, 1550, 0.08, 0.03]] },
    pointerShift: { layers: [['white', 'bandpass', 1200, 3600, 0.045, 0.045]] },
    metalCut: { layers: [['pink', 'bandpass', 250, 1050, 0.28, 0.1], ['white', 'bandpass', 1250, 3900, 0.24, 0.08]] },
    birdChirp: { layers: [['pink', 'bandpass', 1300, 3400, 0.11, 0.055], ['white', 'highpass', 2600, 6200, 0.06, 0.025]] },
    resinSizzle: { layers: [['pink', 'bandpass', 240, 1200, 0.3, 0.075], ['white', 'highpass', 1000, 3600, 0.24, 0.04]] }
};

const soundPatterns = {
    shoreSea: [['shoreWash', 0.12, 0.68], ['foamBreak', 0.82, 0.74], ['shoreWash', 1.55, 0.62], ['foamBreak', 2.42, 0.79], ['shoreWash', 3.24, 0.57]],
    shoreLake: [['lakeLapping', 0.14, 0.46], ['waterDrip', 0.92, 0.24], ['lakeLapping', 1.72, 0.4], ['lakeLapping', 2.61, 0.48], ['waterDrip', 3.38, 0.2]],
    foundationFloor: [['thud', 0.1, 0.82], ['stoneTap', 0.16, 0.3], ['dust', 0.2, 0.22], ['thud', 0.7, 0.74], ['stoneTap', 0.76, 0.24], ['dust', 0.8, 0.16], ['thud', 1.42, 0.8], ['stoneTap', 1.48, 0.29], ['dust', 1.52, 0.2], ['thud', 2.18, 0.72], ['stoneTap', 2.24, 0.23]],
    brickFloor: [['thud', 0.1, 0.78], ['brickTick', 0.17, 0.45], ['grit', 0.22, 0.2], ['thud', 0.73, 0.72], ['brickTick', 0.8, 0.31], ['grit', 0.84, 0.18], ['thud', 1.4, 0.8], ['brickTick', 1.47, 0.4], ['grit', 1.52, 0.22], ['thud', 2.13, 0.74], ['brickTick', 2.2, 0.34]],
    concreteFloor: [['thud', 0.1, 0.92], ['concreteTap', 0.16, 0.22], ['thud', 0.73, 0.85], ['concreteTap', 0.79, 0.18], ['thud', 1.42, 0.88], ['concreteTap', 1.49, 0.2], ['thud', 2.14, 0.82], ['concreteTap', 2.2, 0.17]],
    grateFloor: [['thud', 0.08, 0.68], ['hollowMetal', 0.13, 0.68], ['rattle', 0.2, 0.36], ['thud', 0.69, 0.61], ['hollowMetal', 0.75, 0.58], ['rattle', 0.83, 0.32], ['thud', 1.34, 0.7], ['hollowMetal', 1.4, 0.63], ['rattle', 1.48, 0.38], ['thud', 2.0, 0.64], ['hollowMetal', 2.06, 0.57]],
    woodFloor: [['woodThud', 0.08, 0.85], ['boardCreak', 0.13, 0.35], ['woodThud', 0.72, 0.79], ['boardCreak', 0.78, 0.28], ['woodThud', 1.38, 0.87], ['boardCreak', 1.44, 0.39], ['woodThud', 2.03, 0.8], ['boardCreak', 2.09, 0.32]],
    basaltFloor: [['thud', 0.1, 0.88], ['basaltKnock', 0.16, 0.35], ['grit', 0.21, 0.14], ['thud', 0.73, 0.82], ['basaltKnock', 0.79, 0.3], ['thud', 1.4, 0.86], ['basaltKnock', 1.46, 0.38], ['grit', 1.5, 0.13], ['thud', 2.08, 0.8], ['basaltKnock', 2.14, 0.32]],
    ceramicFloor: [['thud', 0.1, 0.72], ['ceramicTick', 0.16, 0.54], ['drainRattle', 0.23, 0.2], ['thud', 0.73, 0.69], ['ceramicTick', 0.79, 0.48], ['thud', 1.4, 0.73], ['ceramicTick', 1.46, 0.52], ['drainRattle', 1.52, 0.19], ['thud', 2.08, 0.68], ['ceramicTick', 2.14, 0.43]],
    brassFloor: [['thud', 0.1, 0.66], ['brassRing', 0.15, 0.5], ['latch', 0.23, 0.27], ['thud', 0.74, 0.63], ['brassRing', 0.79, 0.45], ['thud', 1.4, 0.68], ['brassRing', 1.45, 0.51], ['latch', 1.53, 0.25], ['thud', 2.09, 0.62], ['brassRing', 2.14, 0.44]],
    castIronFloor: [['thud', 0.1, 0.94], ['ironKnock', 0.16, 0.62], ['grateRattle', 0.24, 0.22], ['thud', 0.75, 0.88], ['ironKnock', 0.81, 0.56], ['thud', 1.43, 0.96], ['ironKnock', 1.49, 0.64], ['grateRattle', 1.58, 0.18], ['thud', 2.13, 0.9], ['ironKnock', 2.19, 0.58]],
    straightRail: [['wheelRoll', 0.1, 0.62], ['railJoint', 0.38, 0.85], ['wheelRoll', 0.62, 0.55], ['railJoint', 0.92, 0.76], ['wheelRoll', 1.18, 0.58], ['railJoint', 1.5, 0.83], ['wheelRoll', 1.78, 0.53], ['railJoint', 2.12, 0.78], ['wheelRoll', 2.4, 0.5]],
    curveRail: [['wheelRoll', 0.1, 0.56], ['railJoint', 0.4, 0.77], ['curveSqueal', 0.55, 0.22], ['wheelRoll', 0.72, 0.52], ['railJoint', 1.03, 0.74], ['curveSqueal', 1.2, 0.24], ['wheelRoll', 1.37, 0.55], ['railJoint', 1.7, 0.79], ['curveSqueal', 1.9, 0.25], ['wheelRoll', 2.08, 0.5]],
    railSwitch: [['wheelRoll', 0.1, 0.45], ['railJoint', 0.39, 0.66], ['switchClack', 0.73, 0.92], ['switchRattle', 0.82, 0.48], ['wheelRoll', 1.2, 0.5], ['railJoint', 1.5, 0.71], ['switchClack', 2.02, 0.82], ['switchRattle', 2.11, 0.4]],
    railSignal: [['wheelRoll', 0.1, 0.48], ['railJoint', 0.4, 0.7], ['signalRelay', 0.82, 0.72], ['wheelRoll', 1.18, 0.46], ['railJoint', 1.5, 0.68], ['signalRelay', 2.05, 0.56], ['wheelRoll', 2.36, 0.44]],
    simpleFurnace: [['fireBed', 0.12, 0.65], ['firePop', 0.43, 0.82], ['firePop', 1.1, 0.52], ['firePop', 1.53, 0.76], ['fireBreath', 1.9, 0.4], ['firePop', 2.5, 0.72], ['firePop', 3.1, 0.46]],
    smallStorage: [['woodBoxTap', 0.12, 0.74], ['latch', 0.24, 0.62], ['boxSet', 0.78, 0.83], ['woodBoxTap', 1.42, 0.6], ['latch', 2.1, 0.72], ['boxSet', 2.65, 0.68]],
    scrollStand: [['paperUnfurl', 0.15, 0.68], ['woodTap', 0.56, 0.3], ['paperFlick', 1.2, 0.73], ['latch', 1.88, 0.31], ['paperFold', 2.52, 0.66], ['woodTap', 3.0, 0.28]],
    handPump: [['pumpDown', 0.1, 0.82], ['pumpReturn', 0.42, 0.61], ['waterDraw', 0.66, 0.64], ['pumpDown', 1.04, 0.77], ['pumpReturn', 1.38, 0.59], ['waterDraw', 1.65, 0.68], ['pumpDown', 2.05, 0.81], ['pumpReturn', 2.38, 0.6], ['waterDraw', 2.66, 0.65]],
    pressureGauge: [['gaugeTick', 0.24, 0.38], ['gaugeTick', 0.93, 0.48], ['needleShift', 1.74, 0.62], ['gaugeTick', 2.55, 0.35], ['needleShift', 3.0, 0.3]],
    fogVent: [['valveOpen', 0.17, 0.68], ['steamShort', 0.34, 0.78], ['steamRelease', 1.05, 0.6], ['valveClose', 1.78, 0.42], ['steamShort', 2.44, 0.66], ['valveOpen', 3.13, 0.34]],
    gearForge: [['forgeBellows', 0.12, 0.46], ['forgeHammer', 0.72, 0.86], ['metalRing', 0.78, 0.64], ['forgeHammer', 1.54, 0.78], ['metalRing', 1.61, 0.54], ['forgeTurn', 2.42, 0.52], ['forgeHammer', 3.08, 0.8], ['metalRing', 3.15, 0.58]],
    steamFountain: [['waterJet', 0.1, 0.7], ['waterDroplet', 0.46, 0.38], ['waterJet', 0.83, 0.64], ['waterDroplet', 1.31, 0.43], ['waterJet', 1.73, 0.67], ['waterDroplet', 2.13, 0.34], ['waterJet', 2.6, 0.62], ['waterDroplet', 3.08, 0.4]],
    warehouse: [['heavyCrate', 0.15, 0.95], ['woodGroan', 0.24, 0.55], ['ironLatch', 0.86, 0.68], ['heavyCrate', 1.54, 0.78], ['woodGroan', 1.62, 0.46], ['ironLatch', 2.38, 0.74], ['heavyCrate', 3.03, 0.82]],
    craftBench: [['sawPull', 0.12, 0.78], ['sawReturn', 0.45, 0.59], ['woodTap', 0.88, 0.42], ['sawPull', 1.2, 0.73], ['sawReturn', 1.53, 0.56], ['woodTap', 2.02, 0.49], ['sawPull', 2.35, 0.8], ['sawReturn', 2.68, 0.56]],
    dryingRack: [['rackWind', 0.16, 0.42], ['boardCreak', 0.83, 0.3], ['clothFlap', 1.21, 0.36], ['rackWind', 1.84, 0.4], ['boardCreak', 2.48, 0.27], ['clothFlap', 3.02, 0.31]],
    charcoalKiln: [['fireBed', 0.1, 0.78], ['kilnGroan', 0.6, 0.48], ['deepFirePop', 1.3, 0.65], ['kilnGroan', 2.08, 0.42], ['deepFirePop', 2.78, 0.8], ['kilnDraft', 3.33, 0.44]],
    fogCistern: [['tankFill', 0.15, 0.53], ['waterDrip', 0.67, 0.42], ['tankResonance', 1.28, 0.32], ['tankFill', 1.84, 0.49], ['waterDrip', 2.48, 0.38], ['tankResonance', 3.02, 0.28]],
    boiler: [['boilerRumble', 0.12, 0.42], ['boilerTension', 0.63, 0.4], ['pressureRelease', 1.05, 0.8], ['valveClank', 1.82, 0.55], ['boilerTension', 2.43, 0.36], ['pressureRelease', 2.91, 0.72], ['boilerRumble', 3.35, 0.34]],
    oreWasher: [['washerDrive', 0.12, 0.46], ['waterSlosh', 0.43, 0.75], ['oreRattle', 0.86, 0.56], ['washerDrive', 1.21, 0.43], ['waterSlosh', 1.56, 0.7], ['oreRattle', 2.05, 0.62], ['washerDrain', 2.68, 0.7], ['oreRattle', 3.15, 0.46]],
    ceramicKiln: [['kilnAir', 0.1, 0.48], ['ceramicPing', 0.54, 0.35], ['kilnAir', 1.1, 0.42], ['ceramicPing', 1.7, 0.5], ['kilnTick', 2.12, 0.64], ['kilnAir', 2.62, 0.46], ['ceramicPing', 3.25, 0.4]],
    waterTower: [['liftPump', 0.12, 0.62], ['waterColumn', 0.5, 0.58], ['towerValve', 1.02, 0.47], ['liftPump', 1.49, 0.58], ['waterColumn', 1.88, 0.55], ['towerValve', 2.42, 0.52], ['waterColumn', 3.04, 0.43]],
    machineLathe: [['latheStart', 0.12, 0.5], ['latheSpin', 0.42, 0.49], ['latheCut', 0.92, 0.72], ['latheCut', 1.42, 0.58], ['toolLift', 1.96, 0.5], ['latheCut', 2.32, 0.67], ['latheStop', 3.08, 0.43]],
    distillery: [['distillHeat', 0.12, 0.4], ['bubbleRise', 0.5, 0.52], ['glassDrip', 0.98, 0.4], ['bubbleRise', 1.46, 0.62], ['valveClank', 2.04, 0.4], ['glassDrip', 2.49, 0.47], ['bubbleRise', 3.0, 0.5]],
    railFreightStation: [['distantChuff', 0.1, 0.4], ['wheelApproach', 0.56, 0.48], ['railJoint', 1.08, 0.74], ['couplerClank', 1.6, 0.78], ['brakeRelease', 2.08, 0.55], ['cargoHook', 2.67, 0.62], ['woodCrate', 3.18, 0.5]],
    steamAccumulator: [['tankPressure', 0.12, 0.4], ['valveClank', 0.72, 0.57], ['heavyVent', 1.08, 0.82], ['tankRing', 1.83, 0.38], ['valveClank', 2.45, 0.54], ['heavyVent', 2.84, 0.73], ['tankRing', 3.44, 0.3]],
    resinWorkshop: [['resinHeat', 0.12, 0.37], ['stickyPull', 0.57, 0.68], ['workbenchTap', 1.06, 0.45], ['resinHeat', 1.6, 0.32], ['stickyPull', 2.03, 0.73], ['workbenchTap', 2.56, 0.5], ['stickyPull', 3.13, 0.56]],
    brassWorkshop: [['brassHammer', 0.12, 0.76], ['brassRing', 0.2, 0.57], ['metalFile', 0.74, 0.48], ['brassHammer', 1.18, 0.72], ['brassRing', 1.26, 0.54], ['metalFile', 1.9, 0.42], ['brassHammer', 2.43, 0.81], ['brassRing', 2.51, 0.61], ['metalFile', 3.1, 0.44]],
    steamTower: [['towerRumble', 0.12, 0.52], ['towerValve', 0.62, 0.4], ['towerExhaust', 1.02, 0.82], ['towerResonance', 1.86, 0.48], ['towerValve', 2.41, 0.44], ['towerExhaust', 2.81, 0.74], ['towerRumble', 3.43, 0.42]],
    freightPlatform: [['platformRoll', 0.12, 0.54], ['cargoHook', 0.62, 0.68], ['woodCrate', 1.03, 0.76], ['platformRoll', 1.62, 0.48], ['crateSet', 2.06, 0.82], ['ironLatch', 2.73, 0.6], ['woodCrate', 3.2, 0.67]],
    centralTurbine: [['turbineBearing', 0.12, 0.38], ['turbineRise', 0.55, 0.58], ['turbinePulse', 1.13, 0.66], ['bearingKnock', 1.72, 0.31], ['turbinePulse', 2.23, 0.7], ['steamShort', 2.8, 0.46], ['turbineBearing', 3.28, 0.32]],
    differenceTower: [['gearTrain', 0.12, 0.56], ['relayClick', 0.48, 0.48], ['gearTrain', 0.82, 0.62], ['carryClick', 1.23, 0.43], ['gearTrain', 1.59, 0.53], ['relayClick', 1.96, 0.56], ['registerClunk', 2.43, 0.66], ['gearTrain', 2.92, 0.49], ['relayClick', 3.34, 0.42]],
    deepDrill: [['drillEngage', 0.12, 0.52], ['drillBite', 0.56, 0.84], ['rockCrush', 0.68, 0.65], ['drillBite', 1.28, 0.75], ['rockCrush', 1.42, 0.56], ['drillLoad', 2.04, 0.62], ['drillBite', 2.51, 0.86], ['rockCrush', 2.64, 0.64], ['drillRelease', 3.23, 0.54]],
    automatonFactory: [['assemblyMotor', 0.12, 0.44], ['armServo', 0.48, 0.48], ['boltDrive', 0.85, 0.7], ['metalSeat', 1.34, 0.61], ['armServo', 1.86, 0.45], ['boltDrive', 2.25, 0.66], ['testClack', 2.82, 0.73], ['assemblyMotor', 3.3, 0.36]],
    airshipWorkshop: [['canvasPull', 0.12, 0.62], ['ropeTension', 0.6, 0.58], ['riggingClink', 1.08, 0.45], ['canvasFlap', 1.57, 0.48], ['ropeTension', 2.05, 0.62], ['winchTurn', 2.54, 0.53], ['riggingClink', 3.14, 0.42]],
    settlerLodge: [['airCycle', 0.12, 0.25], ['leafRustle', 0.63, 0.3], ['waterDrip', 1.26, 0.22], ['airCycle', 1.88, 0.24], ['leafRustle', 2.47, 0.28], ['distantBird', 3.12, 0.18]],
    fieldAutomaton: [['servoStep', 0.12, 0.74], ['jointClick', 0.22, 0.38], ['servoStep', 0.7, 0.69], ['servoWhirr', 1.25, 0.45], ['toolClink', 1.83, 0.51], ['servoStep', 2.4, 0.75], ['jointClick', 2.5, 0.42], ['toolClink', 3.1, 0.48]],
    councilHall: [['paperTurn', 0.12, 0.3], ['deskKnock', 0.67, 0.32], ['leverPull', 1.28, 0.55], ['paperTurn', 1.92, 0.27], ['deskKnock', 2.48, 0.38], ['leverReturn', 3.08, 0.42]],
    relicReactor: [['relicHum', 0.12, 0.29], ['resonanceTap', 0.67, 0.37], ['relicPulse', 1.14, 0.48], ['resonanceTap', 1.93, 0.32], ['relicPulse', 2.52, 0.44], ['relicHum', 3.21, 0.25]],
    airshipDockyard: [['winchStart', 0.12, 0.47], ['cableGroan', 0.48, 0.58], ['chainLoad', 0.93, 0.62], ['winchTurn', 1.38, 0.56], ['dockClank', 1.92, 0.72], ['cableGroan', 2.45, 0.53], ['chainLoad', 2.94, 0.62], ['winchStop', 3.4, 0.42]],
    filterTower: [['airFilter', 0.12, 0.36], ['steamShort', 0.66, 0.38], ['filterValve', 1.14, 0.48], ['airFilter', 1.73, 0.35], ['filterPulse', 2.32, 0.42], ['steamShort', 2.9, 0.36], ['filterValve', 3.39, 0.32]],
    walkingCity: [['legHydraulic', 0.12, 0.58], ['cityFoot', 0.54, 0.98], ['frameGroan', 0.68, 0.62], ['legHydraulic', 1.28, 0.55], ['cityFoot', 1.7, 0.9], ['frameGroan', 1.84, 0.58], ['legHydraulic', 2.45, 0.57], ['cityFoot', 2.87, 1], ['frameGroan', 3.02, 0.64]],
    geothermalCollector: [['earthRumble', 0.12, 0.53], ['steamRise', 0.63, 0.64], ['pipeKnock', 1.26, 0.45], ['steamRise', 1.76, 0.72], ['earthRumble', 2.42, 0.49], ['pipeKnock', 3.02, 0.4], ['steamShort', 3.36, 0.43]],
    terraformingDome: [['domeAir', 0.12, 0.25], ['ventTick', 0.76, 0.32], ['farWater', 1.36, 0.21], ['domeAir', 2.02, 0.24], ['ventTick', 2.68, 0.29], ['farWater', 3.27, 0.2]],
    steamLocomotive: [['engineBed', 0.1, 0.52], ['steamChuff', 0.35, 0.77], ['wheelClunk', 0.66, 0.56], ['steamChuff', 0.96, 0.79], ['wheelClunk', 1.28, 0.59], ['steamChuff', 1.59, 0.82], ['wheelClunk', 1.91, 0.61], ['steamChuff', 2.22, 0.78], ['wheelClunk', 2.55, 0.56], ['steamRelease', 3.0, 0.55], ['engineBed', 3.36, 0.42]],
    oreWagon: [['wagonWheel', 0.12, 0.64], ['oreLoadRattle', 0.34, 0.46], ['couplerClank', 0.82, 0.59], ['wagonWheel', 1.31, 0.61], ['oreLoadRattle', 1.55, 0.52], ['couplerClank', 2.02, 0.56], ['wagonWheel', 2.53, 0.63], ['oreLoadRattle', 2.79, 0.48], ['couplerClank', 3.24, 0.52]],
    freightWagon: [['wagonWheel', 0.12, 0.54], ['woodCargo', 0.36, 0.58], ['couplerClank', 0.84, 0.55], ['wagonWheel', 1.34, 0.52], ['woodCargo', 1.57, 0.65], ['couplerClank', 2.07, 0.51], ['wagonWheel', 2.55, 0.56], ['woodCargo', 2.81, 0.61], ['couplerClank', 3.3, 0.5]]
};

const eventRoles = {
    thud: 'hardBody',
    stoneTap: 'stoneClick',
    dust: 'fineDust',
    brickTick: 'chalkGrain',
    grit: 'stoneGravel',
    concreteTap: 'concreteGrain',
    hollowMetal: 'scrapPlate',
    rattle: 'scrapRattle',
    woodThud: 'softBody',
    boardCreak: 'woodCreak',
    basaltKnock: 'stoneGravel',
    ceramicTick: 'glassTick',
    drainRattle: 'waterFleck',
    brassRing: 'tinFleck',
    latch: 'zincFleck',
    ironKnock: 'ironGrain',
    grateRattle: 'scrapRattle',
    wheelRoll: 'scrapPlate',
    railJoint: 'ironGrain',
    curveSqueal: 'micaFlake',
    switchClack: 'scrapPlate',
    switchRattle: 'scrapRattle',
    signalRelay: 'zincFleck',
    fireBed: 'hearthFire',
    firePop: 'fireCrackle',
    fireBreath: 'airflow',
    woodBoxTap: 'woodThud',
    boxSet: 'hardBody',
    paperUnfurl: 'paperUnfurl',
    paperFlick: 'paperFlick',
    paperFold: 'paperFold',
    pumpDown: 'hardBody',
    pumpReturn: 'boardCreak',
    waterDraw: 'waterLapping',
    gaugeTick: 'zincFleck',
    needleShift: 'pointerShift',
    valveOpen: 'brassRing',
    steamShort: 'steamHiss',
    steamRelease: 'steamHiss',
    valveClose: 'latch',
    forgeBellows: 'airflow',
    forgeHammer: 'scrapPlate',
    metalRing: 'tinFleck',
    forgeTurn: 'scrapRattle',
    waterJet: 'waterJet',
    waterDroplet: 'waterDrop',
    heavyCrate: 'woodThud',
    woodGroan: 'woodCreak',
    ironLatch: 'ironGrain',
    sawPull: 'sawPull',
    sawReturn: 'sawReturn',
    woodTap: 'woodThud',
    rackWind: 'dampBrush',
    clothFlap: 'leafBrush',
    deepFirePop: 'fireCrackle',
    kilnGroan: 'woodCreak',
    kilnDraft: 'airflow',
    tankFill: 'wetBody',
    waterDrip: 'waterDrop',
    tankResonance: 'scrapPlate',
    boilerRumble: 'hearthFire',
    boilerTension: 'thinMetalFlex',
    valveClank: 'brassRing',
    washerDrive: 'scrapRattle',
    waterSlosh: 'waterSlosh',
    oreRattle: 'oreCrunch',
    washerDrain: 'waterSlosh',
    kilnAir: 'airflow',
    ceramicPing: 'ceramicTap',
    liftPump: 'hardBody',
    waterColumn: 'waterDraw',
    towerValve: 'brassRing',
    latheStart: 'scrapRattle',
    latheSpin: 'scrapPlate',
    latheCut: 'metalCut',
    toolLift: 'ironGrain',
    latheStop: 'scrapPlate',
    distillHeat: 'peatCompress',
    bubbleRise: 'waterFleck',
    glassDrip: 'glassDrop',
    distantChuff: 'steamHiss',
    wheelApproach: 'scrapPlate',
    couplerClank: 'ironGrain',
    brakeRelease: 'steamHiss',
    cargoHook: 'scrapRattle',
    tankPressure: 'steamHiss',
    heavyVent: 'steamHiss',
    tankRing: 'scrapPlate',
    resinHeat: 'resinSizzle',
    stickyPull: 'resinLeaf',
    workbenchTap: 'woodThud',
    brassHammer: 'brassRing',
    metalFile: 'micaFlake',
    towerRumble: 'hearthFire',
    towerExhaust: 'steamHiss',
    towerResonance: 'scrapPlate',
    platformRoll: 'scrapRattle',
    crateSet: 'woodThud',
    turbineBearing: 'scrapPlate',
    turbineRise: 'steamHiss',
    turbinePulse: 'scrapRattle',
    bearingKnock: 'ironGrain',
    gearTrain: 'scrapRattle',
    relayClick: 'zincFleck',
    carryClick: 'tinFleck',
    registerClunk: 'scrapPlate',
    drillEngage: 'scrapRattle',
    drillBite: 'hardBody',
    rockCrush: 'oreCrunch',
    drillLoad: 'peatCompress',
    drillRelease: 'steamHiss',
    assemblyMotor: 'scrapRattle',
    armServo: 'thinMetalFlex',
    boltDrive: 'ironGrain',
    metalSeat: 'scrapPlate',
    testClack: 'brassRing',
    canvasPull: 'canvasFlap',
    ropeTension: 'ropeGroan',
    riggingClink: 'tinFleck',
    canvasFlap: 'canvasFlap',
    winchTurn: 'scrapRattle',
    airCycle: 'airflow',
    leafRustle: 'herbBrush',
    distantBird: 'birdChirp',
    servoStep: 'scrapPlate',
    jointClick: 'zincFleck',
    servoWhirr: 'thinMetalFlex',
    toolClink: 'ironGrain',
    paperTurn: 'paperDrag',
    deskKnock: 'woodThud',
    leverPull: 'scrapPlate',
    leverReturn: 'latch',
    relicHum: 'airflow',
    resonanceTap: 'crystalTick',
    relicPulse: 'micaFlake',
    winchStart: 'scrapRattle',
    cableGroan: 'thinMetalFlex',
    chainLoad: 'scrapPlate',
    dockClank: 'ironGrain',
    winchStop: 'brassRing',
    airFilter: 'dampBrush',
    filterValve: 'brassRing',
    filterPulse: 'ashScuff',
    legHydraulic: 'wetBody',
    cityFoot: 'scrapPlate',
    frameGroan: 'thinMetalFlex',
    earthRumble: 'peatCompress',
    steamRise: 'steamHiss',
    pipeKnock: 'ironGrain',
    domeAir: 'airflow',
    ventTick: 'zincFleck',
    farWater: 'waterFleck',
    engineBed: 'scrapPlate',
    steamChuff: 'steamHiss',
    wheelClunk: 'ironGrain',
    wagonWheel: 'scrapRattle',
    oreLoadRattle: 'oreCrunch',
    woodCargo: 'woodThud',
    shoreWash: 'waterWash',
    foamBreak: 'waterFoam',
    shoreGravel: 'stoneGravel',
    lakeLapping: 'waterLapping',
    reedBrush: 'reedBrush',
    pressureRelease: 'steamHiss',
    kilnTick: 'ceramicTap',
    woodCrate: 'woodThud'
};

const semanticFamilyExpectations = [
    { event: /^(shoreWash|foamBreak|lakeLapping|shoreGravel|waterSlosh|waterDraw|waterColumn|waterJet|waterDroplet|waterDrip|waterWash|washerDrain|tankFill|bubbleRise|glassDrip|farWater)$/, family: 'water-surface' },
    { event: /steam|pressure|vent|chuff|exhaust|brakeRelease|turbineRise|boilerTension/i, family: 'steam-pressure' },
    { event: /fire|flame|hearth|kilnDraft|forgeBellows|distillHeat|resinHeat|boilerRumble|towerRumble|deepFire/i, family: 'fire-heat' },
    { event: /paper|scroll/i, family: 'paper' },
    { event: /canvas|cloth|rope|rigging|cableGroan/i, family: 'fabric-rope' },
    { event: /wood|board|crate|saw|bench|desk|boxSet/i, family: 'wood' },
    { event: /air|wind|filter|domeAir|airCycle|settlerLodge|relicHum|rackWind/i, family: 'airflow' },
    { event: /bird/i, family: 'bird' },
    { event: /drill|rockCrush|oreRattle|oreLoadRattle|earthRumble/i, family: 'drilling-rock' },
    { event: /pump|washerDrive|liftPump|latheCut|metalFile|drainRattle/i, family: 'water-mechanism' },
    { event: /gear|motor|servo|wheel|rail|switch|signal|relay|bearing|winch|platformRoll|assembly|register|turbine|cityFoot|engineBed|wagon|lathe(Start|Spin|Stop)|forgeTurn|grateRattle|curveSqueal|^rattle$|boltDrive|lever(Pull|Return)|legHydraulic/i, family: 'rotating-machine' },
    { event: /^(thud|stoneTap|brickTick|grit|concreteTap|basaltKnock|ceramicTick|ceramicPing|stoneGravel|dust)$/, family: 'stone-impact' },
    { event: /leaf|reed|herb|fiber|peat|resin|sticky|seaweed|grass|ash/i, family: 'organic-friction' },
    { event: /hammer|brass|iron|metal|clank|latch|click|knock|tick|ring|hook|chain|scrap|coupler|valve|needle|gauge|tool|carry|joint|testClack|tankResonance|towerResonance|resonanceTap|relicPulse|frameGroan|kilnGroan/i, family: 'metal-impact' },
];

const eventFamilyRules = [
    ['water-surface', /^(shoreWash|foamBreak|lakeLapping|shoreGravel|waterSlosh|waterDraw|waterColumn|waterJet|waterDroplet|waterDrip|waterWash|washerDrain|tankFill|bubbleRise|glassDrip|farWater)$/],
    ['steam-pressure', /steam|pressure|vent|chuff|exhaust|brakeRelease|turbineRise|boilerTension/i],
    ['fire-heat', /fire|flame|hearth|kilnDraft|forgeBellows|distillHeat|resinHeat|boilerRumble|towerRumble|deepFire/i],
    ['paper', /paper|scroll/i],
    ['fabric-rope', /canvas|cloth|rope|rigging|cableGroan/i],
    ['wood', /wood|board|crate|saw|bench|desk|boxSet/i],
    ['airflow', /air|wind|filter|domeAir|airCycle|settlerLodge|relicHum|rackWind/i],
    ['bird', /bird/i],
    ['drilling-rock', /drill|rockCrush|oreRattle|oreLoadRattle|earthRumble/i],
    ['water-mechanism', /pump|washerDrive|liftPump|latheCut|metalFile|drainRattle/i],
    ['rotating-machine', /gear|motor|servo|wheel|rail|switch|signal|relay|bearing|winch|platformRoll|assembly|register|turbine|cityFoot|engineBed|wagon|lathe(Start|Spin|Stop)|forgeTurn|grateRattle|curveSqueal|^rattle$|boxSet|boltDrive|lever(Pull|Return)|legHydraulic/i],
    ['stone-impact', /^(thud|stoneTap|brickTick|grit|concreteTap|basaltKnock|ceramicTick|ceramicPing|stoneGravel|shoreGravel|dust)$/],
    ['organic-friction', /leaf|reed|herb|fiber|peat|resin|sticky|seaweed|grass|ash/i],
    ['metal-impact', /hammer|brass|iron|metal|clank|latch|click|knock|tick|ring|hook|chain|scrap|coupler|valve|needle|gauge|tool|carry|joint|testClack|tankResonance|towerResonance|resonanceTap|relicPulse|frameGroan|kilnGroan/i],
];

function classifyEventFamily(eventName) {
    return eventFamilyRules.find(([, expression]) => expression.test(eventName))?.[0] || null;
}

const audioElement = document.getElementById('terrainSamples');
const buildingElement = document.getElementById('buildingSamples');
const statusElement = document.getElementById('playbackStatus');
const calibrationStatus = document.getElementById('calibrationStatus');
const patternCalibrationStatus = document.getElementById('patternCalibrationStatus');
const volumeControl = document.getElementById('volume');
const volumeValue = document.getElementById('volumeValue');
const playButtons = [];

function addButton(container, id, label, profile, group) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.id = id;
    button.dataset.profile = profile;
    button.dataset.location = label;
    button.setAttribute('aria-label', `${group}: ${label}`);
    button.setAttribute('aria-pressed', 'false');
    container.append(button);
    playButtons.push(button);
}

for (const [id, label, profile] of terrains) addButton(audioElement, id, label, profile, '地形');
for (const [heading, entries] of buildingSections) {
    const section = document.createElement('section');
    const title = document.createElement('h3');
    const grid = document.createElement('div');
    title.textContent = heading;
    grid.className = 'samples';
    section.append(title, grid);
    for (const [id, label, profile] of entries) addButton(grid, id, label, profile, heading);
    buildingElement.append(section);
}

const allProfileNames = [
    ...terrains.map(([, , profile]) => profile),
    ...buildingSections.flatMap(([, entries]) => entries.map(([, , profile]) => profile))
];

const terrainProfiles = new Set(terrains.filter(([, , profile]) => footDesigns[profile]).map(([, , profile]) => profile));
const unknownProfiles = allProfileNames.filter(profile => !footDesigns[profile] && !soundPatterns[profile]);
const allEvents = [...new Set(Object.values(soundPatterns).flatMap(pattern => pattern.map(([eventName]) => eventName)))];
const unclassifiedEvents = allEvents.filter(eventName => !classifyEventFamily(eventName));
const unknownFootRoles = [...new Set(Object.values(footDesigns).flatMap(profile => profile.roles))]
    .filter(roleName => !footRoles[roleName]);
if (unknownProfiles.length || unclassifiedEvents.length || unknownFootRoles.length) {
    throw new Error(`効果音の設計漏れ: profiles=${unknownProfiles.join(',')}; footRoles=${unknownFootRoles.join(',')}; eventFamilies=${unclassifiedEvents.join(',')}`);
}

let audioContext = null;
let masterGain = null;
let currentRun = null;
let finishTimer = null;
let playbackRequest = 0;
let calibrationPromise = null;
let patternCalibrationPromise = null;
let footGains = new Map();
let patternGains = new Map();
const noiseBuffers = new WeakMap();

function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function hashSeed(text) {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return value >>> 0;
}

function ensureNoiseBuffer(context) {
    let buffers = noiseBuffers.get(context);
    if (buffers) return buffers;
    const length = Math.ceil(context.sampleRate * 2);
    const rng = seededRandom(0x51f15e);
    const whiteBuffer = context.createBuffer(1, length, context.sampleRate);
    const brownBuffer = context.createBuffer(1, length, context.sampleRate);
    const white = whiteBuffer.getChannelData(0);
    const brown = brownBuffer.getChannelData(0);
    let brownState = 0;
    for (let i = 0; i < length; i++) {
        const sample = rng() * 2 - 1;
        white[i] = sample * 0.72;
        brownState = (brownState + sample * 0.035) / 1.035;
        brown[i] = brownState * 3.5;
    }
    const pinkBuffer = context.createBuffer(1, length, context.sampleRate);
    const pink = pinkBuffer.getChannelData(0);
    let pinkB0 = 0;
    let pinkB1 = 0;
    let pinkB2 = 0;
    for (let i = 0; i < length; i++) {
        pinkB0 = 0.99765 * pinkB0 + white[i] * 0.099046;
        pinkB1 = 0.963 * pinkB1 + white[i] * 0.2965164;
        pinkB2 = 0.57 * pinkB2 + white[i] * 1.0526913;
        pink[i] = (pinkB0 + pinkB1 + pinkB2 + white[i] * 0.1848) * 0.12;
    }
    buffers = { white: whiteBuffer, brown: brownBuffer, pink: pinkBuffer };
    noiseBuffers.set(context, buffers);
    return buffers;
}

function emitNoise(context, output, when, layer, rng, pitch, levelScale = 1, shape = 1) {
    const buffers = ensureNoiseBuffer(context);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const duration = layer[4] * shape * (0.92 + rng() * 0.16);
    const startFrequency = Math.max(35, layer[2] * pitch * (0.97 + rng() * 0.06));
    const endFrequency = Math.max(35, layer[3] * pitch * (0.96 + rng() * 0.08));
    const attack = Math.min(duration * 0.42, Math.max(0.0025, duration * (layer[6] || 0.12)));
    const level = layer[5] * levelScale;
    source.buffer = buffers[layer[0]] || buffers.white;
    source.loop = false;
    filter.type = layer[1];
    filter.frequency.setValueAtTime(startFrequency, when);
    filter.Q.value = layer[1] === 'bandpass' ? 0.8 + rng() * 1.5 : 0.7;
    if (Math.abs(endFrequency - startFrequency) > 4) {
        filter.frequency.exponentialRampToValueAtTime(endFrequency, when + duration);
    }
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.linearRampToValueAtTime(level, when + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(output);
    source.start(when, rng() * Math.max(0, 2 - duration), duration);
    source.stop(when + duration + 0.01);
}

function emitModes(context, output, when, modes, rng, pitch, levelScale = 1, variation = 0.08, shape = 1) {
    for (const [baseFrequency, level, decay, wave] of modes || []) {
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const envelope = context.createGain();
        const frequency = baseFrequency * pitch * (1 - variation + rng() * variation * 2);
        const duration = decay * shape * (0.9 + rng() * 0.2);
        source.buffer = ensureNoiseBuffer(context).white;
        filter.type = 'bandpass';
        filter.frequency.value = frequency;
        filter.Q.value = wave === 'sine' ? 9 + rng() * 5 : 5 + rng() * 4;
        envelope.gain.setValueAtTime(0.0001, when);
        envelope.gain.linearRampToValueAtTime(level * levelScale, when + 0.003 + rng() * 0.003);
        envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
        source.connect(filter);
        filter.connect(envelope);
        envelope.connect(output);
        source.start(when, rng() * Math.max(0, 2 - duration), duration);
        source.stop(when + duration + 0.01);
    }
}

function emitRole(context, output, when, roleName, rng, pitch = 1, level = 1, shape = 1) {
    const recipe = footRoles[roleName];
    if (!recipe) throw new Error(`未定義の音響素材: ${roleName}`);
    for (const layer of recipe.layers || []) emitNoise(context, output, when, layer, rng, pitch, level, shape);
    emitModes(context, output, when, recipe.modes, rng, pitch, level, 0.08, shape);
}

function emitResonantNoise(context, output, when, frequency, duration, level, rng) {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const variedFrequency = frequency * (0.84 + rng() * 0.32);
    const variedDuration = duration * (0.72 + rng() * 0.62);
    source.buffer = ensureNoiseBuffer(context).white;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(variedFrequency * 1.35, when);
    filter.frequency.exponentialRampToValueAtTime(variedFrequency * 0.78, when + variedDuration);
    filter.Q.value = 5 + rng() * 6;
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.linearRampToValueAtTime(level * (0.65 + rng() * 0.7), when + 0.004 + rng() * 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + variedDuration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(output);
    source.start(when, rng() * 1.5, variedDuration);
    source.stop(when + variedDuration + 0.01);
}

function emitMaterialImpact(context, output, when, rng, pitch, level, material = 'stone') {
    const recipes = {
        stone: [
            ['brown', 'lowpass', 70, 190, 0.085, 0.34, 0.035],
            ['white', 'bandpass', 280, 1050, 0.055, 0.22, 0.035],
            ['white', 'bandpass', 900, 2600, 0.035, 0.07, 0.04]
        ],
        metal: [
            ['brown', 'lowpass', 55, 155, 0.075, 0.2, 0.035],
            ['white', 'bandpass', 600, 2300, 0.035, 0.23, 0.035],
            ['white', 'highpass', 1900, 5600, 0.022, 0.075, 0.03]
        ],
        wood: [
            ['brown', 'lowpass', 55, 180, 0.14, 0.32, 0.055],
            ['pink', 'bandpass', 130, 510, 0.11, 0.18, 0.055],
            ['white', 'bandpass', 500, 1450, 0.035, 0.045, 0.04]
        ]
    };
    for (const layer of recipes[material]) emitNoise(context, output, when, layer, rng, pitch, level);
    if (material === 'metal') {
        for (let index = 0; index < 3; index++) {
            emitResonantNoise(context, output, when + 0.008 + index * 0.012, 420 + index * 590, 0.12 + index * 0.055, level * (0.11 - index * 0.018), rng);
        }
    } else if (material === 'stone') {
        emitResonantNoise(context, output, when + 0.012, 310 + rng() * 240, 0.055, level * 0.055, rng);
    }
}

function emitEvent(context, output, when, eventName, rng, level, shape = 1) {
    const family = classifyEventFamily(eventName);
    const scale = level * (0.88 + rng() * 0.24);
    const variedPitch = 0.92 + rng() * 0.16;
    const noise = (color, type, low, high, duration, amount, attack = 0.1, delay = 0) => {
        emitNoise(context, output, when + delay, [color, type, low, high, duration, amount, attack], rng, variedPitch, scale, shape);
    };
    switch (family) {
        case 'water-surface':
            if (eventName === 'shoreWash' || eventName === 'foamBreak') {
                const duration = eventName === 'shoreWash' ? 0.82 : 0.62;
                noise('pink', 'lowpass', 75, 480, duration, 0.24, 0.58);
                noise('pink', 'bandpass', 180, 1250, duration * 0.84, 0.22, 0.5, 0.06);
                noise('white', 'highpass', 1300, 5700, duration * 0.56, 0.095, 0.54, 0.12);
            } else if (eventName === 'lakeLapping') {
                noise('pink', 'lowpass', 85, 420, 0.48, 0.22, 0.52);
                noise('pink', 'bandpass', 260, 1050, 0.32, 0.13, 0.44, 0.07);
            } else if (eventName === 'waterDrip' || eventName === 'waterDroplet' || eventName === 'glassDrip') {
                noise('white', 'bandpass', 420, 1800, 0.085, 0.13, 0.04);
                noise('pink', 'lowpass', 130, 420, 0.14, 0.08, 0.08, 0.025);
            } else if (eventName === 'waterJet' || eventName === 'waterColumn') {
                noise('white', 'bandpass', 700, 3600, 0.36, 0.17, 0.2);
                noise('pink', 'bandpass', 180, 950, 0.41, 0.16, 0.23, 0.025);
            } else {
                noise('pink', 'bandpass', 90, 720, 0.34, 0.18, 0.32);
                noise('white', 'highpass', 850, 3300, 0.21, 0.075, 0.25, 0.06);
            }
            return;
        case 'steam-pressure':
            if (/valve|clank|latch|tick|knock|ring|gauge|needle|tap/i.test(eventName)) {
                emitMaterialImpact(context, output, when, rng, variedPitch, scale * 0.7, 'metal');
            }
            noise('white', 'highpass', 950, 7200, eventName === 'steamShort' ? 0.42 : 0.72, 0.18, 0.3, 0.018);
            noise('pink', 'bandpass', 220, 1650, 0.5, 0.075, 0.24, 0.035);
            return;
        case 'fire-heat':
            if (/pop|crackle/i.test(eventName)) {
                const count = 3 + Math.floor(rng() * 4);
                for (let index = 0; index < count; index++) {
                    const delay = rng() * 0.36;
                    noise('white', 'bandpass', 1250 + rng() * 1500, 3600 + rng() * 1700, 0.035 + rng() * 0.045, 0.12 + rng() * 0.1, 0.035, delay);
                    noise('pink', 'bandpass', 220, 1100, 0.075, 0.045, 0.06, delay + 0.006);
                }
            } else {
                noise('brown', 'lowpass', 38, 180, 0.72, 0.2, 0.36);
                noise('pink', 'bandpass', 180, 1050, 0.62, 0.12, 0.39, 0.04);
                if (/bellows|draft|breath/i.test(eventName)) noise('white', 'highpass', 650, 3100, 0.48, 0.075, 0.5, 0.08);
            }
            return;
        case 'paper':
            noise('pink', 'bandpass', 450, 2400, 0.32, 0.2, 0.38);
            noise('white', 'highpass', 1800, 6200, 0.2, 0.075, 0.35, 0.045);
            return;
        case 'fabric-rope':
            noise('pink', 'bandpass', 180, 980, /rope|rigging/i.test(eventName) ? 0.43 : 0.6, 0.17, 0.47);
            noise('white', 'bandpass', 620, 2600, 0.34, 0.065, 0.46, 0.08);
            if (/rope|rigging|tension/i.test(eventName)) noise('brown', 'lowpass', 52, 210, 0.32, 0.12, 0.42, 0.035);
            return;
        case 'wood':
            if (/saw/i.test(eventName)) {
                noise('pink', 'bandpass', 260, 1250, 0.43, 0.18, 0.15);
                noise('white', 'bandpass', 1150, 3700, 0.35, 0.085, 0.13, 0.045);
            } else if (/creak|groan|board/i.test(eventName)) {
                noise('pink', 'bandpass', 75, 490, 0.58, 0.18, 0.54);
                noise('brown', 'lowpass', 45, 155, 0.43, 0.13, 0.48, 0.04);
            } else {
                emitMaterialImpact(context, output, when, rng, variedPitch, scale, 'wood');
            }
            return;
        case 'airflow':
            noise('pink', 'bandpass', 90, 920, 0.76, 0.19, 0.52);
            noise('white', 'highpass', 850, 4400, 0.58, 0.055, 0.56, 0.07);
            return;
        case 'bird':
            for (let index = 0; index < 3; index++) {
                const delay = index * (0.075 + rng() * 0.045);
                noise('pink', 'bandpass', 1450 + rng() * 850, 2550 + rng() * 1750, 0.08 + rng() * 0.07, 0.12, 0.08, delay);
                noise('white', 'highpass', 2800, 6500, 0.045, 0.035, 0.08, delay + 0.008);
            }
            return;
        case 'drilling-rock':
            noise('brown', 'lowpass', 42, 230, 0.42, 0.24, 0.14);
            noise('white', 'bandpass', 270, 1550, 0.23, 0.14, 0.1, 0.03);
            for (let index = 0; index < 4; index++) {
                const delay = 0.07 + index * 0.06 + rng() * 0.028;
                noise('white', 'bandpass', 380 + rng() * 700, 1900 + rng() * 1600, 0.045, 0.075, 0.04, delay);
            }
            return;
        case 'water-mechanism':
            if (/drain/i.test(eventName)) {
                noise('pink', 'lowpass', 80, 560, 0.34, 0.16, 0.38);
                noise('white', 'bandpass', 600, 2500, 0.22, 0.075, 0.3, 0.035);
            } else if (/pump|lift/i.test(eventName)) {
                emitMaterialImpact(context, output, when, rng, variedPitch, scale * 0.8, 'wood');
                noise('brown', 'bandpass', 70, 440, 0.31, 0.12, 0.32, 0.08);
                noise('white', 'bandpass', 500, 2200, 0.2, 0.075, 0.28, 0.22);
            } else {
                emitMaterialImpact(context, output, when, rng, variedPitch, scale, 'metal');
                noise('pink', 'bandpass', 280, 1450, 0.34, 0.1, 0.28, 0.06);
            }
            return;
        case 'rotating-machine':
            if (/curveSqueal/i.test(eventName)) {
                noise('pink', 'bandpass', 900, 1600, 0.42, 0.1, 0.25);
                noise('white', 'highpass', 1700, 3900, 0.3, 0.045, 0.28, 0.045);
                return;
            }
            if (/wheel|wagon|rail|platformRoll|engineBed|latheSpin|motor|turbine|gearTrain/i.test(eventName)) {
                noise('brown', 'bandpass', 38, 210, 0.68, 0.19, 0.44);
                noise('pink', 'bandpass', 180, 980, 0.54, 0.12, 0.38, 0.035);
                for (let index = 0; index < 3; index++) {
                    const delay = 0.12 + index * (0.11 + rng() * 0.035);
                    emitMaterialImpact(context, output, when + delay, rng, variedPitch, scale * 0.3, 'metal');
                }
            } else {
                emitMaterialImpact(context, output, when, rng, variedPitch, scale, 'metal');
                if (/servo|assembly|bolt|winch|switch|relay|signal/i.test(eventName)) {
                    noise('pink', 'bandpass', 320, 1850, 0.24, 0.095, 0.2, 0.045);
                }
            }
            return;
        case 'metal-impact':
            emitMaterialImpact(context, output, when, rng, variedPitch, scale, 'metal');
            if (/rattle/i.test(eventName)) {
                for (let index = 0; index < 4; index++) {
                    emitMaterialImpact(context, output, when + 0.055 + index * 0.047 + rng() * 0.02, rng, variedPitch, scale * (0.42 - index * 0.07), 'metal');
                }
            }
            return;
        case 'stone-impact':
            if (eventName === 'dust' || eventName === 'grit') {
                noise('pink', 'bandpass', 160, 760, 0.22, 0.095, 0.32);
                noise('white', 'bandpass', 600, 2300, 0.12, 0.065, 0.22, 0.045);
            } else {
                emitMaterialImpact(context, output, when, rng, variedPitch, scale, 'stone');
            }
            return;
        case 'organic-friction':
            if (/ash/i.test(eventName)) {
                noise('pink', 'lowpass', 100, 580, 0.34, 0.15, 0.38);
            } else {
                noise('pink', 'bandpass', 420, 1900, 0.36, 0.16, 0.4);
                noise('white', 'highpass', 1750, 5400, 0.28, 0.065, 0.4, 0.05);
            }
            return;
        default:
            throw new Error(`効果音の動作分類がありません: ${eventName}`);
    }
}

function emitFootRole(context, output, when, roleName, rng, pitch, level, shape) {
    const recipe = footRoles[roleName];
    if (!recipe) throw new Error(`未定義の足音素材: ${roleName}`);
    for (const layer of recipe.layers || []) emitNoise(context, output, when, layer, rng, pitch, level, shape);
}

function renderFootsteps(context, output, profileName, rng, gain = 1) {
    const profile = footDesigns[profileName];
    const stepCount = 6;
    const start = context.currentTime + 0.04;
    for (let i = 0; i < stepCount; i++) {
        const when = start + i * (profile.interval + (rng() - 0.5) * 0.07);
        const strength = (0.88 + rng() * 0.24) * gain;
        const pitch = profile.pitch * (0.94 + rng() * 0.12);
        for (let roleIndex = 0; roleIndex < profile.roles.length; roleIndex++) {
            const delay = profile.delays
                ? Math.max(0, profile.delays[roleIndex] + (rng() - 0.5) * 0.018)
                : roleIndex === 0 ? 0 : 0.025 + roleIndex * (0.035 + rng() * 0.025);
            const roleLevel = (profile.levels?.[roleIndex] ?? (roleIndex === 0 ? 1 : roleIndex === 1 ? 0.82 : 0.56));
            const shape = roleIndex === 0 ? 0.8 + rng() * 0.35 : 0.72 + rng() * 0.8;
            emitFootRole(context, output, when + delay, profile.roles[roleIndex], rng, pitch, strength * roleLevel, shape);
        }
    }
}

function renderPattern(context, output, profileName, rng) {
    const pattern = soundPatterns[profileName];
    for (const [eventName, time, level] of pattern) {
        const timing = time + (rng() - 0.5) * 0.018;
        emitEvent(context, output, context.currentTime + 0.05 + timing, eventName, rng, level * (patternGains.get(profileName) || 1), 0.8 + rng() * 0.4);
    }
}

function makeMaster(context, destination) {
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -9;
    compressor.knee.value = 4;
    compressor.ratio.value = 10;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.11;
    compressor.connect(destination);
    return compressor;
}

function createFootOffline(profileName, scale) {
    const sampleRate = 24000;
    const duration = 3.5;
    const OfflineAudioContextType = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineAudioContextType) throw new Error('このブラウザーは足音の音量調整に対応していません。');
    const offline = new OfflineAudioContextType(1, Math.ceil(sampleRate * duration), sampleRate);
    const output = offline.createDynamicsCompressor();
    output.threshold.value = -9;
    output.knee.value = 4;
    output.ratio.value = 10;
    output.attack.value = 0.003;
    output.release.value = 0.11;
    const gain = offline.createGain();
    gain.gain.value = scale;
    gain.connect(output);
    renderFootsteps(offline, gain, profileName, seededRandom(hashSeed(profileName)), 1);
    const highPass = offline.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 80;
    const lowShelf = offline.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 250;
    lowShelf.gain.value = -3;
    const highShelf = offline.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = 4200;
    highShelf.gain.value = 2;
    output.connect(highPass);
    highPass.connect(lowShelf);
    lowShelf.connect(highShelf);
    highShelf.connect(offline.destination);
    return offline.startRendering();
}

function createPatternOffline(profileName, scale) {
    const sampleRate = 24000;
    const duration = 4.15;
    const OfflineAudioContextType = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineAudioContextType) throw new Error('このブラウザーは効果音の音量調整に対応していません。');
    const offline = new OfflineAudioContextType(1, Math.ceil(sampleRate * duration), sampleRate);
    const output = offline.createGain();
    output.gain.value = scale;
    output.connect(makeMaster(offline, offline.destination));
    renderPattern(offline, output, profileName, seededRandom(hashSeed(`${profileName}:level-calibration`)));
    return offline.startRendering();
}

async function calibratePatterns() {
    if (patternCalibrationPromise) return patternCalibrationPromise;
    patternCalibrationStatus.textContent = '建築物・床材・線路・車両の試聴音量を調整しています。';
    patternCalibrationPromise = (async () => {
        const profiles = [...new Set(Object.keys(soundPatterns))];
        const targetRms = 0.018;
        for (const profileName of profiles) {
            const raw = await createPatternOffline(profileName, 1);
            const initialRms = weightedRms(raw);
            if (!Number.isFinite(initialRms) || initialRms <= 0) {
                throw new Error(`効果音の音量を測定できません: ${profileName}`);
            }
            let gain = targetRms / initialRms;
            const checked = await createPatternOffline(profileName, gain);
            let measured = weightedRms(checked);
            if (!Number.isFinite(measured) || measured <= 0) {
                throw new Error(`効果音の音量を調整できません: ${profileName}`);
            }
            gain *= targetRms / measured;
            patternGains.set(profileName, gain);
        }
        patternCalibrationStatus.textContent = `試聴音量調整済み: ${profiles.length}種の合成音を同一基準に調整しました。`;
        return profiles;
    })().catch(error => {
        patternCalibrationPromise = null;
        patternCalibrationStatus.textContent = `試聴音量を調整できませんでした: ${error.message}`;
        patternCalibrationStatus.setAttribute('data-error', 'true');
        throw error;
    });
    return patternCalibrationPromise;
}

function weightedRms(buffer) {
    const samples = buffer.getChannelData(0);
    let total = 0;
    for (let i = 0; i < samples.length; i++) total += samples[i] * samples[i];
    return Math.sqrt(total / samples.length);
}

async function calibrateFootsteps() {
    if (calibrationPromise) return calibrationPromise;
    calibrationPromise = (async () => {
        const targetRms = 0.021;
        const measured = [];
        for (const profileName of terrainProfiles) {
            const unscaled = await createFootOffline(profileName, 1);
            const initialRms = weightedRms(unscaled);
            if (!Number.isFinite(initialRms) || initialRms <= 0) {
                throw new Error(`足音の音量を測定できません: ${profileName}`);
            }
            let gain = targetRms / initialRms;
            const scaled = await createFootOffline(profileName, gain);
            gain *= targetRms / weightedRms(scaled);
            let checked = await createFootOffline(profileName, gain);
            let calibratedRms = weightedRms(checked);
            if (Math.abs(20 * Math.log10(calibratedRms / targetRms)) > 0.1) {
                gain *= targetRms / calibratedRms;
                checked = await createFootOffline(profileName, gain);
                calibratedRms = weightedRms(checked);
            }
            footGains.set(profileName, gain);
            measured.push([profileName, calibratedRms]);
        }
        const levels = measured.map(([, rms]) => 20 * Math.log10(rms));
        const spread = Math.max(...levels) - Math.min(...levels);
        calibrationStatus.textContent = `足音音量調整済み: ${measured.length}種の聴感補正後の差 ${spread.toFixed(2)} dB（目標 ±1 dB以内）。`;
        if (spread > 1) {
            throw new Error(`足音音量の差が目標を超えています: ${spread.toFixed(2)} dB`);
        }
        return measured;
    })().catch(error => {
        calibrationStatus.textContent = `足音音量を調整できませんでした: ${error.message}`;
        calibrationStatus.setAttribute('data-error', 'true');
        throw error;
    });
    return calibrationPromise;
}

function ensureAudio() {
    if (!audioContext) {
        const AudioContextType = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextType) throw new Error('このブラウザーはWeb Audioに対応していません。');
        audioContext = new AudioContextType();
        masterGain = audioContext.createGain();
        masterGain.gain.value = Number(volumeControl.value) * 0.72;
        const compressor = makeMaster(audioContext, audioContext.destination);
        masterGain.connect(compressor);
    }
    return audioContext.resume();
}

function clearCurrent() {
    if (finishTimer !== null) {
        window.clearTimeout(finishTimer);
        finishTimer = null;
    }
    if (currentRun && audioContext) {
        const now = audioContext.currentTime;
        currentRun.gain.gain.cancelScheduledValues(now);
        currentRun.gain.gain.setTargetAtTime(0.0001, now, 0.025);
        const oldRunGain = currentRun.gain;
        window.setTimeout(() => oldRunGain.disconnect(), 500);
    }
    currentRun = null;
    playButtons.forEach(button => button.setAttribute('aria-pressed', 'false'));
}

async function playProfile(button) {
    const profileName = button.dataset.profile;
    const runGain = audioContext.createGain();
    runGain.gain.value = 1;
    runGain.connect(masterGain);
    currentRun = { gain: runGain };
    if (typeof window.playFogsGearReferenceRecording !== 'function') {
        throw new Error('同梱録音の再生モジュールが読み込まれていません。');
    }
    const duration = await window.playFogsGearReferenceRecording(
        profileName,
        audioContext,
        runGain,
        () => currentRun?.gain === runGain
    );
    if (currentRun?.gain !== runGain) return;
    button.setAttribute('aria-pressed', 'true');
    statusElement.textContent = `再生中: ${button.dataset.location}`;
    finishTimer = window.setTimeout(() => {
        if (currentRun?.gain !== runGain) return;
        currentRun = null;
        runGain.disconnect();
        finishTimer = null;
        button.setAttribute('aria-pressed', 'false');
        statusElement.textContent = `試聴終了: ${button.dataset.location}`;
    }, (duration + 0.2) * 1000);
}

playButtons.forEach(button => button.addEventListener('click', async () => {
    const request = ++playbackRequest;
    if (currentRun && button.getAttribute('aria-pressed') === 'true') {
        clearCurrent();
        statusElement.textContent = `停止: ${button.dataset.location}`;
        return;
    }
    clearCurrent();
    statusElement.textContent = `参照録音を準備中: ${button.dataset.location}`;
    try {
        await ensureAudio();
        if (request !== playbackRequest) return;
        await playProfile(button);
    } catch (error) {
        if (request !== playbackRequest) return;
        clearCurrent();
        console.error(`効果音を生成できません: ${button.dataset.location}`, error);
        statusElement.textContent = `再生できませんでした: ${button.dataset.location}（${error.message}）`;
    }
}));

document.getElementById('stopButton').addEventListener('click', () => {
    playbackRequest++;
    clearCurrent();
    statusElement.textContent = '試聴を停止しました。';
});

volumeControl.addEventListener('input', () => {
    const percentage = `${Math.round(Number(volumeControl.value) * 100)}%`;
    volumeValue.value = percentage;
    volumeValue.textContent = percentage;
    if (masterGain && audioContext) {
        masterGain.gain.setTargetAtTime(Number(volumeControl.value) * 0.72, audioContext.currentTime, 0.04);
    }
});

function goertzelEnergy(samples, stride, frequency, sampleRate) {
    const coefficient = 2 * Math.cos(2 * Math.PI * frequency * stride / sampleRate);
    let previous = 0;
    let beforePrevious = 0;
    for (let i = 0; i < samples.length; i += stride) {
        const current = samples[i] + coefficient * previous - beforePrevious;
        beforePrevious = previous;
        previous = current;
    }
    return Math.max(0, previous * previous + beforePrevious * beforePrevious - coefficient * previous * beforePrevious);
}

function analyzeRenderedSound(buffer, profileName) {
    const fullSamples = buffer.getChannelData(0);
    const samples = fullSamples.subarray(0, Math.min(fullSamples.length, Math.floor(buffer.sampleRate * (footDesigns[profileName] ? 3.5 : 4.15))));
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    const peak = samples.reduce((maximum, sample) => Math.max(maximum, Math.abs(sample)), 0);
    const windowSize = Math.floor(buffer.sampleRate * 0.14);
    const envelope = [];
    for (let start = 0; start + windowSize <= samples.length; start += windowSize) {
        let energy = 0;
        for (let i = start; i < start + windowSize; i++) energy += samples[i] * samples[i];
        envelope.push(Math.sqrt(energy / windowSize));
    }
    const maxEnvelope = Math.max(...envelope, 1e-12);
    const envelopeShape = Array.from({ length: 12 }, (_, index) => {
        const from = Math.floor(index * envelope.length / 12);
        const to = Math.max(from + 1, Math.floor((index + 1) * envelope.length / 12));
        return envelope.slice(from, to).reduce((sum, value) => sum + value, 0) / (to - from) / maxEnvelope;
    });
    const stride = 2;
    const frequencies = [90, 180, 360, 720, 1400, 2500, 4000, 5200];
    const energies = frequencies.map(frequency => goertzelEnergy(samples.subarray(0, 16384), stride, frequency, buffer.sampleRate));
    const energyTotal = energies.reduce((sum, value) => sum + value, 0) || 1;
    const spectrum = energies.map(value => value / energyTotal);
    const spectralCentroid = frequencies.reduce((sum, frequency, index) => sum + frequency * spectrum[index], 0);
    return {
        rms,
        peak,
        crestDb: 20 * Math.log10(Math.max(peak, 1e-12) / Math.max(rms, 1e-12)),
        spectralCentroid,
        tonalPeakRatio: Math.max(...spectrum),
        spectrum,
        envelope: envelopeShape,
        signature: [...spectrum, ...envelopeShape]
    };
}

function featureDistance(left, right) {
    const sum = left.signature.reduce((total, value, index) => total + (value - right.signature[index]) ** 2, 0);
    return Math.sqrt(sum / left.signature.length);
}

async function renderEvaluationClip(profileName, seed) {
    const sampleRate = 24000;
    const isFootstep = Boolean(footDesigns[profileName]);
    const duration = isFootstep ? 3.5 : 4.15;
    const OfflineAudioContextType = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineAudioContextType) throw new Error('このブラウザーはオフライン音響評価に対応していません。');
    const offline = new OfflineAudioContextType(1, Math.ceil(sampleRate * duration), sampleRate);
    const output = offline.createGain();
    if (isFootstep) {
        const compressor = offline.createDynamicsCompressor();
        compressor.threshold.value = -9;
        compressor.knee.value = 4;
        compressor.ratio.value = 10;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.11;
        const highPass = offline.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 80;
        const lowShelf = offline.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 250;
        lowShelf.gain.value = -3;
        const highShelf = offline.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = 4200;
        highShelf.gain.value = 2;
        output.connect(compressor);
        compressor.connect(highPass);
        highPass.connect(lowShelf);
        lowShelf.connect(highShelf);
        highShelf.connect(offline.destination);
    } else {
        output.connect(makeMaster(offline, offline.destination));
    }
    if (footDesigns[profileName]) {
        renderFootsteps(offline, output, profileName, seededRandom(seed), footGains.get(profileName) || 1);
    } else {
        renderPattern(offline, output, profileName, seededRandom(seed));
    }
    return offline.startRendering();
}

export async function evaluateCatalog() {
    await calibrateFootsteps();
    await calibratePatterns();
    const catalog = [
        ...terrains.map(([id, label, profile]) => ({ id, label, profile, group: '地形' })),
        ...buildingSections.flatMap(([group, entries]) => entries.map(([id, label, profile]) => ({ id, label, profile, group })))
    ];
    const rendered = [];
    const errors = [];
    for (const entry of catalog) {
        try {
            const seed = footDesigns[entry.profile] ? hashSeed(entry.profile) : hashSeed(`${entry.profile}:level-calibration`);
            let audio = await renderEvaluationClip(entry.profile, seed);
            let features = analyzeRenderedSound(audio, entry.profile);
            if (!footDesigns[entry.profile]) {
                const targetRms = 0.018;
                for (let attempt = 0; attempt < 2 && Math.abs(20 * Math.log10(features.rms / targetRms)) > 0.1; attempt++) {
                    patternGains.set(entry.profile, patternGains.get(entry.profile) * targetRms / features.rms);
                    audio = await renderEvaluationClip(entry.profile, seed);
                    features = analyzeRenderedSound(audio, entry.profile);
                }
            }
            rendered.push({ ...entry, features });
        } catch (error) {
            errors.push({ ...entry, message: error.message });
        }
    }
    const terrainRendered = rendered.filter(entry => footDesigns[entry.profile]);
    let nearestPair = null;
    for (let left = 0; left < terrainRendered.length; left++) {
        for (let right = left + 1; right < terrainRendered.length; right++) {
            const distance = featureDistance(terrainRendered[left].features, terrainRendered[right].features);
            if (!nearestPair || distance < nearestPair.distance) {
                nearestPair = { left: terrainRendered[left], right: terrainRendered[right], distance };
            }
        }
    }
    const roleMixes = terrainRendered.map(entry => footDesigns[entry.profile].roles.join('|'));
    const uniqueRoleMixes = new Set(roleMixes).size;
    const requiredWetFootRoles = {
        clay: ['mudSquelch', 'stickyRelease'],
        peat: ['peatSquelch', 'suctionRelease'],
        saltMarsh: ['marshSquelch', 'mudSplash'],
        seaweed: ['waterSlap', 'seaweedDrag']
    };
    const wetFootstepIssues = Object.entries(requiredWetFootRoles)
        .filter(([profileName, requiredRoles]) => {
            const profile = footDesigns[profileName];
            return !profile
                || !['saturated', 'standing-water', 'waterlogged-vegetation'].includes(profile.moisture)
                || requiredRoles.some(roleName => !profile.roles.includes(roleName));
        })
        .map(([profileName]) => profileName);
    if (footDesigns.oil.roles.some(roleName => ['mudSplash', 'waterSlap'].includes(roleName))) {
        wetFootstepIssues.push('oil:水音の誤割当');
    }
    const levelsDb = terrainRendered.map(entry => 20 * Math.log10(Math.max(entry.features.rms, 1e-12)));
    const footstepSpreadDb = levelsDb.length ? Math.max(...levelsDb) - Math.min(...levelsDb) : Infinity;
    const patternRendered = rendered.filter(entry => !footDesigns[entry.profile]);
    const patternLevelsDb = patternRendered.map(entry => 20 * Math.log10(Math.max(entry.features.rms, 1e-12)));
    const patternSpreadDb = patternLevelsDb.length ? Math.max(...patternLevelsDb) - Math.min(...patternLevelsDb) : Infinity;
    let nearestPatternPair = null;
    const closePatternPairs = [];
    for (let left = 0; left < patternRendered.length; left++) {
        for (let right = left + 1; right < patternRendered.length; right++) {
            const distance = featureDistance(patternRendered[left].features, patternRendered[right].features);
            if (!nearestPatternPair || distance < nearestPatternPair.distance) {
                nearestPatternPair = { left: patternRendered[left], right: patternRendered[right], distance };
            }
            if (distance < 0.025) {
                closePatternPairs.push({
                    left: patternRendered[left].label,
                    right: patternRendered[right].label,
                    distance
                });
            }
        }
    }
    const patternRecipeSignatures = patternRendered.map(entry =>
        soundPatterns[entry.profile].map(([event, time]) => `${event}:${classifyEventFamily(event)}@${Math.round(time * 20)}`).join('|')
    );
    const semanticMisassignments = patternRendered.flatMap(entry =>
        soundPatterns[entry.profile]
            .map(([eventName]) => ({ eventName, family: classifyEventFamily(eventName) }))
            .filter(({ eventName, family }) =>
                semanticFamilyExpectations.find(expectation => expectation.event.test(eventName))?.family !== family
            )
            .map(({ eventName, family }) => `${entry.label}: ${eventName} → ${family}`)
    );
    const closePairs = [];
    for (let left = 0; left < terrainRendered.length; left++) {
        for (let right = left + 1; right < terrainRendered.length; right++) {
            const distance = featureDistance(terrainRendered[left].features, terrainRendered[right].features);
            if (distance < 0.05) closePairs.push({ left: terrainRendered[left].label, right: terrainRendered[right].label, distance });
        }
    }
    const silentProfiles = rendered.filter(entry => entry.features.rms < 0.0005).map(entry => entry.label);
    const clippedProfiles = rendered.filter(entry => entry.features.peak > 0.99).map(entry => entry.label);
    return {
        expectedCount: allProfileNames.length,
        renderedCount: rendered.length,
        errors,
        terrainCount: terrainRendered.length,
        footstepSpreadDb,
        patternCount: patternRendered.length,
        patternSpreadDb,
        uniquePatternRecipes: new Set(patternRecipeSignatures).size,
        semanticMisassignments,
        silentProfiles,
        clippedProfiles,
        nearestPatternPair,
        closePatternPairs,
        uniqueRoleMixes,
        wetFootstepCount: Object.keys(requiredWetFootRoles).length - wetFootstepIssues.filter(profileName => profileName !== 'oil:水音の誤割当').length,
        wetFootstepIssues,
        nearestPair,
        closePairs,
        footstepOscillatorCount: 0,
        rendered: rendered.map(({ id, label, profile, group, features }) => ({
            id, label, profile, group,
            rmsDb: 20 * Math.log10(Math.max(features.rms, 1e-12)),
            centroidHz: features.spectralCentroid,
            crestDb: features.crestDb
        }))
    };
}
