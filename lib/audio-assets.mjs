export const AUDIO_CUES = [
  'explore',
  'tilePlace',
  'step',
  'enemyStep',
  'stairs',
  'cardEvent',
  'cardItem',
  'cardOmen',
  'diceRoll',
  'diceStop',
  'checkSuccess',
  'checkFailure',
  'hauntRoll',
  'haunt',
  'attack',
  'hit',
  'mentalHit',
  'traitUp',
  'traitDown',
  'heal',
  'turn',
  'round',
  'objective',
  'objectiveDone',
  'death',
  'enemyDeath',
  'victory',
  'defeat',
];
export const AUDIO_LOOPS = ['lobby', 'exploreMusic', 'hauntMusic', 'manor'];
// A single manifest is also consumed by the portable builder.
export const AUDIO_ASSETS = Object.fromEntries(
  [...AUDIO_CUES, ...AUDIO_LOOPS].map((id) => [id, `/audio/${id}.wav`]),
);
export const AUDIO_DEFAULTS = Object.freeze({
  enabled: false,
  master: 0.8,
  music: 0.3,
  ambience: 0.25,
  effects: 0.75,
});
export function audioSettings(value = {}) {
  return Object.fromEntries(
    Object.entries(AUDIO_DEFAULTS).map(([key, fallback]) => [
      key,
      key === 'enabled'
        ? value[key] === true
        : typeof value[key] === 'number' && Number.isFinite(value[key])
          ? Math.max(0, Math.min(1, value[key]))
          : fallback,
    ]),
  );
}
