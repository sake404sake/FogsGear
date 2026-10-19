import {
    AUDIO_PROFILE_NAMES,
    playFogsGearReferenceRecording,
    startFogsGearReferenceLoop
} from '../../design/game-audio-sfx-reference-player.js?v=4';
import { getCellTypeKey } from './cellRules.js';

const TERRAIN_SOUND_PROFILES = Object.freeze({
    SEA: 'shoreSea',
    LAKE: 'shoreLake',
    PLAINS: 'grass',
    FOREST: 'leaves',
    MOUNTAIN: 'mountain',
    SAND: 'sand',
    RUIN: 'ruin',
    IRON_VEIN: 'ironOre',
    COPPER_VEIN: 'copperOre',
    COAL_SEAM: 'coal',
    SULFUR_DEPOSIT: 'sulfur',
    CLAY_BED: 'clay',
    LIMESTONE: 'limestone',
    PEAT_BOG: 'peat',
    SALT_MARSH: 'saltMarsh',
    OIL_SEEP: 'oil',
    FIBER_FIELD: 'fiber',
    REED_BED: 'reeds',
    ASH_DEPOSIT: 'ash',
    MAGNETITE_VEIN: 'magnetite',
    MICA_OUTCROP: 'mica',
    OBSIDIAN_FIELD: 'obsidian',
    PUMICE_FIELD: 'pumice',
    SEAWEED_BED: 'seaweed',
    TIN_VEIN: 'tinOre',
    ZINC_VEIN: 'zincOre',
    CRYSTAL_VEIN: 'crystal',
    MYCELIUM: 'mycelium',
    HERB_FIELD: 'herbs',
    RESIN_FOREST: 'resinForest',
    MACHINE_WRECK: 'machineWreck',
    AIRSHIP_WRECK: 'airshipWreck',
    FOUNDATION: 'foundation'
});

const SURFACE_SOUND_PROFILES = Object.freeze({
    'foundation-cell': 'foundationFloor',
    'brick-tile': 'brickFloor',
    'concrete-tile': 'concreteFloor',
    'grate-tile': 'grateFloor',
    'wood-tile': 'woodFloor',
    'stone-tile': 'basaltFloor',
    'drain-tile': 'ceramicFloor',
    'access-tile': 'brassFloor',
    'hearth-tile': 'castIronFloor',
    'rail-track': 'straightRail',
    'rail-curve': 'curveRail',
    'rail-switch': 'railSwitch',
    'rail-signal': 'railSignal'
});

const BUILDING_SOUND_PROFILES = Object.freeze({
    'simple-furnace': 'simpleFurnace',
    'simple-storage': 'smallStorage',
    'scroll-stand': 'scrollStand',
    'hand-pump': 'handPump',
    'pressure-gauge-tower': 'pressureGauge',
    'fog-vent': 'fogVent',
    'gear-forge': 'gearForge',
    'steam-fountain': 'steamFountain',
    warehouse: 'warehouse',
    'craft-bench': 'craftBench',
    'drying-rack': 'dryingRack',
    'charcoal-kiln': 'charcoalKiln',
    'fog-cistern': 'fogCistern',
    'boiler-forge': 'boiler',
    'ore-washer': 'oreWasher',
    'ceramic-kiln': 'ceramicKiln',
    'water-tower': 'waterTower',
    'machine-lathe': 'machineLathe',
    'alchemical-distillery': 'distillery',
    'rail-freight-station': 'railFreightStation',
    'steam-accumulator': 'steamAccumulator',
    'resin-workshop': 'resinWorkshop',
    'brass-workshop': 'brassWorkshop',
    'steam-tower': 'steamTower',
    'freight-platform': 'freightPlatform',
    'central-turbine': 'centralTurbine',
    'difference-tower': 'differenceTower',
    'deep-drill': 'deepDrill',
    'automaton-factory': 'automatonFactory',
    'airship-workshop': 'airshipWorkshop',
    'settler-lodge': 'settlerLodge',
    'field-automaton': 'fieldAutomaton',
    'council-hall': 'councilHall',
    'relic-reactor': 'relicReactor',
    'airship-dockyard': 'airshipDockyard',
    'filter-tower': 'filterTower',
    'walking-city-frame': 'walkingCity',
    'geothermal-collector': 'geothermalCollector',
    'terraforming-dome': 'terraformingDome',
    'steam-locomotive': 'steamLocomotive',
    'ore-wagon': 'oreWagon',
    'freight-wagon': 'freightWagon'
});

const assignedProfiles = new Set([
    ...Object.values(TERRAIN_SOUND_PROFILES),
    ...Object.values(SURFACE_SOUND_PROFILES),
    ...Object.values(BUILDING_SOUND_PROFILES)
]);
const unmappedProfiles = AUDIO_PROFILE_NAMES.filter(profile => !assignedProfiles.has(profile));
const invalidProfiles = [...assignedProfiles].filter(profile => !AUDIO_PROFILE_NAMES.includes(profile));
if (unmappedProfiles.length || invalidProfiles.length) {
    throw new Error(`ゲーム内の音響プロフィール割り当てが不整合です: 未接続=${unmappedProfiles.join(', ')}; 不明=${invalidProfiles.join(', ')}`);
}

let audioContext;
let masterGain;
const BUILDING_SOUND_AUDIBLE_RADIUS = 14;
const buildingSoundVoices = new Map();

function getAudioOutput() {
    if (!audioContext) {
        const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextConstructor) throw new Error('このブラウザーはWeb Audio APIに対応していません。');
        audioContext = new AudioContextConstructor();
        masterGain = audioContext.createGain();
        masterGain.gain.value = 0.48;
        masterGain.connect(audioContext.destination);
    }
    return { context: audioContext, output: masterGain };
}

export function getTerrainSoundProfile(tile) {
    const type = tile?.isLake || tile?.type === 'LAKE'
        ? 'LAKE'
        : tile?.isSea || tile?.isOcean || ['SEA', 'OCEAN'].includes(tile?.type) || tile?.type === 3
            ? 'SEA'
            : typeof tile?.type === 'string' && Object.hasOwn(TERRAIN_SOUND_PROFILES, tile.type)
                ? tile.type
                : getCellTypeKey(tile);
    return TERRAIN_SOUND_PROFILES[type] || null;
}

export function getSurfaceSoundProfile(buildingId) {
    return SURFACE_SOUND_PROFILES[buildingId] || null;
}

export function getBuildingSoundProfile(buildingId) {
    return BUILDING_SOUND_PROFILES[buildingId] || null;
}

export function getShoreSoundProfile(map, x, y) {
    const neighbors = [
        map[y - 1]?.[x],
        map[y]?.[x + 1],
        map[y + 1]?.[x],
        map[y]?.[x - 1]
    ].filter(Boolean);
    const shoreline = neighbors.find(tile => ['shoreSea', 'shoreLake'].includes(getTerrainSoundProfile(tile)));
    return shoreline ? getTerrainSoundProfile(shoreline) : null;
}

export function playGameSound(profileName, { singleHit = false } = {}) {
    if (!profileName) return;
    try {
        const { context, output } = getAudioOutput();
        if (context.state === 'suspended') void context.resume().catch(error => {
            console.error('ゲーム効果音の音声出力を開始できません', error);
        });
        void playFogsGearReferenceRecording(profileName, context, output, () => true, { singleHit })
            .catch(error => console.error(`ゲーム効果音を再生できません (${profileName})`, error));
    } catch (error) {
        console.error(`ゲーム効果音を再生できません (${profileName})`, error);
    }
}

function setVoiceGain(voice, value, duration) {
    const now = voice.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(value, now + duration);
}

function stopBuildingVoice(instanceId, voice) {
    if (voice.stopped) return;
    voice.stopped = true;
    if (buildingSoundVoices.get(instanceId) === voice) buildingSoundVoices.delete(instanceId);
    voice.stopLoop?.();
    setVoiceGain(voice, 0, 0.25);
    window.setTimeout(() => {
        voice.gain.disconnect();
    }, 300);
}

export function updateBuildingSoundscape(buildings, playerPosition) {
    const desiredVoices = new Map();
    if (playerPosition && document.visibilityState !== 'hidden') {
        for (const building of buildings) {
            if (!building.active || !building.profile) continue;
            const distance = Math.hypot(
                building.x - playerPosition.x,
                building.y - playerPosition.y
            );
            if (distance >= BUILDING_SOUND_AUDIBLE_RADIUS) continue;
            const proximity = 1 - distance / BUILDING_SOUND_AUDIBLE_RADIUS;
            desiredVoices.set(building.instanceId, {
                profile: building.profile,
                volume: 0.8 * proximity ** 1.5
            });
        }
    }

    for (const [instanceId, voice] of buildingSoundVoices) {
        const desired = desiredVoices.get(instanceId);
        if (!desired || desired.profile !== voice.profile) {
            stopBuildingVoice(instanceId, voice);
            continue;
        }
        setVoiceGain(voice, desired.volume, 0.35);
    }

    for (const [instanceId, desired] of desiredVoices) {
        if (buildingSoundVoices.has(instanceId)) continue;
        try {
            const { context } = getAudioOutput();
            if (context.state === 'suspended') void context.resume().catch(error => {
                console.error('建物の稼働音を開始できません', error);
            });
            const gain = context.createGain();
            gain.gain.value = 0;
            gain.connect(masterGain);
            const voice = { context, gain, profile: desired.profile, stopped: false, stopLoop: null };
            buildingSoundVoices.set(instanceId, voice);
            setVoiceGain(voice, desired.volume, 0.4);
            void startFogsGearReferenceLoop(
                desired.profile,
                context,
                gain,
                () => buildingSoundVoices.get(instanceId) === voice && !voice.stopped
            ).then(stopLoop => {
                voice.stopLoop = stopLoop;
                if (voice.stopped) stopLoop();
            }).catch(error => {
                if (buildingSoundVoices.get(instanceId) === voice) {
                    buildingSoundVoices.delete(instanceId);
                    voice.stopped = true;
                    setVoiceGain(voice, 0, 0.1);
                    window.setTimeout(() => gain.disconnect(), 150);
                }
                console.error(`建物の稼働音を再生できません (${desired.profile})`, error);
            });
        } catch (error) {
            console.error(`建物の稼働音を再生できません (${desired.profile})`, error);
        }
    }
}
