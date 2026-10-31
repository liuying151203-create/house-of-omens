export const SPATIAL_LOOPS = [
  'floorGround',
  'floorUpper',
  'floorBasement',
  'roomBoiler',
  'roomLab',
  'roomChapel',
  'roomClock',
  'roomMusic',
  'roomSteam',
  'themeBells',
  'themeMirror',
  'themeFlood',
  'themeWolves',
  'themeBloodmoon',
];
export const STORY_CUES = [
  'storyWhisper',
  'storyCreak',
  'storyDoor',
  'storySteps',
  'storyWind',
  'storyAsh',
  'storyFlame',
  'storyPaper',
  'storyUnease',
  'storyBite',
];
export const VARIANT_CUES = [
  'stepWood2',
  'stepWood3',
  'stepStone1',
  'stepStone2',
  'stepWet1',
  'stepWet2',
  'stepWolf1',
  'stepWolf2',
  'stepSpectre1',
  'stepSpectre2',
  'diceRoll2',
  'diceRoll3',
];
export const STORY_BY_CARD = {
  whisper: 'storyWhisper',
  boards: 'storyCreak',
  door: 'storyDoor',
  footsteps: 'storySteps',
  cold: 'storyWind',
  ash: 'storyAsh',
  lantern: 'storyFlame',
  notes: 'storyPaper',
  cipher: 'storyUnease',
  portrait: 'storyUnease',
  'bite-mark': 'storyBite',
};
const rooms = {
  boiler: 'roomBoiler',
  'bloodmoon-boiler': 'roomBoiler',
  laboratory: 'roomLab',
  'bloodmoon-laboratory': 'roomLab',
  sterilization: 'roomLab',
  chapel: 'roomChapel',
  altar: 'roomChapel',
  ritual: 'roomChapel',
  clock: 'roomClock',
  music: 'roomMusic',
};
export function footMaterial(room) {
  if (['well', 'laundry', 'greenhouse', 'winter', 'garden'].includes(room?.id))
    return 'wet';
  return room?.floor === -1 ? 'stone' : 'wood';
}
// Uses the visible actor's actual room, never the map's viewFloor or a hovered tile.
export function spatialLayers(game, step, hauntWaiting = false) {
  if (!game) return [{ id: 'manor', bus: 'ambience', gain: 0.7 }];
  if (game.phase === 'over') return [];
  const actor = game.heroes.find((h) => h.id === (step?.heroId ?? game.active));
  const location = game.rooms.find((r) => r.id === (step?.pos ?? actor?.pos));
  const layers = [
    {
      id: location
        ? { '-1': 'floorBasement', 0: 'floorGround', 1: 'floorUpper' }[
            location.floor
          ] || 'manor'
        : 'manor',
      bus: 'ambience',
      gain: 0.65,
    },
  ];
  const detail = rooms[location?.special] || rooms[location?.id];
  if (detail) layers.push({ id: detail, bus: 'ambience', gain: 0.3 });
  if (
    location &&
    game.bloodmoon?.steam?.some(
      (s) => s.active && s.roomIds?.includes(location.id),
    )
  )
    layers.push({ id: 'roomSteam', bus: 'ambience', gain: 0.3 });
  if (game.phase === 'haunt' && !hauntWaiting) {
    const theme = {
      bells: 'themeBells',
      mirror: 'themeMirror',
      flood: 'themeFlood',
      werewolf: 'themeWolves',
      bloodmoon: 'themeBloodmoon',
    }[game.scenario];
    if (theme)
      layers.push({
        id: theme,
        bus: 'music',
        gain:
          game.scenario === 'bloodmoon'
            ? ({ awakening: 0.22, full: 0.38, blood: 0.55 }[
                game.bloodmoonCombat?.moon
              ] ?? 0.22)
            : game.scenario === 'flood' && game.powered
              ? 0.2
              : 0.35,
      });
  }
  return layers;
}
export function variantPool(id, material) {
  if (id === 'diceRoll') return ['diceRoll', 'diceRoll2', 'diceRoll3'];
  if (id === 'enemyStep' || (id === 'step' && material === 'wolf'))
    return material === 'wolf'
      ? ['stepWolf1', 'stepWolf2']
      : ['stepSpectre1', 'stepSpectre2'];
  if (id !== 'step') return [id];
  return material === 'stone'
    ? ['stepStone1', 'stepStone2']
    : material === 'wet'
      ? ['stepWet1', 'stepWet2']
      : ['step', 'stepWood2', 'stepWood3'];
}
