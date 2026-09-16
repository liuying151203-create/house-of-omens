import { SCENARIOS, TRAITS, TRAIT_KEYS } from './game-data.mjs';

const orderRules = (a, b) =>
  (a.priority || 0) - (b.priority || 0) ||
  (a.sourceId || '').localeCompare(b.sourceId || '') ||
  a.id.localeCompare(b.id);

function active(rule, game, context) {
  return (
    (!rule.when?.phase || rule.when.phase === game.phase) &&
    (!rule.when?.scenario || rule.when.scenario === game.scenario) &&
    (rule.heroId === undefined || rule.heroId === context.heroId) &&
    (rule.roomId === undefined || rule.roomId === context.roomId) &&
    (rule.trait === undefined || rule.trait === context.trait)
  );
}

function matchingRules(rules, game, context) {
  return (rules || [])
    .filter((rule) => active(rule, game, context))
    .map((rule) => structuredClone(rule))
    .sort(orderRules);
}

function applyPatch(view, patch) {
  for (const [key, value] of Object.entries(patch))
    if (value !== undefined) view[key] = structuredClone(value);
}

export function roomRuleView(game, room, heroId) {
  const view = {
      ...structuredClone(room),
      moveCostDelta: 0,
      ruleSources: [],
    },
    rules = matchingRules(game.roomRules, game, {
      heroId,
      roomId: room.id,
    });
  for (const rule of rules) {
    applyPatch(view, rule.patch);
    view.ruleSources.push({
      id: rule.id,
      sourceId: rule.sourceId || rule.id,
      sourceLabel: rule.sourceLabel,
    });
  }
  return view;
}

export function traitRuleView(game, hero, trait) {
  const baseTrack = hero.tracks[trait],
    rules = matchingRules(game.traitRules, game, {
      heroId: hero.id,
      trait,
    }),
    view = {
      key: trait,
      label: TRAITS[trait],
      exists: true,
      hidden: false,
      fixedValue: null,
      deathAtZero: true,
      track: structuredClone(baseTrack),
      current: hero.stats[trait],
      start: hero.start[trait],
      ruleSources: [],
    };
  for (const rule of rules) {
    applyPatch(view, rule.patch);
    view.ruleSources.push({
      id: rule.id,
      sourceId: rule.sourceId || rule.id,
      sourceLabel: rule.sourceLabel,
    });
  }
  view.current = Math.max(0, Math.min(view.track.length - 1, view.current));
  view.start = Math.max(0, Math.min(view.track.length - 1, view.start));
  view.changeable = view.exists && view.fixedValue === null;
  view.value = view.fixedValue ?? view.track[view.current];
  return view;
}

function validWhen(when) {
  if (when === undefined) return true;
  return (
    when &&
    typeof when === 'object' &&
    !Array.isArray(when) &&
    Object.keys(when).every((key) => ['phase', 'scenario'].includes(key)) &&
    (!when?.phase || ['explore', 'haunt', 'over'].includes(when.phase)) &&
    (!when?.scenario || SCENARIOS.some((entry) => entry.id === when.scenario))
  );
}

function validRuleMetadata(rule) {
  return (
    (rule.priority === undefined || Number.isFinite(rule.priority)) &&
    (rule.sourceId === undefined || typeof rule.sourceId === 'string') &&
    (rule.sourceLabel === undefined || typeof rule.sourceLabel === 'string')
  );
}

function validRoomPatch(patch) {
  const allowed = new Set([
    'name',
    'icon',
    'special',
    'target',
    'moveCostDelta',
  ]);
  return (
    patch &&
    typeof patch === 'object' &&
    !Array.isArray(patch) &&
    Object.keys(patch).every((key) => allowed.has(key)) &&
    (patch.name === undefined || typeof patch.name === 'string') &&
    (patch.icon === undefined ||
      [null, 'event', 'item', 'omen'].includes(patch.icon)) &&
    (patch.special === undefined ||
      patch.special === null ||
      typeof patch.special === 'string') &&
    (patch.target === undefined ||
      patch.target === null ||
      typeof patch.target === 'string') &&
    (patch.moveCostDelta === undefined ||
      (Number.isInteger(patch.moveCostDelta) &&
        patch.moveCostDelta >= -10 &&
        patch.moveCostDelta <= 10))
  );
}

function validTraitPatch(patch, hero, trait) {
  const allowed = new Set([
    'label',
    'track',
    'start',
    'exists',
    'hidden',
    'fixedValue',
    'deathAtZero',
  ]);
  return (
    patch &&
    typeof patch === 'object' &&
    !Array.isArray(patch) &&
    Object.keys(patch).every((key) => allowed.has(key)) &&
    (patch.label === undefined || typeof patch.label === 'string') &&
    (patch.track === undefined ||
      (Array.isArray(patch.track) &&
        patch.track.length === hero.tracks[trait].length &&
        patch.track[0] === 0 &&
        patch.track.every((value) => Number.isInteger(value) && value >= 0))) &&
    (patch.start === undefined ||
      (Number.isInteger(patch.start) &&
        patch.start >= 0 &&
        patch.start < hero.tracks[trait].length)) &&
    ['exists', 'hidden', 'deathAtZero'].every(
      (key) => patch[key] === undefined || typeof patch[key] === 'boolean',
    ) &&
    (patch.fixedValue === undefined ||
      patch.fixedValue === null ||
      Number.isFinite(patch.fixedValue))
  );
}

export function validRoomRule(game, rule) {
  return !(
    !rule?.id ||
    typeof rule.id !== 'string' ||
    !game.rooms.some((room) => room.id === rule.roomId) ||
    (rule.heroId !== undefined &&
      !game.heroes.some((hero) => hero.id === rule.heroId)) ||
    !validRuleMetadata(rule) ||
    !validWhen(rule.when) ||
    !validRoomPatch(rule.patch)
  );
}

export function validTraitRule(game, rule) {
  const heroes =
    rule?.heroId === undefined
      ? game.heroes
      : game.heroes.filter((hero) => hero.id === rule.heroId);
  return !(
    !rule?.id ||
    typeof rule.id !== 'string' ||
    !TRAIT_KEYS.includes(rule.trait) ||
    !heroes.length ||
    !validRuleMetadata(rule) ||
    !validWhen(rule.when) ||
    heroes.some((hero) => !validTraitPatch(rule.patch, hero, rule.trait))
  );
}

export function updateRoomRule(game, rule) {
  if (!validRoomRule(game, rule)) throw new Error('Invalid room rule');
  const next = structuredClone(game);
  next.roomRules = (next.roomRules || []).filter(
    (entry) => entry.id !== rule.id,
  );
  next.roomRules.push(structuredClone(rule));
  return next;
}

export function updateTraitRule(game, rule) {
  if (!validTraitRule(game, rule)) throw new Error('Invalid trait rule');
  const next = structuredClone(game);
  next.traitRules = (next.traitRules || []).filter(
    (entry) => entry.id !== rule.id,
  );
  next.traitRules.push(structuredClone(rule));
  return next;
}

export function removeRuleSource(game, sourceId) {
  if (!sourceId || typeof sourceId !== 'string')
    throw new Error('Invalid rule source');
  const next = structuredClone(game),
    belongsToSource = (rule) => (rule.sourceId || rule.id) === sourceId;
  next.roomRules = (next.roomRules || []).filter(
    (rule) => !belongsToSource(rule),
  );
  next.traitRules = (next.traitRules || []).filter(
    (rule) => !belongsToSource(rule),
  );
  return next;
}
