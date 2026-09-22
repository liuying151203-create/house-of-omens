import {
  scenarioRules,
  findScenarioRules,
  chooseHaunt,
} from './content/scenarios/index.mjs';
import { resolveCard as cardDefinition } from './card-rules.mjs';
import { rollOutcomes } from './roll-outcomes.mjs';
import { modifierValue } from './modifiers.mjs';
import { fireTiming, resumeTiming } from './triggers.mjs';
import { executeAction, findAction } from './engine/actions.mjs';
import { executeEffects } from './engine/effects.mjs';
import { CURRENT_GAME_VERSION, migrateGameSave } from './engine/migrations.mjs';
import {
  addMapLink,
  relocateMapRoom,
  setCollapseLanding,
} from './engine/map-transactions.mjs';
import {
  addItemInstance,
  itemInstances,
  itemInstanceCharges,
  itemInstanceUsed,
  dropItemInstance,
  markItemInstanceUsed,
  pickupItemInstance,
  removeItemInstance,
  spendItemCharge,
  transferItemInstance,
} from './item-instances.mjs';
import {
  itemActionViews,
  itemManagementActionViews,
} from './content/item-actions.mjs';
import { contentActions, contentFactionActions } from './content/actions.mjs';
import {
  roomRuleView,
  traitRuleView,
  validRoomRule,
  validTraitRule,
  updateRoomRule,
  updateTraitRule,
  removeRuleSource,
} from './rule-views.mjs';
import {
  advanceWorkflow,
  supplyChoice,
  supplyRolls,
  workflowRollTotal,
} from './engine/workflow.mjs';
import {
  createEventCheckWorkflow,
  createCardGainWorkflow,
  CARD_WORKFLOW_DEFINITIONS,
  CARD_GAIN_WORKFLOW,
  EVENT_CHECK_WORKFLOW,
} from './content/cards/event-workflow.mjs';
import {
  createHeroAttackWorkflow,
  COMBAT_WORKFLOW_DEFINITIONS,
  HERO_ATTACK_WORKFLOW,
} from './content/combat-workflow.mjs';
import {
  createEnemyTurnWorkflow,
  ENEMY_TURN_WORKFLOW,
  ENEMY_TURN_WORKFLOW_DEFINITIONS,
} from './content/enemy-turn-workflow.mjs';
import {
  createHauntRollWorkflow,
  createRoomFallWorkflow,
  createElevatorWorkflow,
  createActionCheckWorkflow,
  createCollapseEntryWorkflow,
  createHeroMoveWorkflow,
  createRoomEntryWorkflow,
  createTurnTransitionWorkflow,
  createTurnStartWorkflow,
  createRoundStartWorkflow,
  createTimingWorkflow,
  ACTION_CHECK_WORKFLOW,
  COLLAPSE_ENTRY_WORKFLOW,
  HERO_MOVE_WORKFLOW,
  TURN_TRANSITION_WORKFLOW,
  TURN_START_WORKFLOW,
  ROUND_START_WORKFLOW,
  TIMING_WORKFLOW,
  ELEVATOR_WORKFLOW,
  HAUNT_ROLL_WORKFLOW,
  ROOM_FALL_WORKFLOW,
  TURN_WORKFLOW_DEFINITIONS,
} from './content/turn-workflows.mjs';
import {
  createReactionWorkflow,
  REACTION_WORKFLOW,
  REACTION_WORKFLOW_DEFINITIONS,
} from './content/reaction-workflow.mjs';
import {
  createDamageWorkflow,
  createDamageSettlementWorkflow,
  createDeathWorkflow,
  DAMAGE_CREATE_WORKFLOW,
  DAMAGE_SETTLE_WORKFLOW,
  DEATH_WORKFLOW,
  DAMAGE_WORKFLOW_DEFINITIONS,
} from './content/damage-workflow.mjs';
import {
  WOLF_RULES,
  STATUS_DEFINITIONS,
  wolfStats,
  wolfMight,
  statusOf,
} from './werewolf.mjs';
import {
  SCENARIOS,
  FLOORS,
  HEROES,
  ROOM_DECK,
  EVENTS,
  ITEMS,
  OMENS,
  TRAITS,
  TRAIT_KEYS,
} from './game-data.mjs';
export {
  SCENARIOS,
  FLOORS,
  HEROES,
  ROOM_DECK,
  EVENTS,
  ITEMS,
  OMENS,
  TRAITS,
  TRAIT_KEYS,
  roomRuleView,
  traitRuleView,
  validRoomRule,
  validTraitRule,
  updateRoomRule,
  updateTraitRule,
  removeRuleSource,
};
export const DIRS = [
  { dx: 0, dy: -1, name: '北' },
  { dx: 1, dy: 0, name: '东' },
  { dx: 0, dy: 1, name: '南' },
  { dx: -1, dy: 0, name: '西' },
];
export const ENTRANCE = 'entrance';
export const GAME_EXECUTION_MODES = Object.freeze({
  simulation: 'simulation',
  workflow: 'workflow',
});
export const random = (s) => {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
};
export function recordEvent(s, type, payload = {}, visibility = 'public') {
  s.eventSerial = (s.eventSerial || 0) + 1;
  s.events ||= [];
  const details = Object.fromEntries(
    Object.entries(structuredClone(payload)).filter(
      ([, value]) => value !== undefined,
    ),
  );
  const event = {
    id: s.eventSerial,
    type,
    round: s.round,
    visibility,
    ...details,
  };
  s.events.push(event);
  s.events = s.events.slice(-200);
  return event;
}
export const roll = (s, n, meta = {}) => {
  const count = Math.max(1, Math.min(n, 16)),
    { visibility = 'public', ...details } = meta;
  const dice = Array.from({ length: count }, () => Math.floor(random(s) * 3));
  recordEvent(s, 'DiceRolled', { dice, count, ...details }, visibility);
  return dice;
};
const enemyExplorer = (s, e) =>
  e.heroId !== undefined
    ? s.heroes[e.heroId]
    : e.kind === 'keeper'
      ? s.heroes.find((h) => h.traitor)
      : null;
const enemyDiceMeta = (s, e) => {
  const traitor = enemyExplorer(s, e);
  return { label: e.name + ' · 力量', heroId: traitor?.id, computer: !traitor };
};
export function shuffle(s, list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const roomAt = (s, id) => s.rooms.find((r) => r.id === id);
export const tileAt = (s, floor, x, y) =>
  s.rooms.find((r) => r.floor === floor && r.x === x && r.y === y);
export const doorsOf = (tile, rotation = tile.rotation || 0) =>
  tile.doors.map((d) => (d + rotation) % 4);
export const traitValue = (h, key, game) =>
  game ? traitRuleView(game, h, key).value : h.tracks[key][h.stats[key]];
export const living = (s) => s.heroes.filter((h) => !h.dead && !h.traitor);
export const pending = (s) => s.queue[0] || null;
export function hasBonus(h, bonus, s) {
  return (
    h.items.some(
      (id) => cardDefinition(s, 'item', id, h.id)?.bonus === bonus,
    ) ||
    h.omens.some((id) => cardDefinition(s, 'omen', id, h.id)?.bonus === bonus)
  );
}
export function movement(h, s) {
  const game = s || {
    phase: 'explore',
    scenario: null,
    heroes: [h],
    enemies: [],
    rooms: [],
  };
  return modifierValue(
    game,
    'movement.initial',
    { heroId: h.id },
    traitValue(h, 'speed', game),
  );
}
export function connections(s, id, { monster = false } = {}) {
  const r = roomAt(s, id);
  if (!r) return [];
  const con = doorsOf(r).flatMap((d) => {
    const n = tileAt(s, r.floor, r.x + DIRS[d].dx, r.y + DIRS[d].dy);
    return n && doorsOf(n).includes((d + 2) % 4) ? [n.id] : [];
  });
  for (const link of s.links) {
    if (link[0] === id) con.push(link[1]);
    if (link[1] === id) con.push(link[0]);
  }
  if (monster) {
    if (r.collapseLanding && roomAt(s, r.collapseLanding))
      con.push(r.collapseLanding);
    // Monsters can climb the established shaft; heroes must find another way back.
    con.push(
      ...s.rooms
        .filter((room) => room.collapseLanding === id)
        .map((room) => room.id),
    );
  }
  return [...new Set(con)];
}
export function pathTo(s, start, target, options) {
  const queue = [[start]],
    seen = new Set([start]);
  while (queue.length) {
    const path = queue.shift(),
      id = path.at(-1);
    if (id === target) return path;
    for (const next of connections(s, id, options))
      if (!seen.has(next)) {
        seen.add(next);
        queue.push([...path, next]);
      }
  }
  return [];
}
export const graphDistance = (s, a, b, options) => {
  const p = pathTo(s, a, b, options);
  return p.length ? p.length - 1 : Infinity;
};
export function frontiers(s, floor) {
  const out = [];
  for (const r of s.rooms.filter((r) => r.floor === floor)) {
    for (const dir of doorsOf(r)) {
      const x = r.x + DIRS[dir].dx,
        y = r.y + DIRS[dir].dy;
      if (!tileAt(s, floor, x, y)) out.push({ from: r.id, dir, x, y, floor });
    }
  }
  return out;
}
export function placementOptions(s, from, dir, tile) {
  const origin = roomAt(s, from);
  if (
    !origin ||
    !doorsOf(origin).includes(dir) ||
    !tile.floors.includes(origin.floor)
  )
    return [];
  const x = origin.x + DIRS[dir].dx,
    y = origin.y + DIRS[dir].dy;
  if (tileAt(s, origin.floor, x, y)) return [];
  const opts = [];
  for (let rotation = 0; rotation < 4; rotation++) {
    const doors = doorsOf(tile, rotation);
    if (!doors.includes((dir + 2) % 4)) continue;
    let blocked = 0,
      connected = 0;
    for (let d = 0; d < 4; d++) {
      const neighbor = tileAt(s, origin.floor, x + DIRS[d].dx, y + DIRS[d].dy);
      if (neighbor) {
        const theirs = doorsOf(neighbor).includes((d + 2) % 4),
          ours = doors.includes(d);
        if (theirs !== ours) blocked++;
        if (theirs && ours) connected++;
      }
    }
    opts.push({ rotation, blocked, connected });
  }
  if (!opts.length) return [];
  const least = Math.min(...opts.map((o) => o.blocked));
  return opts.filter((o) => o.blocked === least);
}
function heroVisibility(s, hero) {
  if (!hero || s.phase === 'explore') return 'public';
  return {
    faction: hero.faction || (hero.traitor ? 'traitors' : 'heroes'),
  };
}
function log(s, text, visibility = 'public') {
  s.logs.unshift({ id: ++s.serial, round: s.round, text, visibility });
  s.logs = s.logs.slice(0, 100);
  s.feedback = text;
  s.feedbackVisibility = visibility;
  s.feedbackId = s.serial;
}
function enqueue(s, msg) {
  s.queue.push({ uid: ++s.serial, ...msg });
}
function announce(s, title, text, kind = 'notice', extra = {}) {
  enqueue(s, { kind, title, text, ...extra });
}
function resetHero(h, s) {
  h.moves = movement(h, s);
  h.stopped = false;
  h.ended = false;
  h.attacked = false;
  h.interacted = false;
  h.rested = false;
  h.used = [];
  h.usedItemInstances = [];
}

function startHeroTurn(s, hero) {
  if (!hero || hero.turnStartedRound === s.round) return;
  hero.turnStartedRound = s.round;
  if (s.executionMode === GAME_EXECUTION_MODES.workflow) {
    const flow = createTurnStartWorkflow({
      flowId: `turn-start:${s.round}:${hero.id}:${++s.serial}`,
      heroId: hero.id,
      round: s.round,
    });
    continueWorkflow(s, flow);
    return;
  }
  fireRuleTiming(s, {
    when: 'TurnStarting',
    rootActionId: `turn:${s.round}:${hero.id}`,
    causeId: `turn:${s.round}:${hero.id}`,
    heroId: hero.id,
    round: s.round,
  });
}

function finishHeroTurn(s, hero) {
  fireRuleTiming(s, {
    when: 'TurnEnding',
    rootActionId: `turn:${s.round}:${hero.id}`,
    causeId: `turn:${s.round}:${hero.id}`,
    heroId: hero.id,
    round: s.round,
  });
}
function initial(id, name, floor, x, y, doors, special = null, art = 0) {
  return {
    id,
    name,
    floor,
    x,
    y,
    doors,
    rotation: 0,
    special,
    art,
    icon: null,
    starter: true,
    target: null,
    done: false,
    attempts: 0,
    roomBonus: [],
  };
}
function createGameState(scenario, seed = Date.now(), count = 3) {
  if (!SCENARIOS.some((s) => s.id === scenario))
    throw Error('Unknown scenario');
  count = Math.max(3, Math.min(6, Math.trunc(count)));
  const s = {
    version: CURRENT_GAME_VERSION,
    executionMode: GAME_EXECUTION_MODES.simulation,
    scenario,
    automaticHaunt: scenario === 'mystery',
    seed: seed >>> 0,
    count,
    phase: 'explore',
    round: 1,
    active: 0,
    viewFloor: 0,
    serial: 0,
    eventSerial: 0,
    events: [],
    itemSerial: 0,
    statusSerial: 0,
    omens: 0,
    elapsed: 0,
    progress: 0,
    fuses: 0,
    powered: false,
    silver: 0,
    mirrorFound: false,
    trueMirror: null,
    enemies: [],
    queue: [],
    roomRules: [],
    traitRules: [],
    logs: [],
    feedback: '',
    feedbackId: 0,
    result: null,
    basementUnlocked: false,
    rooms: [
      initial('entrance', '入口大厅', 0, 0, 1, [0, 1, 3], 'exit'),
      initial('foyer', '门厅', 0, 0, 0, [0, 1, 2, 3]),
      initial('stairs', '大楼梯', 0, 0, -1, [0, 1, 2, 3], 'stairs'),
      initial('upper', '二楼平台', 1, 0, 0, [0, 1, 2, 3], 'upper'),
      initial('basement', '地下室平台', -1, 0, 0, [0, 1, 2, 3], 'basement', 6),
    ],
    links: [['stairs', 'upper']],
    decks: { rooms: [], event: [], item: [], omen: [] },
    discards: { event: [], item: [], omen: [] },
    heroes: HEROES.slice(0, count).map((h, id) => ({
      ...structuredClone(h),
      id,
      stats: { ...h.start },
      pos: ENTRANCE,
      items: [],
      itemInstances: [],
      omens: [],
      dead: false,
      traitor: false,
      faction: 'heroes',
      statuses: [],
    })),
  };
  s.decks.rooms = shuffle(
    s,
    ROOM_DECK.map((r) => r.id),
  );
  s.decks.event = shuffle(
    s,
    EVENTS.map((c) => c.id),
  );
  s.decks.item = shuffle(
    s,
    ITEMS.map((c) => c.id),
  );
  s.decks.omen = shuffle(
    s,
    OMENS.map((c) => c.id),
  );
  s.heroes.forEach((h) => resetHero(h, s));
  s.heroes[0].turnStartedRound = s.round;
  log(s, '探险队抵达入口大厅。门外的山路已被浓雾吞没。');
  announce(s, '门已经关上了', '探索宅邸，等待预兆降临。', 'intro');
  return s;
}
export function createGame(...args) {
  return {
    ...createGameState(...args),
    executionMode: GAME_EXECUTION_MODES.workflow,
  };
}

// The direct resolver is retained as an explicit deterministic adapter for
// simulations and differential tests. User-facing games use Workflow mode.
export function createSimulationGame(...args) {
  return createGameState(...args);
}
export function validSave(s) {
  try {
    return (
      s?.version === CURRENT_GAME_VERSION &&
      Object.values(GAME_EXECUTION_MODES).includes(s.executionMode) &&
      SCENARIOS.some((c) => c.id === s.scenario) &&
      s.heroes.length >= 3 &&
      s.heroes.length <= 6 &&
      s.heroes.every(
        (h) =>
          TRAIT_KEYS.every(
            (k) =>
              Number.isInteger(h.stats[k]) &&
              h.stats[k] >= 0 &&
              h.stats[k] < h.tracks[k].length,
          ) && roomAt(s, h.pos),
      ) &&
      Array.isArray(s.queue) &&
      s.queue.every(
        (entry) =>
          entry.kind !== 'diceRequest' ||
          (entry.workflow &&
            typeof entry.workflow.flowId === 'string' &&
            typeof entry.workflow.definitionId === 'string' &&
            Number.isInteger(entry.workflow.definitionVersion)),
      ) &&
      Array.isArray(s.links) &&
      Array.isArray(s.decks.rooms) &&
      (s.roomRules === undefined ||
        (Array.isArray(s.roomRules) &&
          s.roomRules.every((rule) => validRoomRule(s, rule)))) &&
      (s.traitRules === undefined ||
        (Array.isArray(s.traitRules) &&
          s.traitRules.every((rule) => validTraitRule(s, rule)))) &&
      Number.isInteger(s.active) &&
      !!s.heroes[s.active] &&
      ['explore', 'haunt', 'over'].includes(s.phase) &&
      s.rooms.every(
        (r) =>
          Number.isInteger(r.floor) &&
          Number.isFinite(r.x) &&
          Number.isFinite(r.y) &&
          Array.isArray(r.doors),
      )
    );
  } catch {
    return false;
  }
}
export function restoreGameSave(value) {
  const migrated = migrateGameSave(value);
  return migrated && validSave(migrated) ? migrated : null;
}
function end(s, won, reason) {
  s.phase = 'over';
  delete s.roundEnding;
  s.result = { won, reason };
  const winnerFaction = findScenarioRules(s.scenario)?.winnerFaction?.(won);
  if (winnerFaction) s.result.winnerFaction = winnerFaction;
  s.queue = [];
  log(s, won ? '你们活着离开了宅邸。' : reason);
}
function ensureActive(s) {
  if (!living(s).some((h) => h.id === s.active)) {
    const next = living(s).find((h) => !h.ended) || living(s)[0];
    if (next) {
      s.active = next.id;
      s.viewFloor = roomAt(s, next.pos).floor;
    }
  }
}
function check(s) {
  if (!living(s).length)
    end(
      s,
      false,
      '最后一名探险者也倒下了。宅邸的故事里，又多了一段无人知晓的结局。',
    );
  else if (s.phase === 'haunt') {
    const reason = scenarioRules(s.scenario).victory?.(s);
    if (reason) end(s, true, reason);
  }
  ensureActive(s);
}
function changeTrait(s, h, key, delta, cause = {}) {
  const beforeView = traitRuleView(s, h, key);
  if (!beforeView.changeable)
    return `${beforeView.label}固定为 ${beforeView.value}`;
  const before = beforeView.value,
    old = h.stats[key],
    minimum = s.phase === 'explore' ? 1 : 0;
  h.stats[key] = Math.max(
    minimum,
    Math.min(beforeView.track.length - 1, old + delta),
  );
  const afterView = traitRuleView(s, h, key),
    after = afterView.value,
    actual = h.stats[key] - old;
  log(
    s,
    `${h.name}的${afterView.label} ${before} → ${after}（${actual >= 0 ? '+' : ''}${actual}格）${delta < 0 && actual === 0 ? '，作祟前不会降到骷髅位' : ''}。`,
    cause.visibility || 'public',
  );
  if (actual)
    recordEvent(
      s,
      'TraitChanged',
      {
        heroId: h.id,
        trait: key,
        label: afterView.label,
        before,
        after,
        steps: actual,
        dead: h.stats[key] === 0 && afterView.deathAtZero,
        sourceKind: cause.sourceKind,
        sourceCardId: cause.sourceCardId,
        sourceRoomId: cause.sourceRoomId,
        rootActionId: cause.rootActionId,
      },
      cause.visibility || 'public',
    );
  if (
    h.stats[key] === 0 &&
    afterView.deathAtZero &&
    !h.dead &&
    !cause.deferDeath
  )
    startDeathWorkflow(s, h, key, cause);
  return `${afterView.label} ${before} → ${after}（${actual >= 0 ? '+' : ''}${actual}格）`;
}
function damage(s, h, kind, amount, cause = {}) {
  if (h.dead) return 0;
  const original = Math.max(0, Math.trunc(amount)),
    rootActionId =
      cause.rootActionId || cause.causeId || `damage:${s.serial + 1}`,
    draft = {
      when: 'BeforeDamage',
      rootActionId,
      causeId: cause.causeId || rootActionId,
      heroId: h.id,
      damageType: kind,
      amount: original,
      rawAmount: original,
      sourceKind: cause.sourceKind,
      sourceEnemyId: cause.sourceEnemyId,
      sourceCardId: cause.sourceCardId,
      sourceRoomId: cause.sourceRoomId,
      causeTag: cause.causeTag,
      cancelled: false,
      report: cause.report,
      triggerUsage: cause.triggerUsage,
    },
    flow = createDamageWorkflow({
      flowId: `damage-create:${rootActionId}:${++s.serial}`,
      draft,
    });
  continueWorkflow(s, flow);
  return flow.locals.amount ?? original;
}

function damageAfterEvent(s, flow) {
  if (flow.locals.afterDamageEvent) return flow.locals.afterDamageEvent;
  const source =
      flow.definitionId === DAMAGE_CREATE_WORKFLOW
        ? flow.locals.committedDamage
        : flow.locals.settlement?.pendingDamage,
    hero = source && s.heroes[source.heroId];
  if (!source || !hero) return null;
  const allocation =
      flow.definitionId === DAMAGE_SETTLE_WORKFLOW
        ? flow.locals.settlement.allocation
        : {},
    event = {
      when: 'AfterDamage',
      rootActionId:
        source.rootActionId ||
        source.causeId ||
        `damage:${source.uid || s.serial}`,
      causeId: source.causeId,
      heroId: hero.id,
      damageType: source.damageType,
      rawAmount: source.rawAmount ?? source.total + (source.prevented || 0),
      preventedAmount: source.prevented || 0,
      actualAmount: source.actualApplied || 0,
      allocation,
      sourceKind: source.sourceKind,
      sourceEnemyId: source.sourceEnemyId,
      sourceCardId: source.sourceCardId,
      sourceRoomId: source.sourceRoomId,
      causeTag: source.causeTag,
    };
  flow.locals.afterDamageEvent = event;
  return event;
}

function workflowNotice(s, flow, when) {
  const uid =
    when === 'AfterCardGain'
      ? flow.locals.cardNoticeUid
      : when === 'AfterDeath'
        ? flow.locals.settlement?.deathNoticeUid || flow.locals.deathNoticeUid
        : flow.locals.resultNoticeUid || flow.locals.noticeUid;
  return uid ? s.queue.find((entry) => entry.uid === uid) : null;
}

function appendWorkflowReceipts(s, flow, event, triggered) {
  flow.locals.triggerUsage = triggered.usage;
  flow.locals.triggerReceipts ||= [];
  flow.locals.triggerReceipts.push(...triggered.executed);
  flow.locals.receiptsByTiming ||= {};
  flow.locals.receiptsByTiming[event.when] ||= [];
  flow.locals.receiptsByTiming[event.when].push(...triggered.executed);
  const notice = workflowNotice(s, flow, event.when);
  if (notice) {
    notice.triggers ||= [];
    notice.triggers.push(...triggered.executed);
  }
}

function runWorkflowTiming(s, flow, event) {
  const triggered = fireRuleTiming(
    s,
    event,
    flow.locals.draft?.report || flow.locals.report,
    flow.locals.triggerUsage || flow.locals.draft?.triggerUsage || [],
    { allowPause: true },
  );
  appendWorkflowReceipts(s, flow, event, triggered);
  if (!triggered.paused) return;
  const nextStep = flow.step + 1;
  flow.step = nextStep;
  attachReactionResume(s, triggered.paused, {
    kind: 'workflow',
    flow,
    event,
    remainingTriggers: triggered.remainingTriggers,
    usage: triggered.usage,
  });
  return { suspend: true, nextStep };
}

function runStandaloneTiming(s, flow) {
  if (flow.definitionId !== TIMING_WORKFLOW)
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  return runWorkflowTiming(s, flow, flow.locals.lifecycleEvent);
}

function startStandaloneTiming(s, event, { noticeUid } = {}) {
  const flow = createTimingWorkflow({
    flowId: `timing:${event.when}:${++s.serial}`,
    event,
    noticeUid,
  });
  continueWorkflow(s, flow);
  return flow;
}

function runDamageTiming(s, flow, when) {
  if (
    ![DAMAGE_CREATE_WORKFLOW, DAMAGE_SETTLE_WORKFLOW].includes(
      flow.definitionId,
    )
  )
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  if (when === 'BeforeDamage')
    return runWorkflowTiming(s, flow, flow.locals.draft);
  if (
    (flow.definitionId === DAMAGE_CREATE_WORKFLOW && flow.locals.amount > 0) ||
    (flow.definitionId === DAMAGE_SETTLE_WORKFLOW &&
      !flow.locals.settlement.final)
  )
    return;
  const event = damageAfterEvent(s, flow);
  return event && runWorkflowTiming(s, flow, event);
}

function commitDamageWorkflow(s, flow) {
  if (flow.definitionId !== DAMAGE_CREATE_WORKFLOW)
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  const draft = flow.locals.draft,
    hero = s.heroes[draft.heroId],
    original = draft.rawAmount;
  if (!hero || hero.dead) {
    flow.locals.amount = 0;
    return;
  }
  let amount = draft.cancelled ? 0 : Math.max(0, Math.trunc(draft.amount));
  if (draft.damageType === 'mental')
    amount = Math.max(
      0,
      amount - modifierValue(s, 'damage.mental.prevent', { heroId: hero.id }),
    );
  const traits = (
    draft.damageType === 'physical'
      ? ['might', 'speed']
      : ['sanity', 'knowledge']
  ).filter((key) => traitRuleView(s, hero, key).changeable);
  if (!traits.length) amount = 0;
  flow.locals.amount = amount;
  const committed = {
    kind: 'damage',
    title: draft.damageType === 'physical' ? '分配肉体伤害' : '分配精神伤害',
    text: `${hero.name}需要承受${amount}点${draft.damageType === 'physical' ? '肉体' : '精神'}伤害。每点伤害让所选属性下降1格。`,
    heroId: hero.id,
    damageType: draft.damageType,
    traits,
    remaining: amount,
    total: amount,
    allocation: [],
    prevented: original - amount,
    rawAmount: original,
    actualApplied: 0,
    rootActionId: draft.rootActionId,
    causeId: draft.causeId,
    sourceKind: draft.sourceKind,
    sourceEnemyId: draft.sourceEnemyId,
    sourceCardId: draft.sourceCardId,
    sourceRoomId: draft.sourceRoomId,
    causeTag: draft.causeTag,
    triggerUsage: flow.locals.triggerUsage || [],
    beforeTriggers: flow.locals.receiptsByTiming?.BeforeDamage || [],
  };
  flow.locals.committedDamage = committed;
  if (amount > 0) enqueue(s, committed);
  else if (original > 0) {
    log(
      s,
      `${hero.name}的${original}点${draft.damageType === 'physical' ? '肉体' : '精神'}伤害已被抵消，属性未下降。`,
    );
    recordEvent(s, 'DamageApplied', {
      heroId: hero.id,
      damageType: draft.damageType,
      rawAmount: original,
      preventedAmount: original,
      actualAmount: 0,
      allocation: {},
      sourceKind: draft.sourceKind,
      sourceEnemyId: draft.sourceEnemyId,
      sourceCardId: draft.sourceCardId,
      sourceRoomId: draft.sourceRoomId,
      rootActionId: draft.rootActionId,
    });
  }
}

function applyDamageTraitWorkflow(s, flow) {
  if (flow.definitionId !== DAMAGE_SETTLE_WORKFLOW)
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  const settlement = flow.locals.settlement,
    pendingDamage = settlement.pendingDamage,
    hero = s.heroes[pendingDamage.heroId],
    key = settlement.keys[settlement.keyIndex],
    amount = settlement.allocation[key] || 0;
  settlement.deathPending = false;
  if (!hero || hero.dead || !key || amount <= 0) return;
  const before = hero.stats[key],
    change = changeTrait(s, hero, key, -amount, {
      ...pendingDamage,
      triggerUsage: flow.locals.triggerUsage,
      deferDeath: true,
    });
  pendingDamage.actualApplied =
    (pendingDamage.actualApplied || 0) + before - hero.stats[key];
  settlement.changes.push(change);
  if (
    hero.stats[key] === 0 &&
    traitRuleView(s, hero, key).deathAtZero &&
    !hero.dead
  ) {
    settlement.deathPending = true;
    settlement.deathEvent = {
      when: 'BeforeDeath',
      rootActionId: pendingDamage.rootActionId,
      causeId: pendingDamage.causeId || pendingDamage.rootActionId,
      heroId: hero.id,
      trait: key,
      sourceKind: pendingDamage.sourceKind,
      sourceEnemyId: pendingDamage.sourceEnemyId,
      sourceCardId: pendingDamage.sourceCardId,
      sourceRoomId: pendingDamage.sourceRoomId,
      causeTag: pendingDamage.causeTag,
      cancelled: false,
    };
  }
}

function runDeathTiming(s, flow, when) {
  if (![DAMAGE_SETTLE_WORKFLOW, DEATH_WORKFLOW].includes(flow.definitionId))
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  const settlement = flow.locals.settlement,
    deathPending = settlement ? settlement.deathPending : true,
    deathCancelled = settlement
      ? settlement.deathCancelled
      : flow.locals.deathCancelled;
  if (!deathPending || deathCancelled) return;
  const event =
    when === 'BeforeDeath'
      ? settlement?.deathEvent || flow.locals.deathEvent
      : settlement
        ? (settlement.afterDeathEvent ||= {
            ...settlement.deathEvent,
            when: 'AfterDeath',
            cancelled: undefined,
          })
        : (flow.locals.afterDeathEvent ||= {
            ...flow.locals.deathEvent,
            when: 'AfterDeath',
            cancelled: undefined,
          });
  return runWorkflowTiming(s, flow, event);
}

function commitDeathWorkflow(s, flow) {
  const settlement = flow.locals.settlement,
    event = settlement?.deathEvent || flow.locals.deathEvent,
    hero = event && s.heroes[event.heroId];
  if (settlement) settlement.deathCancelled = !!event?.cancelled;
  else flow.locals.deathCancelled = !!event?.cancelled;
  if ((settlement && !settlement.deathPending) || event?.cancelled || !hero)
    return;
  hero.dead = true;
  hero.moves = 0;
  hero.ended = true;
  const label = traitRuleView(s, hero, event.trait).label;
  announce(
    s,
    hero.name + '倒下了',
    `${label}降至骷髅位置，${hero.name}无法继续行动。`,
    'death',
    {
      triggers: [...(flow.locals.receiptsByTiming?.BeforeDeath || [])],
    },
  );
  if (settlement) settlement.deathNoticeUid = s.queue.at(-1)?.uid;
  else flow.locals.deathNoticeUid = s.queue.at(-1)?.uid;
}

function advanceDamageAllocationWorkflow(s, flow) {
  const settlement = flow.locals.settlement,
    hero = s.heroes[settlement.pendingDamage.heroId];
  settlement.keyIndex++;
  settlement.deathPending = false;
  settlement.done =
    !hero || hero.dead || settlement.keyIndex >= settlement.keys.length;
}

function completeDamageWorkflow(s, flow) {
  const settlement = flow.locals.settlement,
    pendingDamage = settlement.pendingDamage,
    hero = s.heroes[pendingDamage.heroId],
    spent = settlement.keys.reduce(
      (sum, key) => sum + settlement.allocation[key],
      0,
    );
  pendingDamage.remaining = Math.max(0, pendingDamage.remaining - spent);
  pendingDamage.allocation ||= [];
  for (const key of settlement.keys)
    for (let i = 0; i < settlement.allocation[key]; i++)
      pendingDamage.allocation.push(traitRuleView(s, hero, key).label);
  settlement.final = pendingDamage.remaining <= 0 || !!hero?.dead;
  if (!settlement.final) {
    s.queue.unshift(pendingDamage);
    log(
      s,
      `${hero.name}结算${spent}点${pendingDamage.damageType === 'physical' ? '肉体' : '精神'}伤害：${settlement.changes.join('；')}${hero.dead ? '；人物已死亡' : ''}。`,
    );
    return;
  }
  if (hero.dead)
    s.queue = s.queue.filter(
      (entry) => entry.kind !== 'damage' || entry.heroId !== hero.id,
    );
  announce(
    s,
    hero.name + '的伤害已结算',
    settlement.changes.join('；'),
    'damageResult',
    {
      heroId: hero.id,
      changes: settlement.changes,
      rawAmount:
        pendingDamage.rawAmount ??
        pendingDamage.total + (pendingDamage.prevented || 0),
      preventedAmount: pendingDamage.prevented || 0,
      actualAmount: pendingDamage.actualApplied || 0,
      sourceKind: pendingDamage.sourceKind,
      sourceEnemyId: pendingDamage.sourceEnemyId,
      triggers: [
        ...(flow.locals.receiptsByTiming?.BeforeDamage || []),
        ...(flow.locals.receiptsByTiming?.AfterDamage || []),
      ],
    },
  );
  flow.locals.resultNoticeUid = s.queue.at(-1)?.uid;
  log(
    s,
    `${hero.name}结算${spent}点${pendingDamage.damageType === 'physical' ? '肉体' : '精神'}伤害${pendingDamage.prevented ? '（另抵消' + pendingDamage.prevented + '点）' : ''}：${settlement.changes.join('；')}${hero.dead ? '；人物已死亡' : ''}。`,
  );
  recordEvent(s, 'DamageApplied', {
    heroId: hero.id,
    damageType: pendingDamage.damageType,
    rawAmount:
      pendingDamage.rawAmount ??
      pendingDamage.total + (pendingDamage.prevented || 0),
    preventedAmount: pendingDamage.prevented || 0,
    actualAmount: pendingDamage.actualApplied || 0,
    allocation: settlement.allocation,
    sourceKind: pendingDamage.sourceKind,
    sourceEnemyId: pendingDamage.sourceEnemyId,
    sourceCardId: pendingDamage.sourceCardId,
    sourceRoomId: pendingDamage.sourceRoomId,
    rootActionId: pendingDamage.rootActionId,
  });
}

function startDamageSettlementWorkflow(
  s,
  pendingDamage,
  allocation,
  incremental,
) {
  const keys =
      pendingDamage.traits ||
      (pendingDamage.damageType === 'physical'
        ? ['might', 'speed']
        : ['sanity', 'knowledge']),
    flow = createDamageSettlementWorkflow({
      flowId: `damage-settle:${pendingDamage.uid}:${++s.serial}`,
      pendingDamage,
      allocation,
      keys,
      incremental,
    });
  s.queue.shift();
  continueWorkflow(s, flow);
  check(s);
  finishArrival(s);
}

function startDeathWorkflow(s, hero, trait, cause = {}) {
  const rootActionId =
      cause.rootActionId || cause.causeId || `trait:${++s.serial}`,
    flow = createDeathWorkflow({
      flowId: `death:${rootActionId}:${++s.serial}`,
      deathEvent: {
        when: 'BeforeDeath',
        rootActionId,
        causeId: cause.causeId || rootActionId,
        heroId: hero.id,
        trait,
        sourceKind: cause.sourceKind,
        sourceEnemyId: cause.sourceEnemyId,
        sourceCardId: cause.sourceCardId,
        sourceRoomId: cause.sourceRoomId,
        causeTag: cause.causeTag,
        cancelled: false,
      },
      report: cause.report,
      usage: cause.triggerUsage,
    });
  continueWorkflow(s, flow);
}

function applyEffect(s, h, effect) {
  if (effect.trait) return changeTrait(s, h, effect.trait, effect.delta);
  if (effect.damage) {
    const amount = damage(s, h, effect.damage, effect.amount);
    return amount
      ? `需要分配 ${amount} 点${effect.damage === 'physical' ? '肉体' : '精神'}伤害`
      : '伤害已被抵消';
  }
  return '';
}

function eventDiceCount(s, h, card) {
  return modifierValue(
    s,
    'check.dice',
    { heroId: h.id, checkKind: 'event', trait: card.trait },
    traitValue(h, card.trait, s),
  );
}

function resolveWorkflowEffect(s, params, flow) {
  if (flow.definitionId !== EVENT_CHECK_WORKFLOW)
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  const event = flow.locals.event,
    h = s.heroes[event.heroId],
    effect = event[params.outcome],
    total = workflowRollTotal(flow, 'check'),
    success = params.outcome === 'success',
    result = {
      kind: 'cardResult',
      heroId: h.id,
      title: event.title,
      text: effect.text,
      cardType: 'event',
      dice: flow.locals.rolls.check[0],
      total,
      threshold: event.threshold,
      success,
      changes: [],
      workflow: {
        flowId: flow.flowId,
        definitionId: flow.definitionId,
        definitionVersion: flow.definitionVersion,
      },
    };
  enqueue(s, result);
  const change = applyEffect(s, h, effect);
  result.changes = [change];
  log(s, `${h.name}：${event.title}。${effect.text}`);
}

function defeatEnemy(s, e) {
  if (e.hp > 0 || !s.enemies.some((enemy) => enemy.id === e.id)) return false;
  s.enemies = s.enemies.filter((enemy) => enemy.id !== e.id);
  log(s, e.name + '已被击败。');
  const explorer = enemyExplorer(s, e);
  if (explorer) explorer.dead = true;
  const victory = findScenarioRules(s.scenario)?.enemyDefeated?.(s, e);
  if (victory) end(s, true, victory);
  return true;
}

function resolveHeroAttack(
  s,
  h,
  e,
  attack,
  defense,
  attackBonus,
  damageCap,
  cause = {},
) {
  h.attacked = true;
  const aTotal = attack.reduce((sum, face) => sum + face, 0) + attackBonus,
    dTotal = defense.reduce((sum, face) => sum + face, 0),
    delta = aTotal - dTotal,
    dealt = e.kind === 'alpha' ? Math.min(delta, damageCap) : delta,
    hpBefore = e.hp;
  if (delta > 0) e.hp -= dealt;
  announce(
    s,
    delta > 0 ? '你的攻击命中了' : delta === 0 ? '双方僵持' : '对方发动了反击',
    `${h.name} ${aTotal} 对 ${e.name} ${dTotal}。${delta > 0 ? '敌人损失' + dealt + '点生命。' + (dealt < delta ? '狼王厚皮吸收了部分伤害。' : '') : delta < 0 ? '你需要分配' + Math.min(3, -delta) + '点肉体伤害。' : '双方均未受伤。'}`,
    'combat',
    {
      dice: attack,
      defenseDice: defense,
      total: aTotal,
      defenseTotal: dTotal,
    },
  );
  log(
    s,
    `${h.name}攻击${e.name}：${aTotal} 对 ${dTotal}。${delta > 0 ? `${e.name}受到${dealt}点伤害，生命 ${hpBefore} → ${Math.max(0, e.hp)}${dealt < delta ? '（厚皮减伤）' : ''}。` : delta < 0 ? `${h.name}将承受${Math.min(3, -delta)}点肉体反击伤害，待分配。` : '双方均未受伤。'}`,
  );
  if (delta < 0)
    damage(s, h, 'physical', Math.min(3, -delta), {
      ...cause,
      sourceKind: 'enemy',
      sourceEnemyId: e.id,
      causeTag: 'attack',
    });
  defeatEnemy(s, e);
  check(s);
  finishArrival(s);
}

function resolveCombatWorkflowEffect(s, flow) {
  if (flow.definitionId !== HERO_ATTACK_WORKFLOW)
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  const combat = flow.locals.combat,
    hero = s.heroes[combat.heroId],
    enemy = s.enemies.find((entry) => entry.id === combat.enemyId),
    rolls = flow.locals.rolls.contest;
  if (!hero || !enemy) return;
  resolveHeroAttack(
    s,
    hero,
    enemy,
    rolls[0],
    rolls[1],
    combat.attackBonus,
    combat.damageCap,
    {
      rootActionId: flow.flowId,
      causeId: flow.flowId,
    },
  );
  const result = s.queue.find((entry) => entry.kind === 'combat');
  if (result)
    result.workflow = {
      flowId: flow.flowId,
      definitionId: flow.definitionId,
      definitionVersion: flow.definitionVersion,
    };
}

function startReactionWorkflow(s, params, context = {}) {
  const requestedResponders = Array.isArray(params.responders)
      ? params.responders
      : [params.heroId],
    responders = [...new Set(requestedResponders)].sort((a, b) => {
      const count = s.heroes.length,
        aOrder = (a - s.active + count) % count,
        bOrder = (b - s.active + count) % count;
      return aOrder - bOrder;
    }),
    skipOption = params.options?.find(
      (option) => Array.isArray(option?.effects) && !option.effects.length,
    ),
    options =
      skipOption || params.required
        ? params.options
        : [
            ...(params.options || []),
            { id: 'skip', label: '跳过', effects: [] },
          ];
  if (
    !responders.length ||
    responders.some((heroId) => !s.heroes[heroId] || s.heroes[heroId].dead) ||
    !Array.isArray(params.options) ||
    options.length < 2 ||
    options.length > 12 ||
    new Set(options.map((option) => option?.id)).size !== options.length ||
    options.some(
      (option) =>
        !option?.id ||
        !option.label ||
        !Array.isArray(option.effects || []) ||
        option.effects.some((effect) => effect?.op === 'reaction.request'),
    )
  )
    return false;
  const flow = createReactionWorkflow({
      flowId: `reaction:${++s.serial}`,
      responders,
      title: params.title || '选择反应',
      text: params.text || '',
      options,
      continuation: context.remainingEffects,
      event: context.event,
      timeoutMs: Math.max(1000, Math.min(params.timeoutMs || 30000, 120000)),
      timeoutChoice:
        skipOption?.id || (params.required ? options[0].id : 'skip'),
      source: {
        rootActionId: context.event?.rootActionId,
        causeId: context.event?.causeId,
        sourceKind: context.event?.sourceKind,
        sourceItemInstanceId: context.event?.sourceItemInstanceId,
        visibility:
          params.visibility ||
          context.event?.visibility ||
          (responders.length === 1
            ? heroVisibility(s, s.heroes[responders[0]])
            : { heroIds: responders }),
      },
    }),
    next = continueWorkflow(s, flow),
    request = queueWorkflowRequest(s, next);
  return {
    pause: true,
    flowId: flow.flowId,
    requestId: request.uid,
  };
}

function requestTriggerOrder(s, event, triggers) {
  if (!Array.isArray(triggers) || triggers.length < 2 || triggers.length > 12)
    throw new Error(
      'Player trigger order needs between two and twelve effects',
    );
  const heroId = triggers[0].orderHeroId ?? event.heroId;
  if (
    !Number.isInteger(heroId) ||
    triggers.some((trigger) => (trigger.orderHeroId ?? event.heroId) !== heroId)
  )
    throw new Error('Player trigger order must have one responsible hero');
  return startReactionWorkflow(
    s,
    {
      heroId,
      required: true,
      title: '决定效果顺序',
      text: '多个效果同时发生，请选择下一个结算的效果。',
      timeoutMs: 30000,
      options: triggers.map((trigger) => ({
        id: `${trigger.sourceId}:${trigger.id}`,
        label: trigger.sourceLabel || trigger.id,
        detail: '优先级 ' + (trigger.priority || 0),
        effects: [
          {
            op: 'trigger.chooseFirst',
            params: {
              sourceId: trigger.sourceId,
              triggerId: trigger.id,
              orderKey: trigger._playerOrderKey,
            },
          },
        ],
      })),
    },
    { event },
  );
}

function resolveReactionWorkflow(s, flow) {
  if (flow.definitionId !== REACTION_WORKFLOW)
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  const reaction = flow.locals.reaction,
    responders = reaction.responders || [reaction.heroId],
    heroId = responders[reaction.responderIndex || 0],
    choice = flow.locals.choices?.reaction,
    option = reaction.options.find((entry) => entry.id === choice);
  if (!option) throw new Error(`Unknown reaction choice: ${choice}`);
  const effectContext = {
    event: {
      ...reaction.event,
      ...reaction.source,
      rootActionId: reaction.source.rootActionId || flow.flowId,
      causeId: reaction.source.causeId || flow.flowId,
      heroId,
    },
    resume: reaction.resume,
  };
  const selected = executeRuleEffects(s, option.effects || [], effectContext),
    finalResponder = (reaction.responderIndex || 0) >= responders.length - 1;
  flow.locals.receipts ||= [];
  flow.locals.receipts.push({ heroId, choice, selected });
  recordEvent(
    s,
    'ChoiceResolved',
    {
      heroId,
      flowId: flow.flowId,
      choice,
      executed: selected.executed.map((effect) => effect.id),
    },
    reaction.source.visibility || 'public',
  );
  if (option.resultText)
    log(
      s,
      `${s.heroes[heroId].name}：${option.resultText}`,
      reaction.source.visibility || 'public',
    );
  if (reaction.resume?.event)
    reaction.resume.event = structuredClone(effectContext.event);
  if (!finalResponder) {
    reaction.responderIndex = (reaction.responderIndex || 0) + 1;
    flow.locals.choiceRequest.heroId = responders[reaction.responderIndex];
    delete flow.locals.choices.reaction;
    return { nextStep: 0 };
  }
  const continuation = executeRuleEffects(
    s,
    reaction.continuation || [],
    effectContext,
  );
  flow.locals.receipt = { responses: flow.locals.receipts, continuation };
  if (continuation.paused) {
    attachReactionResume(s, continuation.paused, reaction.resume || {});
    return;
  }
  resumeReactionContinuation(s, reaction.resume);
}

function resumeReactionContinuation(s, resume) {
  if (!resume?.kind) return;
  if (resume.remainingTriggers?.length) {
    const deferredEvents = resume.deferredEventPath
      ?.split('.')
      .reduce((value, key) => value?.[key], resume.flow?.locals);
    const triggered = resumeTiming(
      s,
      resume.event,
      resume.remainingTriggers,
      RULE_TRIGGER_HANDLERS,
      {
        usage: resume.usage,
        deferredEvents,
        requestOrder: (state, event, triggers) =>
          requestTriggerOrder(state, event, triggers),
        executeEffects: (state, effects, context) =>
          executeEffects(state, effects, RULE_EFFECT_HANDLERS, context),
      },
    );
    if (resume.kind === 'workflow' && resume.flow?.locals)
      appendWorkflowReceipts(s, resume.flow, resume.event, triggered);
    if (triggered.paused) {
      attachReactionResume(s, triggered.paused, {
        ...resume,
        remainingTriggers: triggered.remainingTriggers,
        usage: triggered.usage,
      });
      return;
    }
  }
  if (resume.kind === 'beforeCheck') {
    if (
      !validWorkflowRolls(resume.event?.rolls, resume.next.request.rolls.length)
    )
      throw new Error('BeforeCheck reaction produced an invalid dice request');
    resume.next.request.rolls = structuredClone(resume.event.rolls);
    resume.next.flow.locals[resume.next.requestKey] = structuredClone(
      resume.next.request,
    );
    queueWorkflowRequest(s, resume.next, resume.extra || {});
    return;
  }
  if (resume.kind === 'afterRoll')
    continueRolledWorkflow(s, resume.flow, resume.receipt);
  if (resume.kind === 'workflow') {
    if (resume.flow?.locals && resume.event) {
      const eventKey = {
        BeforeRoomEnter: 'roomEvent',
        AfterRoomEnter: 'afterRoomEvent',
        BeforeCardGain: 'gainEvent',
        AfterCardGain: 'afterGainEvent',
        BeforeDamage: 'draft',
        AfterDamage: 'afterDamageEvent',
        BeforeDeath: 'settlement.deathEvent',
        AfterDeath: 'settlement.afterDeathEvent',
      }[resume.event.when];
      if (eventKey === 'settlement.deathEvent') {
        if (resume.flow.locals.settlement)
          resume.flow.locals.settlement.deathEvent = structuredClone(
            resume.event,
          );
        else resume.flow.locals.deathEvent = structuredClone(resume.event);
      } else if (eventKey === 'settlement.afterDeathEvent') {
        if (resume.flow.locals.settlement)
          resume.flow.locals.settlement.afterDeathEvent = structuredClone(
            resume.event,
          );
        else resume.flow.locals.afterDeathEvent = structuredClone(resume.event);
      } else if (eventKey)
        resume.flow.locals[eventKey] = structuredClone(resume.event);
    }
    const next = continueWorkflow(s, resume.flow);
    if (next.status === 'waiting') queueWorkflowRequest(s, next);
    check(s);
    finishArrival(s);
  }
}

function continueWorkflow(s, flow) {
  return advanceWorkflow(flow, {
    definitions: {
      ...CARD_WORKFLOW_DEFINITIONS,
      ...COMBAT_WORKFLOW_DEFINITIONS,
      ...ENEMY_TURN_WORKFLOW_DEFINITIONS,
      ...TURN_WORKFLOW_DEFINITIONS,
      ...REACTION_WORKFLOW_DEFINITIONS,
      ...DAMAGE_WORKFLOW_DEFINITIONS,
    },
    handlers: {
      'event.resolve': (params, activeFlow) =>
        resolveWorkflowEffect(s, params, activeFlow),
      'card.gain.before': (_params, activeFlow) =>
        runCardGainTiming(s, activeFlow, 'BeforeCardGain'),
      'card.gain.commit': (_params, activeFlow) =>
        commitCardGainWorkflow(s, activeFlow),
      'card.gain.after': (_params, activeFlow) =>
        runCardGainTiming(s, activeFlow, 'AfterCardGain'),
      'combat.resolveHeroAttack': (_params, activeFlow) =>
        resolveCombatWorkflowEffect(s, activeFlow),
      'enemy.prepare': (_params, activeFlow) =>
        prepareEnemyWorkflow(s, activeFlow),
      'enemy.resolveAttack': (_params, activeFlow) =>
        resolveEnemyWorkflowAttack(s, activeFlow),
      'enemy.advance': (_params, activeFlow) =>
        advanceEnemyWorkflow(activeFlow),
      'enemy.finish': (_params, activeFlow) =>
        finishEnemyWorkflow(s, activeFlow),
      'haunt.resolveRoll': (_params, activeFlow) =>
        resolveHauntRollWorkflow(s, activeFlow),
      'room.resolveFallDamage': (_params, activeFlow) =>
        resolveRoomFallWorkflow(s, activeFlow),
      'room.resolveElevator': (_params, activeFlow) =>
        resolveElevatorWorkflow(s, activeFlow),
      'action.resolveCheck': (_params, activeFlow) =>
        resolveActionCheckWorkflow(s, activeFlow),
      'room.resolveCollapseEntry': (_params, activeFlow) =>
        resolveCollapseEntryWorkflow(s, activeFlow),
      'hero.move.commit': (_params, activeFlow) =>
        commitHeroMoveWorkflow(s, activeFlow),
      'room.enter.before': (_params, activeFlow) =>
        runRoomEntryTiming(s, activeFlow, 'BeforeRoomEnter'),
      'room.enter.resolve': (_params, activeFlow) =>
        resolveRoomEntryWorkflow(s, activeFlow),
      'room.enter.after': (_params, activeFlow) =>
        runRoomEntryTiming(s, activeFlow, 'AfterRoomEnter'),
      'room.enter.card': (_params, activeFlow) =>
        completeRoomEntryCard(s, activeFlow),
      'reaction.resolve': (_params, activeFlow) =>
        resolveReactionWorkflow(s, activeFlow),
      'damage.before': (_params, activeFlow) =>
        runDamageTiming(s, activeFlow, 'BeforeDamage'),
      'damage.commit': (_params, activeFlow) =>
        commitDamageWorkflow(s, activeFlow),
      'damage.applyTrait': (_params, activeFlow) =>
        applyDamageTraitWorkflow(s, activeFlow),
      'damage.advanceAllocation': (_params, activeFlow) =>
        advanceDamageAllocationWorkflow(s, activeFlow),
      'damage.complete': (_params, activeFlow) =>
        completeDamageWorkflow(s, activeFlow),
      'damage.after': (_params, activeFlow) =>
        runDamageTiming(s, activeFlow, 'AfterDamage'),
      'death.before': (_params, activeFlow) =>
        runDeathTiming(s, activeFlow, 'BeforeDeath'),
      'death.commit': (_params, activeFlow) =>
        commitDeathWorkflow(s, activeFlow),
      'death.after': (_params, activeFlow) =>
        runDeathTiming(s, activeFlow, 'AfterDeath'),
      'turn.end.prepare': (_params, activeFlow) =>
        prepareTurnEndingWorkflow(s, activeFlow),
      'turn.end.timing': (_params, activeFlow) =>
        runTurnLifecycleTiming(s, activeFlow, 'TurnEnding'),
      'turn.end.commit': (_params, activeFlow) =>
        commitTurnEndingWorkflow(s, activeFlow),
      'turn.end.advance': (_params, activeFlow) =>
        advanceTurnEndingWorkflow(activeFlow),
      'turn.next.prepare': (_params, activeFlow) =>
        prepareNextHeroWorkflow(s, activeFlow),
      'turn.next.commit': (_params, activeFlow) =>
        commitNextHeroWorkflow(s, activeFlow),
      'round.end.prepare': (_params, activeFlow) =>
        prepareRoundEndingWorkflow(s, activeFlow),
      'round.end.timing': (_params, activeFlow) =>
        runTurnLifecycleTiming(s, activeFlow, 'RoundEnding'),
      'round.end.commit': (_params, activeFlow) =>
        commitRoundEndingWorkflow(s, activeFlow),
      'round.start.commit': (_params, activeFlow) =>
        commitRoundStartWorkflow(s, activeFlow),
      'round.start.timing': (_params, activeFlow) =>
        runRoundStartTiming(s, activeFlow),
      'round.startHero': (_params, activeFlow) =>
        startRoundHeroWorkflow(s, activeFlow),
      'turn.start.timing': (_params, activeFlow) =>
        runStandaloneTurnStartTiming(s, activeFlow),
      'trigger.timing.run': (_params, activeFlow) =>
        runStandaloneTiming(s, activeFlow),
    },
  });
}

function workflowDefinitions() {
  return {
    ...CARD_WORKFLOW_DEFINITIONS,
    ...COMBAT_WORKFLOW_DEFINITIONS,
    ...ENEMY_TURN_WORKFLOW_DEFINITIONS,
    ...TURN_WORKFLOW_DEFINITIONS,
    ...REACTION_WORKFLOW_DEFINITIONS,
  };
}

function workflowCheckLifecycle(flow) {
  flow.locals.checkLifecycle ||= { checks: {} };
  flow.locals.checkLifecycle.checks ||= {};
  return flow.locals.checkLifecycle;
}

function checkEventBase(s, flow, active) {
  const request = flow.locals[active.requestKey],
    heroId = request?.heroId ?? request?.rolls?.[0]?.heroId;
  return {
    rootActionId: flow.flowId,
    causeId: active.checkId,
    checkId: active.checkId,
    checkKind: flow.definitionId,
    rollKey: active.rollKey,
    heroId,
    title: request?.title || '',
    visibility:
      request?.visibility ||
      (heroId === undefined ? 'public' : heroVisibility(s, s.heroes[heroId])),
  };
}

function validWorkflowRolls(rolls, expectedLength) {
  return (
    Array.isArray(rolls) &&
    rolls.length === expectedLength &&
    rolls.every(
      (rollSpec) =>
        Number.isInteger(rollSpec.count) &&
        rollSpec.count >= 1 &&
        rollSpec.count <= 16 &&
        (rollSpec.bonus === undefined || Number.isFinite(rollSpec.bonus)),
    )
  );
}

function prepareWorkflowCheck(s, next) {
  if (next.request.kind !== 'diceRequest') return null;
  const flow = next.flow,
    lifecycle = workflowCheckLifecycle(flow),
    checkId = `${flow.flowId}:${flow.step}:${next.rollKey}`,
    check = (lifecycle.checks[checkId] ||= {}),
    active = {
      checkId,
      requestKey: next.requestKey,
      rollKey: next.rollKey,
    };
  lifecycle.active = active;
  if (!check.beforeCheck) {
    check.beforeCheck = true;
    const event = {
      when: 'BeforeCheck',
      ...checkEventBase(s, flow, active),
      rolls: structuredClone(next.request.rolls),
    };
    const triggered = fireRuleTiming(s, event, undefined, [], {
      allowPause: true,
    });
    if (!validWorkflowRolls(event.rolls, next.request.rolls.length))
      throw new Error('BeforeCheck produced an invalid dice request');
    next.request.rolls = structuredClone(event.rolls);
    flow.locals[next.requestKey] = structuredClone(next.request);
    return { event, triggered };
  }
  return null;
}

function fireAfterRoll(s, flow, request) {
  const lifecycle = workflowCheckLifecycle(flow),
    active = lifecycle.active,
    check = active && lifecycle.checks[active.checkId];
  if (!active || !check || check.afterRoll) return { executed: [], usage: [] };
  check.afterRoll = true;
  const groups = request.rolls.map((rollSpec) => ({
      heroId: rollSpec.heroId,
      label: rollSpec.label,
      dice: structuredClone(rollSpec.dice),
      bonus: rollSpec.bonus || 0,
      total:
        rollSpec.dice.reduce((sum, face) => sum + face, 0) +
        (rollSpec.bonus || 0),
    })),
    event = {
      when: 'AfterRoll',
      ...checkEventBase(s, flow, active),
      groups,
      total: groups.reduce((sum, group) => sum + group.total, 0),
    },
    triggered = fireRuleTiming(s, event, undefined, [], { allowPause: true });
  check.afterRollEvent = event;
  return triggered;
}

function fireAfterCheck(s, flow) {
  const lifecycle = flow.locals.checkLifecycle,
    active = lifecycle?.active,
    check = active && lifecycle.checks?.[active.checkId];
  if (!active || !check || check.afterCheck) return null;
  check.afterCheck = true;
  const result = s.queue.find(
      (entry) => entry.workflow?.flowId === flow.flowId,
    ),
    event = {
      when: 'AfterCheck',
      ...checkEventBase(s, flow, active),
      total: result?.total ?? check.afterRollEvent?.total,
      threshold: result?.threshold,
      success: result?.success,
      resultKind: result?.kind,
    };
  return {
    event,
    triggered: fireRuleTiming(s, event, undefined, [], { allowPause: true }),
  };
}

function attachReactionResume(s, paused, resume, receipt) {
  const request = s.queue.find((entry) => entry.uid === paused?.requestId),
    reaction = request?.workflow?.locals?.reaction;
  if (!reaction) throw new Error('Reaction continuation request is missing');
  reaction.resume = structuredClone(resume);
  if (receipt) request.rollReceipt = structuredClone(receipt);
}

function attachRollReceipt(s, flow, receipt) {
  const result = s.queue.find(
    (entry) => entry.workflow?.flowId === flow.flowId,
  );
  receipt.text = result?.text || s.result?.reason || '';
  if (result) {
    result.rollReceipt = receipt;
    if (result.dice) result.dicePresented = true;
  } else if (s.result) s.lastRollReceipt = receipt;
}

function continueRolledWorkflow(s, flow, receipt) {
  const next = continueWorkflow(s, flow);
  if (next.status === 'waiting') {
    queueWorkflowRequest(s, next, { previousRollReceipt: receipt });
    return 'waiting';
  }
  const afterCheck = fireAfterCheck(s, flow);
  attachRollReceipt(s, flow, receipt);
  if (afterCheck?.triggered.paused) {
    attachReactionResume(
      s,
      afterCheck.triggered.paused,
      {
        kind: 'afterCheck',
        event: afterCheck.event,
        remainingTriggers: afterCheck.triggered.remainingTriggers,
        usage: afterCheck.triggered.usage,
      },
      receipt,
    );
    return 'paused';
  }
  return 'complete';
}

function queueWorkflowRequest(s, next, extra = {}) {
  const beforeCheck = prepareWorkflowCheck(s, next);
  if (beforeCheck?.triggered.paused) {
    attachReactionResume(s, beforeCheck.triggered.paused, {
      kind: 'beforeCheck',
      next,
      extra,
      event: beforeCheck.event,
      remainingTriggers: beforeCheck.triggered.remainingTriggers,
      usage: beforeCheck.triggered.usage,
    });
    return s.queue.find(
      (entry) => entry.uid === beforeCheck.triggered.paused.requestId,
    );
  }
  const request = {
    uid: ++s.serial,
    ...next.request,
    ...extra,
    workflow: next.flow,
  };
  if (next.request.kind === 'diceRequest')
    request.rolls = next.request.rolls.map((r, index) => ({
      ...r,
      id: 'side-' + index,
      dice: null,
    }));
  s.queue.unshift(request);
  return request;
}

function startEventWorkflow(state, cardMessage) {
  const s = structuredClone(state),
    h = s.heroes[cardMessage.heroId],
    card = cardDefinition(s, 'event', cardMessage.cardId, h.id),
    trait = traitRuleView(s, h, card.trait);
  s.queue.shift();
  const flow = createEventCheckWorkflow({
      flowId: `flow-${++s.serial}`,
      heroId: h.id,
      card: { ...card, traitLabel: trait.label },
      diceCount: eventDiceCount(s, h, card),
      rollLabel: h.name + ' · ' + trait.label,
      outcomes: rollOutcomes(s, {}, cardMessage),
      visibility: cardMessage.visibility,
    }),
    next = continueWorkflow(s, flow);
  if (next.status !== 'waiting') return s;
  queueWorkflowRequest(s, next);
  return s;
}

function startHauntRollWorkflow(state, hauntMessage) {
  const s = structuredClone(state);
  s.queue.shift();
  const flow = createHauntRollWorkflow({
      flowId: `haunt-roll:${++s.serial}`,
      heroId: hauntMessage.heroId ?? s.active,
      diceCount: s.omens,
      outcomes: rollOutcomes(s, {}, hauntMessage),
    }),
    next = continueWorkflow(s, flow);
  queueWorkflowRequest(s, next);
  return s;
}

function resolveHauntRollWorkflow(s, flow) {
  if (flow.definitionId !== HAUNT_ROLL_WORKFLOW)
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  const dice = flow.locals.rolls.haunt[0],
    total = dice.reduce((sum, face) => sum + face, 0),
    triggers = total >= 5 || s.omens >= OMENS.length;
  announce(
    s,
    triggers ? '有东西醒来了' : '宅邸暂时沉寂',
    triggers
      ? total >= 5
        ? '总点数达到5，作祟即将降临。'
        : '最后一张预兆已揭示，作祟必然降临。'
      : '总点数不足5，继续探索。下一张预兆会让检定多投1枚骰子。',
    'hauntResult',
    {
      heroId: flow.locals.haunt.heroId,
      dice,
      total,
      threshold: 5,
      triggers,
      workflow: {
        flowId: flow.flowId,
        definitionId: flow.definitionId,
        definitionVersion: flow.definitionVersion,
      },
    },
  );
  log(s, `作祟检定 ${total} / 5：${triggers ? '即将进入作祟' : '尚未触发'}。`);
}

function startRoomFallWorkflow(state, roomFall) {
  const s = structuredClone(state),
    participants = (roomFall.passengerIds || [roomFall.heroId])
      .map((id) => s.heroes[id])
      .filter((hero) => !hero.dead);
  s.queue.shift();
  const flow = createRoomFallWorkflow({
      flowId: `room-fall:${roomFall.uid}:${++s.serial}`,
      roomFall,
      participants,
      outcomes: rollOutcomes(s, {}, roomFall),
    }),
    next = continueWorkflow(s, flow);
  queueWorkflowRequest(s, next);
  return s;
}

function resolveRoomFallWorkflow(s, flow) {
  if (flow.definitionId !== ROOM_FALL_WORKFLOW)
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  const p = flow.locals.roomFall,
    results = flow.locals.participants.map((participant, index) => ({
      hero: s.heroes[participant.heroId],
      dice: flow.locals.rolls.fall[index],
    })),
    text = results
      .map(({ hero, dice }) => `${hero.name}受到 ${dice[0]} 点肉体伤害。`)
      .join('');
  announce(s, p.title + '结果', text, 'check', {
    heroId: p.heroId,
    workflow: {
      flowId: flow.flowId,
      definitionId: flow.definitionId,
      definitionVersion: flow.definitionVersion,
    },
  });
  for (const { hero, dice } of results) {
    log(s, `${hero.name}的${p.title}：${dice[0]} 点肉体伤害。`);
    damage(s, hero, 'physical', dice[0], {
      rootActionId: flow.flowId,
      causeId: flow.flowId,
      sourceKind: 'room',
      sourceRoomId: p.roomId,
      causeTag: 'fall',
    });
  }
  if (p.roomId && p.discovered)
    enqueue(s, {
      kind: 'roomArrival',
      heroId: p.heroId,
      roomId: p.roomId,
      enterKind: 'fall',
      discovered: true,
    });
}

function startElevatorWorkflow(state, action) {
  const s = structuredClone(state),
    hero = s.heroes[s.active],
    room = roomAt(s, hero?.pos),
    legal = actions(s),
    ability = findAction(action, legal.abilities);
  if (!hero || !room || ability?.workflow !== 'room.elevator') return s;
  const flow = createElevatorWorkflow({
      flowId: `elevator:${s.round}:${hero.id}:${++s.serial}`,
      heroId: hero.id,
      roomId: room.id,
      heroName: hero.name,
      outcomes: ability.outcomes || [],
    }),
    next = continueWorkflow(s, flow);
  queueWorkflowRequest(s, next);
  return s;
}

function resolveElevatorWorkflow(s, flow) {
  if (flow.definitionId !== ELEVATOR_WORKFLOW)
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  const { heroId, roomId } = flow.locals.elevator,
    hero = s.heroes[heroId],
    room = roomAt(s, roomId);
  if (!hero || !room || hero.pos !== room.id || hero.moves < 1) return;
  operateElevator(s, hero, room, flow.locals.rolls.elevator[0]);
}

function actionCheckDiceCount(s, hero, checkSpec) {
  const baseDice = traitValue(hero, checkSpec.trait, s);
  return checkSpec.applyModifiers === false
    ? baseDice
    : modifierValue(
        s,
        'check.dice',
        {
          heroId: hero.id,
          checkKind: checkSpec.checkKind,
          trait: checkSpec.trait,
          includeAll: checkSpec.includeAll,
        },
        baseDice,
      );
}

function resolveActionDice(s, hero, action, label, context) {
  const checkSpec = action.checkSpec,
    dice =
      context.dice ||
      roll(s, actionCheckDiceCount(s, hero, checkSpec), {
        heroId: hero.id,
        label,
        bonus: checkSpec.bonus || 0,
      });
  return {
    dice,
    total:
      context.total ??
      dice.reduce((sum, face) => sum + face, 0) + (checkSpec.bonus || 0),
  };
}

function startActionCheckWorkflow(state, command) {
  const s = structuredClone(state),
    hero = s.heroes[s.active],
    legal = actions(s),
    action = findAction(command, legal.abilities);
  if (!hero || !action?.checkSpec) return s;
  const checkSpec = action.checkSpec,
    trait = checkSpec.trait,
    diceCount = actionCheckDiceCount(s, hero, checkSpec),
    bonus = checkSpec.bonus || 0,
    traitLabel = traitRuleView(s, hero, trait).label;
  const flow = createActionCheckWorkflow({
      flowId: `action-check:${s.round}:${hero.id}:${++s.serial}`,
      heroId: hero.id,
      action,
      command,
      diceCount,
      rollLabel: hero.name + ' · ' + traitLabel,
      bonus,
      outcomes: action.outcomes || [],
    }),
    next = continueWorkflow(s, flow);
  queueWorkflowRequest(s, next);
  return s;
}

function resolveActionCheckWorkflow(s, flow) {
  if (flow.definitionId !== ACTION_CHECK_WORKFLOW)
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  const action = flow.locals.action,
    command = flow.locals.command,
    hero = s.heroes[flow.locals.diceRequest.heroId],
    room = roomAt(s, hero?.pos),
    handler = RULE_ACTION_HANDLERS[action.handler];
  if (!hero || !room || !handler) return;
  handler(s, command, action, {
    hero,
    room,
    dice: flow.locals.rolls.check[0],
    total:
      flow.locals.rolls.check[0].reduce((sum, face) => sum + face, 0) +
      (action.checkSpec.bonus || 0),
  });
  const result = s.queue.find((entry) => entry.kind === 'check');
  if (result)
    result.workflow = {
      flowId: flow.flowId,
      definitionId: flow.definitionId,
      definitionVersion: flow.definitionVersion,
    };
}

function startCollapseEntryWorkflow(state, command, placement) {
  const s = structuredClone(state),
    hero = s.heroes[placement.heroId],
    tile = ROOM_DECK.find((entry) => entry.id === placement.tileId),
    valid =
      tile &&
      placementOptions(s, placement.from, placement.dir, tile).some(
        (option) => option.rotation === placement.rotation,
      );
  if (
    !hero ||
    !valid ||
    placement.mode === 'elevator' ||
    tile.special !== 'collapse'
  )
    return s;
  const flow = createCollapseEntryWorkflow({
      flowId: `collapse-entry:${placement.uid}:${++s.serial}`,
      heroId: hero.id,
      heroName: hero.name,
      command,
      diceCount: traitValue(hero, 'speed', s),
      outcomes: rollOutcomes(s, command, placement),
    }),
    next = continueWorkflow(s, flow);
  queueWorkflowRequest(s, next);
  return s;
}

function startExistingCollapseWorkflow(state, command) {
  const s = structuredClone(state),
    hero = s.heroes[s.active],
    destination = roomAt(s, command.pos),
    legal = actions(s);
  if (
    !hero ||
    !destination ||
    ![...legal.move, ...legal.stairs].includes(destination.id) ||
    roomRuleView(s, destination, hero.id).special !== 'collapse' ||
    destination.collapseChecked
  )
    return s;
  const flow = createCollapseEntryWorkflow({
      flowId: `collapse-entry:${s.round}:${hero.id}:${++s.serial}`,
      heroId: hero.id,
      heroName: hero.name,
      command,
      diceCount: traitValue(hero, 'speed', s),
      outcomes: rollOutcomes(s, command),
    }),
    next = continueWorkflow(s, flow);
  queueWorkflowRequest(s, next);
  return s;
}

function resolveCollapseEntryWorkflow(s, flow) {
  if (flow.definitionId !== COLLAPSE_ENTRY_WORKFLOW)
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  const command = {
      ...flow.locals.command,
      collapseDice: flow.locals.rolls.check[0],
    },
    resolved =
      command.type === 'move'
        ? startHeroMoveWorkflow(s, command)
        : applyAction(s, command);
  for (const key of Object.keys(s)) delete s[key];
  Object.assign(s, resolved);
}

function startHeroMoveWorkflow(state, command) {
  const s = structuredClone(state),
    hero = s.heroes[s.active],
    destination = roomAt(s, command.pos),
    legal = actions(s);
  if (
    !hero ||
    !destination ||
    ![...legal.move, ...legal.stairs].includes(destination.id)
  )
    return s;
  const fromRoom = roomAt(s, hero.pos),
    enterKind = fromRoom.floor === destination.floor ? 'walk' : 'stairs',
    flow = createHeroMoveWorkflow({
      flowId: `hero-move:${s.round}:${hero.id}:${++s.serial}`,
      heroId: hero.id,
      fromRoomId: fromRoom.id,
      toRoomId: destination.id,
      moveCost: legal.moveCost,
      enterKind,
      collapseDice: command.collapseDice,
    });
  continueWorkflow(s, flow);
  check(s);
  finishArrival(s);
  return s;
}

function commitHeroMoveWorkflow(s, flow) {
  if (flow.definitionId !== HERO_MOVE_WORKFLOW)
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  const move = flow.locals.move,
    hero = s.heroes[move.heroId],
    fromRoom = roomAt(s, move.fromRoomId),
    destination = roomAt(s, move.toRoomId);
  if (!hero || !fromRoom || !destination || hero.pos !== fromRoom.id) {
    move.cancelled = true;
    return;
  }
  hero.moves -= move.moveCost;
  hero.pos = destination.id;
  recordEvent(s, 'EntityMoved', {
    entityType: 'hero',
    entityId: hero.id,
    fromRoomId: fromRoom.id,
    toRoomId: destination.id,
    path: [fromRoom.id, destination.id],
    moveKind: move.enterKind,
  });
  s.viewFloor = destination.floor;
  log(
    s,
    `${hero.name}进入${FLOORS.find((floor) => floor.id === destination.floor).name} · ${roomRuleView(s, destination, hero.id).name}，移动力剩余${hero.moves}。`,
  );
}

function runRoomEntryTiming(s, flow, when) {
  const move = flow.locals.move;
  if (move.cancelled || (when === 'AfterRoomEnter' && !move.entered)) return;
  const hero = s.heroes[move.heroId],
    destination = roomAt(s, move.toRoomId);
  if (!hero || !destination) return;
  const eventKey = when === 'BeforeRoomEnter' ? 'roomEvent' : 'afterRoomEvent',
    event = (flow.locals[eventKey] ||= {
      when,
      rootActionId: move.rootActionId || flow.flowId,
      causeId: move.rootActionId || flow.flowId,
      heroId: hero.id,
      roomId: destination.id,
      fromRoomId: move.fromRoomId,
      enterKind: move.enterKind,
      discovered: !!move.discovered,
      ...(when === 'BeforeRoomEnter' ? { cancelled: false } : {}),
    }),
    triggered = fireRuleTiming(
      s,
      event,
      undefined,
      flow.locals.triggerUsage || [],
      { allowPause: true },
    );
  flow.locals.triggerUsage = triggered.usage;
  if (!triggered.paused) return;
  const nextStep = flow.step + 1;
  flow.step = nextStep;
  attachReactionResume(s, triggered.paused, {
    kind: 'workflow',
    flow,
    event,
    remainingTriggers: triggered.remainingTriggers,
    usage: triggered.usage,
  });
  return { suspend: true, nextStep };
}

function resolveRoomEntryWorkflow(s, flow) {
  const move = flow.locals.move;
  if (move.cancelled) return;
  const hero = s.heroes[move.heroId],
    destination = roomAt(s, move.toRoomId);
  if (!hero || !destination) return;
  move.entered = enterRoom(s, hero, destination, {
    fromRoomId: move.fromRoomId,
    enterKind: move.enterKind,
    discovered: !!move.discovered,
    collapseDice: move.collapseDice,
    rootActionId: move.rootActionId || flow.flowId,
    roomEvent: flow.locals.roomEvent,
    triggerUsage: flow.locals.triggerUsage,
    skipBefore: true,
    skipAfter: true,
  });
}

function completeRoomEntryCard(s, flow) {
  const move = flow.locals.move,
    hero = s.heroes[move.heroId],
    destination = roomAt(s, move.toRoomId);
  if (!move.entered || !move.drawCard || !hero || !destination || hero.dead)
    return;
  const destinationView = roomRuleView(s, destination, hero.id);
  if (destinationView.icon) drawCard(s, destinationView.icon, hero);
}

function startRoomEntryWorkflow(s, entry) {
  const flow = createRoomEntryWorkflow({
    flowId: `room-entry:${entry.heroId}:${++s.serial}`,
    ...entry,
  });
  continueWorkflow(s, flow);
  return flow;
}

function startHeroAttackWorkflow(state, action) {
  const s = structuredClone(state),
    hero = s.heroes[s.active],
    enemy = s.enemies.find((entry) => entry.id === action.id),
    legal = actions(s),
    ability = findAction(action, legal.abilities);
  if (!hero || !enemy || ability?.workflow !== 'combat.heroAttack') return s;
  const attackCount = modifierValue(
      s,
      'check.dice',
      { heroId: hero.id, checkKind: 'attack', trait: 'might' },
      traitValue(hero, 'might', s),
    ),
    damageCap = modifierValue(s, 'combat.damage.cap', { enemyId: enemy.id }, 3),
    flow = createHeroAttackWorkflow({
      flowId: `flow-${++s.serial}`,
      hero,
      enemy,
      attackCount,
      defenseCount: wolfMight(s, enemy),
      attackBonus: s.silver,
      damageCap,
      enemyRollMeta: enemyDiceMeta(s, enemy),
      outcomes: ability.outcomes || [],
    }),
    next = continueWorkflow(s, flow);
  queueWorkflowRequest(s, next);
  return s;
}

function startTurnTransitionWorkflow(state, action) {
  const s = structuredClone(state),
    heroIds =
      action.type === 'endHero'
        ? [s.active]
        : living(s)
            .filter((hero) => !hero.ended)
            .map((hero) => hero.id),
    flow = createTurnTransitionWorkflow({
      flowId: `turn-transition:${s.round}:${++s.serial}`,
      commandType: action.type,
      heroIds,
      activeHeroId: s.active,
      round: s.round,
      outcomes: rollOutcomes(s, action),
    });
  continueWorkflow(s, flow);
  return s;
}

function turnLifecycle(flow) {
  if (flow.definitionId !== TURN_TRANSITION_WORKFLOW)
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  return flow.locals.lifecycle;
}

function prepareTurnEndingWorkflow(s, flow) {
  const lifecycle = turnLifecycle(flow);
  while (lifecycle.heroIndex < lifecycle.heroIds.length) {
    const hero = s.heroes[lifecycle.heroIds[lifecycle.heroIndex]];
    if (!hero || hero.dead || hero.ended) {
      lifecycle.heroIndex++;
      continue;
    }
    lifecycle.currentHeroId = hero.id;
    lifecycle.lifecycleEvent = {
      when: 'TurnEnding',
      rootActionId: `turn:${lifecycle.round}:${hero.id}`,
      causeId: `turn:${lifecycle.round}:${hero.id}`,
      heroId: hero.id,
      round: lifecycle.round,
    };
    lifecycle.endDone = false;
    return;
  }
  lifecycle.endDone = true;
  delete lifecycle.currentHeroId;
  delete lifecycle.lifecycleEvent;
}

function runTurnLifecycleTiming(s, flow, expectedWhen) {
  const lifecycle = turnLifecycle(flow),
    event = lifecycle.lifecycleEvent;
  if (!event || event.when !== expectedWhen)
    throw new Error(`Missing lifecycle event: ${expectedWhen}`);
  return runWorkflowTiming(s, flow, event);
}

function commitTurnEndingWorkflow(s, flow) {
  const lifecycle = turnLifecycle(flow),
    hero = s.heroes[lifecycle.currentHeroId];
  if (!hero || hero.dead) return;
  hero.ended = true;
  hero.moves = 0;
}

function advanceTurnEndingWorkflow(flow) {
  const lifecycle = turnLifecycle(flow);
  lifecycle.heroIndex++;
  return { nextStep: 0 };
}

function prepareNextHeroWorkflow(s, flow) {
  const lifecycle = turnLifecycle(flow),
    nextHero = living(s).find((hero) => !hero.ended);
  lifecycle.nextHeroId = nextHero?.id;
  lifecycle.hasNextHero = !!nextHero;
}

function commitNextHeroWorkflow(s, flow) {
  const lifecycle = turnLifecycle(flow),
    previous = s.heroes[lifecycle.activeHeroId],
    nextHero = s.heroes[lifecycle.nextHeroId];
  if (!nextHero || nextHero.dead || nextHero.ended) return;
  s.active = nextHero.id;
  s.viewFloor = roomAt(s, nextHero.pos).floor;
  startHeroTurn(s, nextHero);
  log(s, previous.name + '结束行动，轮到' + nextHero.name + '。');
}

function prepareRoundEndingWorkflow(s, flow) {
  const lifecycle = turnLifecycle(flow);
  lifecycle.lifecycleEvent = {
    when: 'RoundEnding',
    rootActionId: `round:${lifecycle.round}`,
    causeId: `round:${lifecycle.round}`,
    round: lifecycle.round,
    heroId: s.active,
  };
}

function commitRoundEndingWorkflow(s, flow) {
  const lifecycle = turnLifecycle(flow);
  if (s.phase !== 'haunt') {
    startNextRound(s);
    return;
  }
  if (!lifecycle.hauntRoundPrepared) {
    lifecycle.hauntRoundPrepared = true;
    s.elapsed++;
    lifecycle.report = [];
    lifecycle.statusExpiredEvents = [];
    lifecycle.statusExpiredIndex = 0;
  }
  const report = lifecycle.report;
  if (s.scenario === 'werewolf' && !lifecycle.statusTimingDone) {
    lifecycle.statusEvent ||= {
      when: 'RoundStatusTick',
      rootActionId: `round:${s.round}`,
      causeId: `round:${s.round}`,
      round: s.round,
      heroId: s.active,
    };
    const triggered = fireRuleTiming(
      s,
      lifecycle.statusEvent,
      report,
      flow.locals.triggerUsage || [],
      {
        allowPause: true,
        deferredEvents: lifecycle.statusExpiredEvents,
      },
    );
    appendWorkflowReceipts(s, flow, lifecycle.statusEvent, triggered);
    lifecycle.statusTimingDone = true;
    if (triggered.paused) {
      attachReactionResume(s, triggered.paused, {
        kind: 'workflow',
        flow,
        event: lifecycle.statusEvent,
        remainingTriggers: triggered.remainingTriggers,
        usage: triggered.usage,
        deferredEventPath: 'lifecycle.statusExpiredEvents',
      });
      return { suspend: true, nextStep: flow.step };
    }
  }
  while (lifecycle.statusExpiredIndex < lifecycle.statusExpiredEvents.length) {
    const event = lifecycle.statusExpiredEvents[lifecycle.statusExpiredIndex++],
      triggered = fireRuleTiming(
        s,
        event,
        report,
        flow.locals.triggerUsage || [],
        { allowPause: true },
      );
    appendWorkflowReceipts(s, flow, event, triggered);
    if (triggered.paused) {
      attachReactionResume(s, triggered.paused, {
        kind: 'workflow',
        flow,
        event,
        remainingTriggers: triggered.remainingTriggers,
        usage: triggered.usage,
      });
      return { suspend: true, nextStep: flow.step };
    }
  }
  if (!lifecycle.statusSettled) {
    lifecycle.statusSettled = true;
    check(s);
    finishArrival(s);
    if (s.phase === 'over') return;
  }
  if (lifecycle.enemyFlowStarted) return;
  lifecycle.enemyFlowStarted = true;
  const enemyFlow = createEnemyTurnWorkflow({
      flowId: `enemy-turn:${s.round}:${++s.serial}`,
      round: s.round,
      enemyIds: s.enemies.map((enemy) => enemy.id),
      report,
      outcomes: flow.locals.outcomes,
    }),
    next = continueWorkflow(s, enemyFlow);
  if (next.status === 'waiting') queueWorkflowRequest(s, next);
  lifecycle.enemyFlowId = enemyFlow.flowId;
}

function enemyTurnState(flow) {
  if (flow.definitionId !== ENEMY_TURN_WORKFLOW)
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  return flow.locals.enemyTurn;
}

function commitEnemyMovement(s, enemy, current, report) {
  if (current.movementCommitted) return;
  current.movementCommitted = true;
  if (current.path.length <= 1) return;
  enemy.pos = current.destination;
  const explorer = enemyExplorer(s, enemy);
  if (explorer) explorer.pos = enemy.pos;
  const hidden = enemy.hidden || enemy.revealed === false;
  recordEvent(
    s,
    'EntityMoved',
    {
      entityType: 'enemy',
      entityId: enemy.id,
      fromRoomId: current.path[0],
      toRoomId: enemy.pos,
      path: current.path,
      moveKind: 'hunt',
    },
    hidden ? 'internal' : 'public',
  );
  if (!hidden)
    report.push(enemy.name + '移动到' + roomAt(s, enemy.pos).name + '。');
}

function prepareEnemyWorkflow(s, flow) {
  const turn = enemyTurnState(flow);
  turn.hasAttack = false;
  turn.current = null;
  delete flow.locals.diceRequest;
  delete flow.locals.rolls?.contest;
  while (turn.enemyIndex < turn.enemyIds.length) {
    const enemyId = turn.pendingEnemyId || turn.enemyIds[turn.enemyIndex],
      enemy = s.enemies.find((entry) => entry.id === enemyId);
    if (!enemy || enemy.bornAt === s.elapsed) {
      turn.enemyIndex++;
      delete turn.pendingEnemyId;
      delete turn.startEvent;
      delete turn.startTimingDone;
      continue;
    }
    turn.pendingEnemyId = enemy.id;
    turn.startEvent ||= {
      when: 'EnemyTurnStarting',
      rootActionId: `round:${s.round}:enemy:${enemy.id}`,
      enemyId: enemy.id,
      causeId: `round:${s.round}:enemy:${enemy.id}`,
    };
    if (!turn.startTimingDone) {
      const triggered = fireRuleTiming(
        s,
        turn.startEvent,
        turn.report,
        flow.locals.triggerUsage || [],
        { allowPause: true },
      );
      appendWorkflowReceipts(s, flow, turn.startEvent, triggered);
      turn.startTimingDone = true;
      if (triggered.paused) {
        attachReactionResume(s, triggered.paused, {
          kind: 'workflow',
          flow,
          event: turn.startEvent,
          remainingTriggers: triggered.remainingTriggers,
          usage: triggered.usage,
        });
        return { suspend: true, nextStep: flow.step };
      }
    }
    const target =
      living(s).find((hero) => hero.id === enemy.huntTarget) ||
      living(s).sort(
        (a, b) =>
          graphDistance(s, enemy.pos, a.pos, { monster: true }) -
          graphDistance(s, enemy.pos, b.pos, { monster: true }),
      )[0];
    if (!target) {
      turn.done = true;
      return;
    }
    const path = pathTo(s, enemy.pos, target.pos, { monster: true }),
      route = path.length ? path.slice(0, enemy.speed + 1) : [enemy.pos],
      destination = route.at(-1),
      victims =
        destination === target.pos
          ? [
              target,
              ...living(s).filter(
                (hero) => hero.id !== target.id && hero.pos === destination,
              ),
            ].slice(0, enemy.kind === 'alpha' && s.count >= 5 ? 2 : 1)
          : [],
      movement =
        !enemy.hidden && enemy.revealed !== false
          ? {
              enemyId: enemy.id,
              name: enemy.name,
              kind: enemy.kind,
              ...(enemy.heroId !== undefined ? { heroId: enemy.heroId } : {}),
              path: route,
              targetId: target.id,
              targetName: target.name,
              attacks: victims.length > 0,
            }
          : null;
    if (movement)
      recordEvent(s, 'MovementQueued', {
        flowId: flow.flowId,
        entityType: 'enemy',
        entityId: enemy.id,
        ...movement,
      });
    const current = {
      enemyId: enemy.id,
      path: route,
      destination,
      victimIds: victims.map((hero) => hero.id),
      movementCommitted: false,
      movement,
    };
    turn.current = current;
    if (!victims.length) {
      commitEnemyMovement(s, enemy, current, turn.report);
      return;
    }
    turn.hasAttack = true;
    s.viewFloor = roomAt(s, destination).floor;
    flow.locals.diceRequest = {
      kind: 'diceRequest',
      heroId: victims[0].id,
      title: enemy.name + '来袭',
      text: '逐组比较敌人攻击与人物防御。',
      outcomes: flow.locals.outcomes,
      rolls: victims.flatMap((victim) => [
        {
          count: wolfMight(s, enemy, { roomId: destination }),
          ...enemyDiceMeta(s, enemy),
          roomId: destination,
          targetId: victim.id,
          label:
            enemy.name +
            ' → ' +
            victim.name +
            ' · ' +
            roomRuleView(s, roomAt(s, destination), victim.id).name,
        },
        {
          count: modifierValue(
            s,
            'check.dice',
            { heroId: victim.id, checkKind: 'defense', trait: 'might' },
            traitValue(victim, 'might', s),
          ),
          heroId: victim.id,
          label:
            victim.name +
            ' · ' +
            traitRuleView(s, victim, 'might').label +
            '防御',
        },
      ]),
    };
    return;
  }
  turn.done = true;
}

function resolveEnemyWorkflowAttack(s, flow) {
  const turn = enemyTurnState(flow),
    current = turn.current,
    enemy = s.enemies.find((entry) => entry.id === current.enemyId),
    rolls = flow.locals.rolls.contest;
  if (!enemy) return;
  commitEnemyMovement(s, enemy, current, turn.report);
  current.victimIds.forEach((heroId, index) => {
    const target = living(s).find(
      (hero) => hero.id === heroId && hero.pos === enemy.pos,
    );
    if (!target) return;
    const attack = rolls[index * 2],
      defense = rolls[index * 2 + 1],
      attackTotal = attack.reduce((sum, face) => sum + face, 0),
      defenseTotal = defense.reduce((sum, face) => sum + face, 0),
      amount = Math.min(3, Math.max(0, attackTotal - defenseTotal));
    turn.report.push(
      `${enemy.name}攻击${target.name}：${attackTotal} 对 ${defenseTotal}，${amount ? amount + '点肉体伤害' : '挡住了攻击'}。`,
    );
    damage(s, target, 'physical', amount, {
      rootActionId: `enemy-turn:${s.round}:${enemy.id}`,
      causeId: `${flow.flowId}:${enemy.id}:${target.id}`,
      sourceKind: 'enemy',
      sourceEnemyId: enemy.id,
      causeTag: 'attack',
      report: turn.report,
    });
    if (
      amount &&
      ['alpha', 'wolf'].includes(enemy.kind) &&
      applyWerewolfInfection(s, target, {
        rootActionId: `enemy-turn:${s.round}:${enemy.id}`,
        causeId: `${flow.flowId}:${enemy.id}:${target.id}:infection`,
        sourceKind: 'enemy',
        sourceEnemyId: enemy.id,
      })
    )
      turn.report.push(
        target.name + '感染狼毒：还有3个行动轮治疗，重复咬伤不会缩短时间。',
      );
  });
}

function advanceEnemyWorkflow(flow) {
  const turn = enemyTurnState(flow);
  turn.enemyIndex++;
  turn.current = null;
  turn.hasAttack = false;
  delete turn.pendingEnemyId;
  delete turn.startEvent;
  delete turn.startTimingDone;
  delete flow.locals.diceRequest;
  delete flow.locals.rolls?.contest;
  return { nextStep: 0 };
}

function finishEnemyWorkflow(s, flow) {
  const turn = enemyTurnState(flow),
    report = turn.report;
  scenarioRules(s.scenario).afterEnemies?.(s, report);
  report.forEach((text) => log(s, text));
  announce(
    s,
    '黑暗中的动静',
    report.join('\n') || '暂时没有敌人靠近，但宅邸的倒计时仍在推进。',
    'enemyTurn',
    {
      remaining: s.limit - s.elapsed,
      workflow: {
        flowId: flow.flowId,
        definitionId: flow.definitionId,
        definitionVersion: flow.definitionVersion,
      },
    },
  );
  if (s.elapsed >= s.limit) {
    end(s, false, scenarioRules(s.scenario).timeoutReason);
    return;
  }
  s.roundEnding = true;
}

export function drawCard(s, type, h) {
  if (!s.decks[type].length) {
    if (type === 'event' && s.discards.event.length) {
      s.decks.event = shuffle(s, s.discards.event);
      s.discards.event = [];
      log(s, '事件弃牌重新洗入牌堆。');
    } else {
      announce(
        s,
        '牌堆已空',
        `${type === 'item' ? '物品' : '预兆'}牌已经抽完，这个房间没有留下新的卡牌。`,
      );
      return;
    }
  }
  const cardId = s.decks[type].shift();
  const card = cardDefinition(s, type, cardId, h.id);
  if (type === 'event') s.discards.event.push(cardId);
  if (card.stopsMovement) {
    h.stopped = true;
    h.moves = 0;
  }
  enqueue(s, {
    kind: 'card',
    cardType: type,
    cardId,
    heroId: h.id,
    title: card.title,
    text: '',
    stage: 'draw',
    visibility: type === 'event' ? 'public' : heroVisibility(s, h),
  });
  log(
    s,
    `${h.name}抽取了一张${type === 'event' ? '事件' : type === 'item' ? '物品' : '预兆'}卡。${card.stopsMovement ? '本回合停止移动。' : '这张牌不停止移动。'}`,
  );
}
// Room travel keeps identity stable: occupants, objectives and tokens follow the tile.
export function roomDestinations(s, tile, floors, movingId = null) {
  const board = movingId
    ? { ...s, rooms: s.rooms.filter((r) => r.id !== movingId) }
    : s;
  return floors.flatMap((floor) =>
    frontiers(board, floor).flatMap((f) => {
      const options = placementOptions(board, f.from, f.dir, tile);
      return options.length ? [{ ...f, options }] : [];
    }),
  );
}
// A landing cell may connect to several different rooms. Rotation switches its anchor too.
export function roomPlacementOptions(destinations, point) {
  const options = destinations
    .filter(
      (d) => d.floor === point.floor && d.x === point.x && d.y === point.y,
    )
    .flatMap((d) => d.options.map((o) => ({ ...o, from: d.from, dir: d.dir })));
  return [...new Map(options.map((o) => [o.rotation, o])).values()].sort(
    (a, b) => a.rotation - b.rotation,
  );
}
function roomPlacement(s, h, tile, mode, destinations, extra = {}) {
  const first = destinations[0];
  const options = roomPlacementOptions(destinations, first);
  enqueue(s, {
    kind: 'placement',
    title: mode === 'elevator' ? '电梯将停靠……' : '地下室落点',
    tileId: tile.id,
    heroId: h.id,
    mode,
    destinations,
    ...first,
    options,
    ...options[0],
    ...extra,
  });
  s.viewFloor = first.floor;
}
function fallIntoRoom(s, h, source, destination, discovered = false) {
  if (!setCollapseLanding(s, source.id, destination.id)) return;
  destination.tokens ||= [];
  if (!destination.tokens.some((t) => t.id === 'below-' + source.id))
    destination.tokens.push({
      id: 'below-' + source.id,
      icon: '↧',
      label: '坍塌落点',
      description:
        '从「' + source.name + '」跳下会落在这里；坍塌通路不能反向攀爬。',
    });
  h.pos = destination.id;
  s.viewFloor = destination.floor;
  s.roomMotion = { uid: ++s.serial, roomId: destination.id, kind: 'fall' };
  recordEvent(s, 'EntityMoved', {
    entityType: 'hero',
    entityId: h.id,
    fromRoomId: source.id,
    toRoomId: destination.id,
    path: [source.id, destination.id],
    moveKind: 'fall',
  });
  log(
    s,
    h.name +
      '从「' +
      source.name +
      '」坠入地下室「' +
      destination.name +
      '」，不消耗额外移动力。',
  );
  enqueue(s, {
    kind: 'roomFall',
    heroId: h.id,
    title: '坠落冲击',
    text: '已落入「' + destination.name + '」。掷 1 枚骰决定肉体伤害。',
    roomId: destination.id,
    discovered,
  });
}
function startFall(s, h, source) {
  const existing = roomAt(s, source.collapseLanding);
  if (existing) return fallIntoRoom(s, h, source, existing);
  // Avoid recursive special-room discovery: this adaptation uses ordinary basement tiles.
  for (const id of s.decks.rooms) {
    const tile = ROOM_DECK.find((t) => t.id === id);
    if (tile.special === 'elevator') continue;
    const destinations = roomDestinations(s, tile, [-1]);
    if (!destinations.length) continue;
    s.decks.rooms.splice(s.decks.rooms.indexOf(id), 1);
    roomPlacement(s, h, tile, 'collapse', destinations, {
      sourceId: source.id,
    });
    log(s, '坍塌下方发现「' + tile.name + '」，选择地下室落点。');
    return;
  }
  log(s, '没有可放置的地下室房间，坍塌落点改为地下室平台。');
  fallIntoRoom(s, h, source, roomAt(s, 'basement'));
}
function operateElevator(s, h, r, resolvedDice) {
  h.moves -= 1;
  const dice =
    resolvedDice || roll(s, 2, { heroId: h.id, label: h.name + ' · 神秘电梯' });
  const total = dice.reduce((a, b) => a + b, 0);
  const floors =
    total === 4 ? [1, 0, -1] : [total === 3 ? 1 : total === 2 ? 0 : -1];
  const sameFloor = floors.length === 1 && floors[0] === r.floor;
  const destinations = roomDestinations(
    s,
    r,
    floors.filter((floor) => total === 4 || floor !== r.floor),
    r.id,
  );
  const text =
    '电梯投出 ' +
    total +
    ' 点：' +
    (total === 4 ? '任选楼层' : FLOORS.find((f) => f.id === floors[0]).name) +
    (total === 0 ? '；室内每名探险者各受 1 枚骰的肉体伤害。' : '。') +
    (sameFloor
      ? '目标为当前楼层，电梯保持原位置和朝向。'
      : total === 4
        ? '可在任意楼层选择合法位置（包括当前楼层），或留在原位。'
        : '');
  log(s, h.name + '花费1点移动力启动神秘电梯，剩余' + h.moves + '点。' + text);
  if (destinations.length)
    roomPlacement(s, h, r, 'elevator', destinations, {
      dice,
      total,
      text,
      elevatorCrash: total === 0,
    });
  else {
    announce(
      s,
      sameFloor ? '电梯原位停靠' : '电梯未能移动',
      text + (sameFloor ? '' : '其他目标楼层没有合法门口，电梯留在原处。'),
      'check',
      { dice, total },
    );
    if (total === 0)
      enqueue(s, {
        kind: 'roomFall',
        heroId: h.id,
        title: '电梯冲击',
        text: '室内每名探险者各掷 1 枚骰决定肉体伤害。',
        passengerIds: living(s)
          .filter((hero) => hero.pos === r.id)
          .map((hero) => hero.id),
      });
  }
}

const RULE_ACTION_HANDLERS = {
  'scenario.werewolf.order': (s, _command, action) => {
    const enemy = s.enemies.find(
      (entry) => entry.heroId === action.sourceHeroId,
    );
    if (!enemy) return;
    enemy.huntTarget = action.targetId;
    log(s, enemy.name + '锁定了' + action.targetLabel + '。', {
      faction: 'wolves',
    });
  },
  'hero.rest': (s, _command, action, context) => {
    context.hero.rested = true;
    context.hero.stopped = true;
    context.hero.moves = 0;
    const change = changeTrait(s, context.hero, action.trait, 1);
    announce(s, '喘息片刻', change + '。休整后，本回合不能再移动。', 'trait');
  },
  'room.elevator.use': (s, _command, _action, context) =>
    operateElevator(s, context.hero, context.room),
  'room.collapse.jump': (s, _command, _action, context) =>
    startFall(s, context.hero, context.room),
  'room.basement.findReturn': (s, _command, _action, context) => {
    context.hero.moves -= context.moveCost;
    s.basementUnlocked = true;
    addMapLink(s, 'basement', 'foyer');
    log(s, context.hero.name + '在地下室平台找到了回程暗梯，通向一楼门厅。');
  },
  'scenario.werewolf.boardWindow': (s, _command, _action, context) => {
    context.hero.interacted = true;
    context.room.states ||= {};
    context.room.states.boarded = true;
    log(
      s,
      context.hero.name +
        '封住了' +
        roomRuleView(s, context.room, context.hero.id).name +
        '的窗户，月光不再增强狼人。',
    );
  },
  'scenario.werewolf.cure': (s, _command, action, context) => {
    const target = living(s).find(
      (hero) =>
        hero.id === action.targetId &&
        hero.pos === context.hero.pos &&
        statusOf(hero, 'infection'),
    );
    if (!target) return;
    context.hero.interacted = true;
    const infection = statusOf(target, 'infection');
    infection.attempts++;
    const { dice, total } = resolveActionDice(
        s,
        context.hero,
        action,
        context.hero.name + ' · 治疗狼毒',
        context,
      ),
      threshold = action.checkSpec.threshold;
    if (total >= threshold)
      applyWerewolfCure(s, target, {
        rootActionId: action.id,
        causeId: `${action.id}:success`,
        sourceKind: 'action',
      });
    announce(
      s,
      total >= threshold ? '狼毒已清除' : '治疗尚未成功',
      target.name +
        (total >= threshold
          ? '获得两轮净血保护。'
          : '仍有' + infection.turns + '轮；下次治疗额外 +1。'),
      'check',
      { dice, total, threshold },
    );
    log(
      s,
      context.hero.name +
        '治疗' +
        target.name +
        '：' +
        total +
        '/' +
        threshold +
        '。',
    );
  },
  'combat.hero.attack': (s, _command, action, context) => {
    const enemy = s.enemies.find((entry) => entry.id === action.targetId);
    if (!enemy) return;
    const attack = roll(
        s,
        modifierValue(
          s,
          'check.dice',
          { heroId: context.hero.id, checkKind: 'attack', trait: 'might' },
          traitValue(context.hero, 'might', s),
        ),
        {
          heroId: context.hero.id,
          label: context.hero.name + ' · 力量',
          bonus: s.silver,
        },
      ),
      defense = roll(s, wolfMight(s, enemy), enemyDiceMeta(s, enemy));
    resolveHeroAttack(
      s,
      context.hero,
      enemy,
      attack,
      defense,
      s.silver,
      modifierValue(s, 'combat.damage.cap', { enemyId: enemy.id }, 3),
      {
        rootActionId: `attack:${s.round}:${context.hero.id}:${enemy.id}:${s.serial + 1}`,
      },
    );
  },
  'scenario.flood.escape': (s) => {
    if (living(s).every((hero) => hero.pos === ENTRANCE))
      end(s, true, '所有幸存者已逃离宅邸。');
    else
      announce(s, '还有人没有回来', '请让所有幸存者抵达入口大厅，再一起逃生。');
  },
  'scenario.werewolf.moonSeal': (s, _command, action, context) => {
    const { hero, room } = context;
    hero.interacted = true;
    room.attempts++;
    const { dice, total } = resolveActionDice(
        s,
        hero,
        action,
        hero.name + ' · 净化月印',
        context,
      ),
      threshold = action.checkSpec.threshold,
      success = total >= threshold;
    if (success) {
      room.charges = (room.charges || 0) + 1;
      if (room.charges >= room.requiredCharges) {
        room.done = true;
        s.progress++;
      }
    }
    announce(
      s,
      success ? '月印净化' : '咒文渐渐清晰',
      success
        ? `本处月印 ${room.charges}/${room.requiredCharges}，已净化 ${s.progress}/2处；全部完成后回入口解咒。`
        : '下次尝试累计 +1。',
      'check',
      { dice, total, threshold },
    );
  },
  'scenario.werewolf.moonRitual': (s, _command, _action, context) => {
    context.hero.interacted = true;
    for (const hero of s.heroes) {
      hero.statuses = [];
      if (!hero.dead) {
        hero.traitor = false;
        hero.faction = 'heroes';
      }
    }
    s.enemies = [];
    end(s, true, '两道月印汇入银光，狼毒解除，狼王被驱逐。幸存者共同获胜。');
  },
  'scenario.bells.seal': (s, _command, action, context) => {
    const { hero, room } = context;
    hero.interacted = true;
    room.attempts++;
    const { dice, total } = resolveActionDice(
        s,
        hero,
        action,
        hero.name + ' · 知识',
        context,
      ),
      threshold = action.checkSpec.threshold,
      success = total >= threshold;
    if (success) {
      room.done = true;
      s.progress++;
    }
    announce(
      s,
      success ? '封印落下' : '残缺的咒文',
      success
        ? `已经封印 ${s.progress} / 3 处祭坛。`
        : '本次未成功。此祭坛下次检定额外 +1，可换队员尝试。',
      'check',
      { dice, total, threshold, success },
    );
    log(s, `祭坛检定 ${total} / ${threshold}，已封印${s.progress}/3。`);
    check(s);
    finishArrival(s);
  },
  'scenario.mirror.inspect': (s, _command, _action, context) => {
    const { hero, room } = context;
    hero.interacted = true;
    room.attempts++;
    room.done = true;
    s.progress++;
    if (room.id === s.trueMirror) {
      s.mirrorFound = true;
      const hp = 5 + s.count;
      s.enemies.push({
        id: 'wraith',
        name: '镜魇真身',
        pos: room.id,
        hp,
        maxHp: hp,
        might: 3,
        speed: 1,
        kind: 'wraith',
      });
      announce(
        s,
        '真身就在这里',
        '你的倒影没有跟着你转身。镜魇走出了玻璃，现在必须在同一房间击败它！',
        'reveal',
      );
    } else {
      s.silver++;
      announce(
        s,
        '空镜中的银屑',
        '你们的攻击总点数永久 +1。银屑效果可以叠加。',
        'clue',
      );
    }
    log(
      s,
      '调查古镜：' + (room.id === s.trueMirror ? '发现真身！' : '发现银屑。'),
    );
    check(s);
    finishArrival(s);
  },
  'scenario.flood.collectFuse': (s, _command, _action, context) => {
    context.hero.interacted = true;
    context.room.attempts++;
    context.room.done = true;
    s.fuses++;
    announce(
      s,
      '找到保险丝',
      `全队已经收集 ${s.fuses} / 2 枚保险丝。`,
      'itemUse',
    );
    log(s, '保险丝 ' + s.fuses + '/2。');
    check(s);
    finishArrival(s);
  },
  'scenario.flood.repairGenerator': (s, _command, _action, context) => {
    if (s.fuses < 2) {
      announce(s, '缺少保险丝', '需要收集两枚保险丝，才能修复发电机。');
      return;
    }
    context.hero.interacted = true;
    context.room.attempts++;
    context.room.done = true;
    s.powered = true;
    announce(
      s,
      '灯亮了',
      '门厅的门锁恢复了电力。让所有幸存者经楼梯返回一楼入口，然后一起逃生。',
      'power',
    );
    log(s, '电力恢复，全员返回入口大厅！');
    check(s);
    finishArrival(s);
  },
  'item.transfer': (s, _command, action, context) => {
    const target = s.heroes[action.targetHeroId],
      visibility = heroVisibility(s, context.hero);
    if (
      !target ||
      target.dead ||
      target.traitor ||
      target.pos !== context.hero.pos
    )
      return;
    const result = executeRuleEffects(
      s,
      [
        {
          op: 'item.transfer',
          params: {
            instanceId: action.instanceId,
            fromHeroId: context.hero.id,
            toHeroId: target.id,
          },
        },
      ],
      {
        event: { rootActionId: action.id, causeId: action.id, visibility },
      },
    );
    if (!result.executed.length) return;
    const card = cardDefinition(s, 'item', action.cardId, context.hero.id);
    announce(
      s,
      '交付物品',
      `${context.hero.name}把「${card.title}」交给${target.name}。`,
      'itemUse',
      { heroId: context.hero.id, visibility },
    );
    log(
      s,
      `${context.hero.name}把「${card.title}」交给${target.name}。`,
      visibility,
    );
  },
  'item.drop': (s, _command, action, context) => {
    const visibility = heroVisibility(s, context.hero);
    const result = executeRuleEffects(
      s,
      [
        {
          op: 'item.drop',
          params: {
            instanceId: action.instanceId,
            heroId: context.hero.id,
            roomId: context.room.id,
          },
        },
      ],
      {
        event: { rootActionId: action.id, causeId: action.id, visibility },
      },
    );
    if (!result.executed.length) return;
    const card = cardDefinition(s, 'item', action.cardId, context.hero.id);
    announce(
      s,
      '放下物品',
      `${context.hero.name}把「${card.title}」留在${roomRuleView(s, context.room, context.hero.id).name}。`,
      'itemUse',
      { heroId: context.hero.id, visibility },
    );
    log(s, `${context.hero.name}放下了「${card.title}」。`, visibility);
  },
  'item.pickup': (s, _command, action, context) => {
    const visibility = heroVisibility(s, context.hero);
    const result = executeRuleEffects(
      s,
      [
        {
          op: 'item.pickup',
          params: {
            instanceId: action.instanceId,
            heroId: context.hero.id,
            roomId: context.room.id,
          },
        },
      ],
      {
        event: { rootActionId: action.id, causeId: action.id, visibility },
      },
    );
    if (!result.executed.length) return;
    const card = cardDefinition(s, 'item', action.cardId, context.hero.id);
    announce(
      s,
      '拾取物品',
      `${context.hero.name}拾取了「${card.title}」。`,
      'itemUse',
      { heroId: context.hero.id, visibility },
    );
    log(s, `${context.hero.name}拾取了「${card.title}」。`, visibility);
  },
  'item.use': (s, _command, action, context) => {
    const card = cardDefinition(s, 'item', action.cardId, context.hero.id),
      visibility = heroVisibility(s, context.hero);
    const effects = [
      ...action.effects,
      {
        op: 'item.markUsed',
        params: {
          heroId: context.hero.id,
          instanceId: action.instanceId,
        },
      },
      ...(Number.isInteger(card.charges)
        ? [
            {
              op: 'item.spendCharge',
              params: {
                heroId: context.hero.id,
                instanceId: action.instanceId,
                amount: 1,
                initialCharges: card.charges,
              },
            },
          ]
        : []),
      ...(action.consume
        ? [
            {
              op: 'item.remove',
              params: {
                heroId: context.hero.id,
                instanceId: action.instanceId,
              },
            },
          ]
        : []),
    ];
    const result = executeRuleEffects(
      s,
      [{ op: 'effect.atomic', params: { effects } }],
      {
        event: {
          rootActionId: action.id,
          causeId: action.id,
          heroId: context.hero.id,
          sourceKind: 'item',
          sourceItemInstanceId: action.instanceId,
          visibility,
        },
      },
    );
    if (!result.executed.length) return;
    const committed = result.executed[0].result.effects,
      changes = committed
        .map((effect) => effect.result?.change)
        .filter(Boolean),
      resultText = changes.join('；') || action.resultText;
    recordEvent(
      s,
      'ItemUsed',
      {
        heroId: context.hero.id,
        itemId: action.cardId,
        itemInstanceId: action.instanceId,
        consumed: !!action.consume,
        effects: committed.map((effect) => effect.op),
      },
      visibility,
    );
    announce(s, '使用' + card.title, resultText, 'itemUse', {
      heroId: context.hero.id,
      itemInstanceId: action.instanceId,
      effects: committed,
      visibility,
    });
    log(
      s,
      `${context.hero.name}使用「${card.title}」：${resultText}`,
      visibility,
    );
  },
};
function enterRoom(s, h, r, entry = {}) {
  const rootActionId =
      entry.rootActionId || entry.causeId || `room-enter:${++s.serial}`,
    roomEvent = entry.roomEvent || {
      when: 'BeforeRoomEnter',
      rootActionId,
      causeId: entry.causeId || rootActionId,
      heroId: h.id,
      roomId: r.id,
      fromRoomId: entry.fromRoomId,
      enterKind: entry.enterKind || 'walk',
      discovered: !!entry.discovered,
      cancelled: false,
    },
    beforeEntry = entry.skipBefore
      ? { usage: entry.triggerUsage || [] }
      : fireRuleTiming(s, roomEvent, entry.report, entry.triggerUsage);
  if (roomEvent.cancelled) {
    log(s, `${h.name}进入「${r.name}」时，其房间效果被取消。`);
    return false;
  }
  const roomView = roomRuleView(s, r, h.id);
  if (roomView.special === 'collapse' && !r.collapseChecked) {
    r.collapseChecked = true;
    const dice =
      entry.collapseDice ||
      roll(s, traitValue(h, 'speed', s), {
        heroId: h.id,
        label: h.name + ' · 避开坍塌（速度 5+）',
      });
    const total = dice.reduce((a, b) => a + b, 0);
    log(
      s,
      h.name +
        '的坍塌检定 ' +
        total +
        '/5：' +
        (total >= 5 ? '及时站稳。' : '脚下楼板断裂。'),
    );
    if (total < 5) {
      startFall(s, h, r);
      const outcome = s.queue.at(-1);
      outcome.text =
        '速度 ' +
        total +
        ' / 5，楼板断裂。' +
        (outcome.text || '选择地下室落点。');
    } else
      announce(
        s,
        '避开了坍塌',
        '速度检定通过。此房间之后无需重复检定，可选择主动跳下。',
        'check',
        { heroId: h.id, dice, total, threshold: 5, success: true },
      );
  }
  if (
    roomView.special === 'stairsDown' &&
    !s.links.some((link) => link.includes(r.id) && link.includes('basement'))
  ) {
    s.basementUnlocked = true;
    addMapLink(s, r.id, 'basement');
    log(s, '发现地下阶梯！地下室现在与一楼连通。');
    announce(
      s,
      '地下室的入口',
      '你听见台阶深处传来水滴声。这个房间与地下室平台永久连通，可用1点移动力上下楼。',
      'floor',
      { heroId: h.id },
    );
  }
  if (TRAIT_KEYS.includes(roomView.special) && !r.roomBonus.includes(h.id)) {
    r.roomBonus.push(h.id);
    const change = changeTrait(s, h, roomView.special, 1, roomEvent);
    announce(
      s,
      '房间的馈赠',
      r.name + '令你有所领悟。' + change + '。每名探险者在此房间仅触发一次。',
      'trait',
      { heroId: h.id },
    );
  }
  if (!entry.skipAfter)
    fireRuleTiming(
      s,
      { ...roomEvent, when: 'AfterRoomEnter', cancelled: undefined },
      entry.report,
      beforeEntry.usage,
    );
  return true;
}
function discover(s, h, dir) {
  const origin = roomAt(s, h.pos);
  if (!doorsOf(origin).includes(dir)) return;
  const x = origin.x + DIRS[dir].dx,
    y = origin.y + DIRS[dir].dy;
  if (tileAt(s, origin.floor, x, y)) return;
  const deck = [...s.decks.rooms]; // A buried stair tile becomes eligible early enough for this three-floor demo.
  if (
    origin.floor === 0 &&
    !s.basementUnlocked &&
    s.rooms.filter((r) => !r.starter && r.floor === 0).length >= 3 &&
    deck.includes('stairs-down')
  ) {
    deck.splice(deck.indexOf('stairs-down'), 1);
    deck.unshift('stairs-down');
  }
  let chosen, options;
  for (const id of deck) {
    const tile = ROOM_DECK.find((r) => r.id === id);
    options = placementOptions(s, h.pos, dir, tile);
    if (options.length) {
      chosen = tile;
      break;
    }
  }
  if (!chosen) {
    announce(
      s,
      '这条路无法延伸',
      '牌堆中没有适合当前楼层且入口能接上的房间。请选择别的门，或去另一层探索。',
    );
    return;
  }
  s.decks.rooms.splice(s.decks.rooms.indexOf(chosen.id), 1);
  enqueue(s, {
    kind: 'placement',
    title: '你推开门，发现……',
    tileId: chosen.id,
    from: h.pos,
    dir,
    x,
    y,
    floor: origin.floor,
    rotation: options[0].rotation,
    options,
    heroId: h.id,
  });
  log(s, `抽到房间「${chosen.name}」，等待旋转与拼接。`);
}
function fireHauntStarted(s) {
  const event = {
    when: 'HauntStarted',
    rootActionId: `haunt:${s.scenario}`,
    causeId: `haunt:${s.scenario}`,
    scenario: s.scenario,
    heroId: s.active,
  };
  const notice = [...s.queue].reverse().find((entry) => entry.kind === 'haunt');
  if (s.executionMode === GAME_EXECUTION_MODES.workflow) {
    startStandaloneTiming(s, event, { noticeUid: notice?.uid });
    return;
  }
  const result = fireRuleTiming(s, event);
  if (notice) notice.triggers = result.executed;
}
export function triggerHaunt(s) {
  if (s.phase !== 'explore') return;
  if (s.automaticHaunt) {
    s.scenario = chooseHaunt(s.hauntContext?.omenId, s.hauntContext?.room);
    log(
      s,
      '组合揭示：' +
        (s.hauntContext?.omenTitle || '未知预兆') +
        ' × ' +
        (s.hauntContext?.room?.name || '宅邸') +
        '。',
    );
  }
  s.phase = 'haunt';
  s.elapsed = 0;
  const sc = SCENARIOS.find((c) => c.id === s.scenario);
  scenarioRules(s.scenario).setup(s, sc, {
    shuffle,
    pathTo,
    ENTRANCE,
    roomAt,
    random,
    ensureActive,
    log,
    announce,
    FLOORS,
    living,
    turnWolf,
    WOLF_RULES,
  });
  fireHauntStarted(s);
}

function startCardGainWorkflow(state, cardRequest) {
  const s = structuredClone(state);
  if (
    pending(s)?.uid !== cardRequest.uid ||
    !['item', 'omen'].includes(cardRequest.cardType)
  )
    return s;
  s.queue.shift();
  const flow = createCardGainWorkflow({
    flowId: `card-gain:${cardRequest.uid}:${++s.serial}`,
    cardRequest,
  });
  continueWorkflow(s, flow);
  check(s);
  return s;
}

function cardGainEvent(s, flow, when) {
  const request = flow.locals.cardRequest,
    hero = s.heroes[request.heroId],
    card = hero && cardDefinition(s, request.cardType, request.cardId, hero.id);
  if (!hero || !card) return null;
  const key = when === 'BeforeCardGain' ? 'gainEvent' : 'afterGainEvent';
  return (flow.locals[key] ||= {
    when,
    rootActionId: flow.flowId,
    causeId: flow.flowId,
    heroId: hero.id,
    cardType: request.cardType,
    cardId: card.id,
    sourceCardId: card.id,
    sourceRoomId: hero.pos,
    ...(when === 'BeforeCardGain' ? { cancelled: false } : {}),
    ...(when === 'AfterCardGain' && flow.locals.itemInstanceId
      ? { itemInstanceId: flow.locals.itemInstanceId }
      : {}),
  });
}

function runCardGainTiming(s, flow, when) {
  if (flow.definitionId !== CARD_GAIN_WORKFLOW)
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  const event = cardGainEvent(s, flow, when);
  if (!event || (when === 'AfterCardGain' && flow.locals.gainCancelled)) return;
  const triggered = fireRuleTiming(
    s,
    event,
    undefined,
    flow.locals.triggerUsage || [],
    { allowPause: true },
  );
  flow.locals.triggerUsage = triggered.usage;
  flow.locals.triggerReceipts ||= [];
  flow.locals.triggerReceipts.push(...triggered.executed);
  if (when === 'AfterCardGain' && flow.locals.cardNoticeUid) {
    const notice = s.queue.find(
      (entry) => entry.uid === flow.locals.cardNoticeUid,
    );
    if (notice) {
      notice.triggers ||= [];
      notice.triggers.push(...triggered.executed);
    }
  }
  if (!triggered.paused) return;
  const nextStep = flow.step + 1;
  flow.step = nextStep;
  attachReactionResume(s, triggered.paused, {
    kind: 'workflow',
    flow,
    event,
    remainingTriggers: triggered.remainingTriggers,
    usage: triggered.usage,
  });
  return { suspend: true, nextStep };
}

function commitCardGainWorkflow(s, flow) {
  if (flow.definitionId !== CARD_GAIN_WORKFLOW)
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  const request = flow.locals.cardRequest;
  resolveCard(s, request, {
    gainEvent: flow.locals.gainEvent,
    triggerUsage: flow.locals.triggerUsage,
    triggerReceipts: flow.locals.triggerReceipts,
    skipBefore: true,
    skipAfter: true,
  });
  const notice = [...s.queue]
    .reverse()
    .find(
      (entry) =>
        entry.kind === 'cardResult' &&
        entry.cardType === request.cardType &&
        entry.heroId === request.heroId,
    );
  flow.locals.gainCancelled = !!flow.locals.gainEvent?.cancelled;
  flow.locals.cardNoticeUid = notice?.uid;
  flow.locals.itemInstanceId = notice?.itemInstanceId;
}

function resolveCard(s, p, entry = {}) {
  const h = s.heroes[p.heroId],
    c = cardDefinition(s, p.cardType, p.cardId, h.id),
    visibility = p.cardType === 'event' ? 'public' : heroVisibility(s, h);
  if (p.cardType === 'event') {
    const dice = c.trait
        ? roll(
            s,
            modifierValue(
              s,
              'check.dice',
              { heroId: h.id, checkKind: 'event', trait: c.trait },
              traitValue(h, c.trait, s),
            ),
            {
              heroId: h.id,
              label: h.name + ' · ' + traitRuleView(s, h, c.trait).label,
            },
          )
        : null,
      total = dice?.reduce((a, b) => a + b, 0),
      success = !c.trait || total >= c.threshold,
      effect = c.effect || (success ? c.success : c.failure);
    const result = {
      kind: 'cardResult',
      heroId: h.id,
      title: c.title,
      text: effect.text,
      cardType: 'event',
      dice,
      total,
      threshold: c.threshold,
      success,
      changes: [],
    };
    enqueue(s, result);
    const msg = s.queue.at(-1);
    const change = applyEffect(s, h, effect);
    msg.changes = [change];
    log(s, `${h.name}：${c.title}。${effect.text}`);
  } else if (p.cardType === 'item') {
    const gainEvent = entry.gainEvent || {
        when: 'BeforeCardGain',
        rootActionId: `card:${p.uid}`,
        causeId: `card:${p.uid}`,
        heroId: h.id,
        cardType: p.cardType,
        cardId: c.id,
        sourceCardId: c.id,
        sourceRoomId: h.pos,
        cancelled: false,
      },
      beforeGain = entry.skipBefore
        ? {
            executed: entry.triggerReceipts || [],
            usage: entry.triggerUsage || [],
          }
        : fireRuleTiming(s, gainEvent);
    if (gainEvent.cancelled) {
      s.discards.item.push(c.id);
      announce(s, c.title, '这张物品牌的获得效果被取消。', 'cardResult', {
        cardType: 'item',
        heroId: h.id,
        visibility,
        triggers: beforeGain.executed,
      });
      return;
    }
    s.itemSerial = (s.itemSerial || 0) + 1;
    const instance = addItemInstance(h, c.id, `item-${s.itemSerial}`);
    recordEvent(
      s,
      'CardGained',
      {
        heroId: h.id,
        cardType: 'item',
        cardId: c.id,
        itemInstanceId: instance.instanceId,
        sourceRoomId: h.pos,
      },
      visibility,
    );
    announce(
      s,
      c.title,
      '已放入' + h.name + '的随身物品。' + c.effect,
      'cardResult',
      {
        cardType: 'item',
        heroId: h.id,
        itemInstanceId: instance.instanceId,
        visibility,
      },
    );
    const cardNotice = s.queue.at(-1),
      afterGain = entry.skipAfter
        ? { executed: [], usage: beforeGain.usage }
        : fireRuleTiming(
            s,
            {
              ...gainEvent,
              when: 'AfterCardGain',
              cancelled: undefined,
              itemInstanceId: instance.instanceId,
            },
            undefined,
            beforeGain.usage,
          );
    cardNotice.triggers = [...beforeGain.executed, ...afterGain.executed];
    log(s, h.name + '获得物品「' + c.title + '」。', visibility);
  } else {
    const gainEvent = entry.gainEvent || {
        when: 'BeforeCardGain',
        rootActionId: `card:${p.uid}`,
        causeId: `card:${p.uid}`,
        heroId: h.id,
        cardType: p.cardType,
        cardId: c.id,
        sourceCardId: c.id,
        sourceRoomId: h.pos,
        cancelled: false,
      },
      beforeGain = entry.skipBefore
        ? {
            executed: entry.triggerReceipts || [],
            usage: entry.triggerUsage || [],
          }
        : fireRuleTiming(s, gainEvent);
    if (gainEvent.cancelled) {
      s.discards.omen.push(c.id);
      announce(s, c.title, '这张预兆牌的获得效果被取消。', 'cardResult', {
        cardType: 'omen',
        heroId: h.id,
        visibility,
        triggers: beforeGain.executed,
      });
      return;
    }
    if (s.phase === 'explore')
      s.hauntContext = {
        omenId: c.id,
        omenTitle: c.title,
        room: structuredClone(roomAt(s, h.pos)),
        heroId: h.id,
      };
    h.omens.push(c.id);
    s.omens++;
    recordEvent(
      s,
      'CardGained',
      {
        heroId: h.id,
        cardType: 'omen',
        cardId: c.id,
        sourceRoomId: h.pos,
      },
      visibility,
    );
    const change = c.trait
      ? changeTrait(s, h, c.trait, c.delta, { visibility })
      : '';
    announce(s, c.title, c.effect, 'cardResult', {
      cardType: 'omen',
      heroId: h.id,
      changes: [change],
      visibility,
    });
    const cardNotice = s.queue.at(-1),
      afterGain = entry.skipAfter
        ? { executed: [], usage: beforeGain.usage }
        : fireRuleTiming(
            s,
            { ...gainEvent, when: 'AfterCardGain', cancelled: undefined },
            undefined,
            beforeGain.usage,
          );
    cardNotice.triggers = [...beforeGain.executed, ...afterGain.executed];
    log(
      s,
      h.name + '获得预兆「' + c.title + '」，全队累计 ' + s.omens + ' 张。',
      visibility,
    );
    if (c.hauntRoll && s.omens * 2 < 5) {
      const hint = `已自动跳过作祟检定：${s.omens} 枚骰子最高 ${s.omens * 2} 点，达不到 5 点。`;
      s.queue.at(-1).skipHint = hint;
      log(s, hint);
    } else if (c.hauntRoll)
      announce(
        s,
        '作祟检定',
        `已发现 ${s.omens} 张预兆，投掷 ${s.omens} 枚骰子。总点数达到5，作祟就会开始。`,
        'hauntRoll',
        { diceCount: s.omens, heroId: h.id },
      );
  }
}
// Arrival effects wait behind damage allocation and disappear if the explorer dies.
function finishArrival(s) {
  const p = pending(s);
  if (p?.kind !== 'roomArrival' || s.phase === 'over') return;
  s.queue.shift();
  const h = s.heroes[p.heroId],
    destination = roomAt(s, p.roomId);
  if (!h.dead && destination)
    startRoomEntryWorkflow(s, {
      heroId: h.id,
      toRoomId: destination.id,
      rootActionId: `room-arrival:${p.uid}`,
      fromRoomId: p.fromRoomId,
      enterKind: p.enterKind || 'fall',
      discovered: !!p.discovered,
      drawCard: true,
    });
}
function advance(s) {
  const p = s.queue.shift();
  if (!p) return;
  if (p.kind === 'roomFall') {
    const h = s.heroes[p.heroId];
    const participants = (p.passengerIds || [p.heroId])
      .map((id) => s.heroes[id])
      .filter((hero) => !hero.dead);
    const results = participants.map((hero) => ({
      hero,
      dice: roll(s, 1, { heroId: hero.id, label: hero.name + ' · ' + p.title }),
    }));
    const text = results
      .map(({ hero, dice }) => hero.name + '受到 ' + dice[0] + ' 点肉体伤害。')
      .join('');
    announce(s, p.title + '结果', text, 'check', { heroId: h.id });
    for (const { hero, dice } of results) {
      log(s, hero.name + '的' + p.title + '：' + dice[0] + ' 点肉体伤害。');
      damage(s, hero, 'physical', dice[0], {
        sourceKind: 'room',
        sourceRoomId: p.roomId,
        causeTag: 'fall',
      });
    }
    if (p.roomId && p.discovered)
      enqueue(s, {
        kind: 'roomArrival',
        heroId: h.id,
        roomId: p.roomId,
        enterKind: 'fall',
        discovered: true,
      });
  } else if (p.kind === 'card') resolveCard(s, p);
  else if (p.kind === 'hauntRoll') {
    const dice = roll(s, s.omens, { heroId: s.active, label: '作祟检定' }),
      total = dice.reduce((a, b) => a + b, 0);
    announce(
      s,
      total >= 5 || s.omens >= OMENS.length ? '有东西醒来了' : '宅邸暂时沉寂',
      total >= 5 || s.omens >= OMENS.length
        ? total >= 5
          ? '总点数达到5，作祟即将降临。'
          : '最后一张预兆已揭示，作祟必然降临。'
        : '总点数不足5，继续探索。下一张预兆会让检定多投1枚骰子。',
      'hauntResult',
      {
        heroId: p.heroId,
        dice,
        total,
        threshold: 5,
        triggers: total >= 5 || s.omens >= OMENS.length,
      },
    );
    log(
      s,
      `作祟检定 ${total} / 5：${total >= 5 || s.omens >= OMENS.length ? '即将进入作祟' : '尚未触发'}。`,
    );
  } else if (p.kind === 'hauntResult' && p.triggers) triggerHaunt(s);
  check(s);
  finishArrival(s);
}
export function actions(s) {
  const h = s.heroes[s.active],
    none = {
      move: [],
      explore: [],
      stairs: [],
      attack: [],
      interact: false,
      rest: false,
      abilities: [],
      itemAbilities: [],
    };
  if (!h || h.dead || h.traitor || h.ended || s.phase === 'over' || pending(s))
    return none;
  const baseRoom = roomAt(s, h.pos),
    r = roomRuleView(s, baseRoom, h.id),
    canMove = !h.stopped && h.moves > 0;
  const cost = Math.max(
    1,
    1 + (s.enemies.some((e) => e.pos === h.pos) ? 1 : 0) + r.moveCostDelta,
  );
  const abilities = contentActions(s, {
    hero: h,
    room: r,
    canMove,
    moveCost: cost,
  });
  const itemAbilities = itemActionViews(s, h, TRAITS).filter(
      (action) => action.available,
    ),
    itemManagementAbilities = itemManagementActionViews(s, h);
  const adjacent = connections(s, h.pos);
  return {
    move:
      canMove && h.moves >= cost
        ? adjacent.filter((id) => roomAt(s, id).floor === r.floor)
        : [],
    stairs:
      canMove && h.moves >= cost
        ? adjacent.filter((id) => roomAt(s, id).floor !== r.floor)
        : [],
    explore:
      canMove && h.moves >= cost
        ? frontiers(s, r.floor).filter((f) => f.from === h.pos)
        : [],
    attack: abilities
      .filter((action) => action.handler === 'combat.hero.attack')
      .map((action) => action.targetId),
    interact: abilities.some((action) => action.command?.type === 'interact'),
    rest: abilities.some((action) => action.handler === 'hero.rest'),
    abilities,
    itemAbilities: [...itemAbilities, ...itemManagementAbilities],
    elevator: abilities.some((action) => action.id === 'useElevator'),
    fall: abilities.some((action) => action.id === 'jumpDown'),
    // Basement escape adaptation: a permanent stair can be discovered from below too.
    returnStairs: abilities.some((action) => action.id === 'findReturnStairs'),
    moveCost: cost,
  };
}
export function factionActions(s, heroId) {
  return contentFactionActions(s, { heroId });
}

const CORE_COMMAND_TYPES = new Set([
  'select',
  'endHero',
  'endRound',
  'explore',
  'move',
  'rotate',
  'place',
  'advance',
  'continueCard',
  'continueRoom',
  'roomDestination',
  'stayElevator',
  'allocate',
  'allocateDamage',
  'rollDice',
  'rollAll',
  'resolveDice',
  'resolveChoice',
  'viewFloor',
  'timeoutChoice',
]);

export function supportsCommand(s, command) {
  if (!command?.type) return false;
  if (CORE_COMMAND_TYPES.has(command.type)) return true;
  const legal = actions(s);
  if (
    findAction(command, [...legal.abilities, ...legal.itemAbilities]) ||
    findAction(command, factionActions(s, command.heroId))
  )
    return true;
  return false;
}

export function commandHeroId(s, command) {
  const factionAction = findAction(command, factionActions(s, command?.heroId));
  if (factionAction?.sourceHeroId !== undefined)
    return factionAction.sourceHeroId;
  if (command?.type === 'select') return command.id;
  return pending(s)?.heroId ?? s.active;
}
function endRound(s) {
  living(s).forEach((hero) => {
    if (!hero.ended) finishHeroTurn(s, hero);
  });
  fireRuleTiming(s, {
    when: 'RoundEnding',
    rootActionId: `round:${s.round}`,
    causeId: `round:${s.round}`,
    round: s.round,
    heroId: s.active,
  });
  if (s.phase === 'haunt') {
    living(s).forEach((h) => {
      h.ended = true;
      h.moves = 0;
    });
    s.elapsed++;
    const report = [];
    if (s.scenario === 'werewolf') {
      fireRuleTiming(
        s,
        { when: 'RoundStatusTick', causeId: `round:${s.round}` },
        report,
      );
      check(s);
      finishArrival(s);
      if (s.phase === 'over') return;
    }
    for (const e of s.enemies) {
      if (e.bornAt === s.elapsed) continue;
      fireRuleTiming(
        s,
        {
          when: 'EnemyTurnStarting',
          enemyId: e.id,
          causeId: `round:${s.round}:enemy:${e.id}`,
        },
        report,
      );
      const target =
        living(s).find((h) => h.id === e.huntTarget) ||
        living(s).sort(
          (a, b) =>
            graphDistance(s, e.pos, a.pos, { monster: true }) -
            graphDistance(s, e.pos, b.pos, { monster: true }),
        )[0];
      if (!target) break;
      const path = pathTo(s, e.pos, target.pos, { monster: true });
      const route = path.length ? path.slice(0, e.speed + 1) : [e.pos];
      if (path.length > 1) {
        const fromRoomId = e.pos;
        e.pos = path[Math.min(e.speed, path.length - 1)];
        const explorer = enemyExplorer(s, e);
        if (explorer) explorer.pos = e.pos;
        recordEvent(s, 'EntityMoved', {
          entityType: 'enemy',
          entityId: e.id,
          fromRoomId,
          toRoomId: e.pos,
          path: route,
          moveKind: 'hunt',
        });
        report.push(e.name + '移动到' + roomAt(s, e.pos).name + '。');
      }
      if (e.pos === target.pos) {
        const victims = [
          target,
          ...living(s).filter((h) => h.id !== target.id && h.pos === e.pos),
        ].slice(0, e.kind === 'alpha' && s.count >= 5 ? 2 : 1);
        for (const target of victims) {
          const attack = roll(s, wolfMight(s, e), {
              ...enemyDiceMeta(s, e),
              roomId: e.pos,
              targetId: target.id,
              label:
                e.name + ' → ' + target.name + ' · ' + roomAt(s, e.pos).name,
            }),
            defense = roll(
              s,
              modifierValue(
                s,
                'check.dice',
                { heroId: target.id, checkKind: 'defense', trait: 'might' },
                traitValue(target, 'might', s),
              ),
              { heroId: target.id, label: target.name + ' · 防御' },
            ),
            a = attack.reduce((a, b) => a + b, 0),
            d = defense.reduce((a, b) => a + b, 0),
            amount = Math.min(3, Math.max(0, a - d));
          report.push(
            `${e.name}攻击${target.name}：${a} 对 ${d}，${amount ? amount + '点肉体伤害' : '挡住了攻击'}。`,
          );
          damage(s, target, 'physical', amount, {
            rootActionId: `enemy-turn:${s.round}:${e.id}`,
            sourceKind: 'enemy',
            sourceEnemyId: e.id,
            causeTag: 'attack',
            report,
          });
          if (
            amount &&
            ['alpha', 'wolf'].includes(e.kind) &&
            applyWerewolfInfection(s, target, {
              rootActionId: `enemy-turn:${s.round}:${e.id}`,
              causeId: `enemy-turn:${s.round}:${e.id}:${target.id}:infection`,
              sourceKind: 'enemy',
              sourceEnemyId: e.id,
            })
          )
            report.push(
              target.name +
                '感染狼毒：还有3个行动轮治疗，重复咬伤不会缩短时间。',
            );
        }
      }
    }
    scenarioRules(s.scenario).afterEnemies?.(s, report);
    report.forEach((t) => log(s, t));
    announce(
      s,
      '黑暗中的动静',
      report.join('\n') || '暂时没有敌人靠近，但宅邸的倒计时仍在推进。',
      'enemyTurn',
      {
        remaining: s.limit - s.elapsed,
      },
    );
    if (s.elapsed >= s.limit) {
      end(s, false, scenarioRules(s.scenario).timeoutReason);
      return;
    }
    // Damage choices and reports still belong to this round. Refresh only when
    // the entire queue is settled, so the next movement budget uses final stats.
    s.roundEnding = true;
    return;
  }
  startNextRound(s);
}
function startNextRound(s) {
  if (s.executionMode === GAME_EXECUTION_MODES.workflow) {
    delete s.roundEnding;
    const flow = createRoundStartWorkflow({
      flowId: `round-start:${s.round + 1}:${++s.serial}`,
      previousRound: s.round,
    });
    continueWorkflow(s, flow);
    return;
  }
  delete s.roundEnding;
  s.round++;
  living(s).forEach((h) => resetHero(h, s));
  s.active = living(s)[0]?.id ?? s.active;
  ensureActive(s);
  s.viewFloor = roomAt(s, s.heroes[s.active].pos).floor;
  log(s, '第 ' + s.round + ' 回合开始，移动力按各自速度恢复。');
  announce(
    s,
    '第 ' + s.round + ' 回合开始',
    '全队移动力已恢复。' + s.heroes[s.active].name + '先行动。',
    'roundStart',
    { round: s.round },
  );
  fireRuleTiming(s, {
    when: 'RoundStarting',
    rootActionId: `round:${s.round}`,
    causeId: `round:${s.round}`,
    round: s.round,
    heroId: s.active,
  });
  startHeroTurn(s, s.heroes[s.active]);
  check(s);
  finishArrival(s);
}

function commitRoundStartWorkflow(s, flow) {
  if (flow.definitionId !== ROUND_START_WORKFLOW)
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  const lifecycle = flow.locals.lifecycle;
  if (s.round !== lifecycle.previousRound)
    throw new Error('Round start no longer matches the authoritative round');
  s.round++;
  living(s).forEach((hero) => resetHero(hero, s));
  s.active = living(s)[0]?.id ?? s.active;
  ensureActive(s);
  s.viewFloor = roomAt(s, s.heroes[s.active].pos).floor;
  log(s, '第 ' + s.round + ' 回合开始，移动力按各自速度恢复。');
  announce(
    s,
    '第 ' + s.round + ' 回合开始',
    '全队移动力已恢复。' + s.heroes[s.active].name + '先行动。',
    'roundStart',
    { round: s.round },
  );
  lifecycle.lifecycleEvent = {
    when: 'RoundStarting',
    rootActionId: `round:${s.round}`,
    causeId: `round:${s.round}`,
    round: s.round,
    heroId: s.active,
  };
}

function runRoundStartTiming(s, flow) {
  if (flow.definitionId !== ROUND_START_WORKFLOW)
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  return runWorkflowTiming(s, flow, flow.locals.lifecycle.lifecycleEvent);
}

function startRoundHeroWorkflow(s, flow) {
  if (flow.definitionId !== ROUND_START_WORKFLOW)
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  startHeroTurn(s, s.heroes[s.active]);
  check(s);
  finishArrival(s);
}

function runStandaloneTurnStartTiming(s, flow) {
  if (flow.definitionId !== TURN_START_WORKFLOW)
    throw new Error(`Unsupported workflow definition: ${flow.definitionId}`);
  return runWorkflowTiming(s, flow, flow.locals.lifecycleEvent);
}
function applyAction(state, a) {
  const s = structuredClone(state);
  if (s.phase === 'over') return s;
  if (a.type === 'viewFloor' && FLOORS.some((f) => f.id === a.floor)) {
    s.viewFloor = a.floor;
    return s;
  }
  const p = pending(s);
  if (
    !p &&
    executeAction(s, a, factionActions(s, a.heroId), RULE_ACTION_HANDLERS)
  )
    return s;
  if (p) {
    if (p.kind === 'placement') {
      if (a.type === 'stayElevator' && p.mode === 'elevator' && p.total === 4) {
        s.queue.shift();
        s.viewFloor = roomAt(s, p.tileId).floor;
        log(s, '神秘电梯选择当前楼层，保持原位置和朝向。');
        return s;
      }
      if (a.type === 'roomDestination' && p.destinations) {
        const chosen = p.destinations.find(
          (d) => d.from === a.from && d.dir === a.dir,
        );
        if (!chosen) return s;
        const options = roomPlacementOptions(p.destinations, chosen);
        Object.assign(p, chosen, { options }, options[0]);
        s.viewFloor = chosen.floor;
        return s;
      }
      if (a.type === 'rotate') {
        if (p.destinations) p.options = roomPlacementOptions(p.destinations, p);
        const i = p.options.findIndex((o) => o.rotation === p.rotation);
        const next = p.options[(i + 1) % p.options.length];
        p.rotation = next.rotation;
        if (p.destinations)
          Object.assign(p, { from: next.from, dir: next.dir });
        return s;
      }
      if (a.type === 'place') {
        // Older pending placements must not bypass the same-floor restriction.
        if (
          p.mode === 'elevator' &&
          p.total !== 4 &&
          p.floor === roomAt(s, p.tileId).floor
        ) {
          s.queue.shift();
          s.viewFloor = p.floor;
          log(s, '神秘电梯在当前楼层原位停靠，位置与朝向保持不变。');
          if (p.elevatorCrash)
            enqueue(s, {
              kind: 'roomFall',
              heroId: p.heroId,
              title: '电梯冲击',
              text: '室内每名探险者各掷 1 枚骰决定肉体伤害。',
              passengerIds: living(s)
                .filter((hero) => hero.pos === p.tileId)
                .map((hero) => hero.id),
            });
          return s;
        }
        const tile = ROOM_DECK.find((t) => t.id === p.tileId),
          valid = placementOptions(
            p.mode === 'elevator'
              ? { ...s, rooms: s.rooms.filter((r) => r.id !== p.tileId) }
              : s,
            p.from,
            p.dir,
            tile,
          );
        if (!valid.some((o) => o.rotation === p.rotation)) return s;
        const h = s.heroes[p.heroId];
        if (p.mode === 'elevator') {
          const r = roomAt(s, p.tileId);
          const before =
            FLOORS.find((f) => f.id === r.floor).name +
            '（' +
            r.x +
            ',' +
            r.y +
            '）';
          const relocation = executeRuleEffects(s, [
            {
              op: 'map.relocateRoom',
              params: {
                roomId: r.id,
                destination: {
                  floor: p.floor,
                  x: p.x,
                  y: p.y,
                  rotation: p.rotation,
                  fromRoomId: p.from,
                  direction: p.dir,
                },
                moveKind: 'elevator',
              },
            },
          ]);
          if (!relocation.executed.length) return s;
          s.queue.shift();
          s.viewFloor = r.floor;
          s.roomMotion = { uid: ++s.serial, roomId: r.id, kind: 'elevator' };
          log(
            s,
            '神秘电梯从' +
              before +
              '移至' +
              FLOORS.find((f) => f.id === r.floor).name +
              '「' +
              roomAt(s, p.from).name +
              '」旁；室内乘员与标记一同抵达。',
          );
          if (p.elevatorCrash)
            enqueue(s, {
              kind: 'roomFall',
              heroId: h.id,
              title: '电梯冲击',
              text: '室内每名探险者各掷 1 枚骰决定肉体伤害。',
              passengerIds: living(s)
                .filter((hero) => hero.pos === r.id)
                .map((hero) => hero.id),
            });
          return s;
        }
        s.queue.shift();
        const r = {
          ...structuredClone(tile),
          id: tile.id,
          floor: p.floor,
          x: p.x,
          y: p.y,
          rotation: p.rotation,
          starter: false,
          target: null,
          done: false,
          attempts: 0,
          roomBonus: [],
        };
        s.rooms.push(r);
        if (p.mode === 'collapse') {
          fallIntoRoom(s, h, roomAt(s, p.sourceId), r, true);
          return s;
        }
        h.moves = Math.max(
          0,
          h.moves - (1 + (s.enemies.some((e) => e.pos === h.pos) ? 1 : 0)),
        );
        h.pos = r.id;
        s.viewFloor = r.floor;
        log(
          s,
          `${h.name}将「${r.name}」旋转${r.rotation * 90}°后接入${FLOORS.find((f) => f.id === r.floor).name}。`,
        );
        startRoomEntryWorkflow(s, {
          heroId: h.id,
          toRoomId: r.id,
          rootActionId: `discover:${p.uid}`,
          fromRoomId: p.from,
          enterKind: 'discover',
          discovered: true,
          collapseDice: a.collapseDice,
          drawCard: true,
        });
        return s;
      }
      return s;
    }
    if (p.kind === 'damage') {
      const keys =
        p.traits ||
        (p.damageType === 'physical'
          ? ['might', 'speed']
          : ['sanity', 'knowledge']);
      if (a.type === 'allocateDamage') {
        if (
          !a.allocation ||
          Object.keys(a.allocation).some((k) => !keys.includes(k)) ||
          keys.some(
            (k) => !Number.isInteger(a.allocation[k]) || a.allocation[k] < 0,
          ) ||
          keys.reduce((n, k) => n + a.allocation[k], 0) !== p.remaining
        )
          return s;
        startDamageSettlementWorkflow(s, p, a.allocation, false);
        return s;
      }
      if (a.type !== 'allocate') return s;
      if (!keys.includes(a.trait)) return s;
      startDamageSettlementWorkflow(
        s,
        p,
        Object.fromEntries(keys.map((key) => [key, key === a.trait ? 1 : 0])),
        true,
      );
      return s;
    }
    if (a.type === 'advance') advance(s);
    return s;
  }
  if (a.type === 'select') {
    const h = s.heroes[a.id];
    if (h && !h.dead && !h.traitor) {
      s.active = h.id;
      s.viewFloor = roomAt(s, h.pos).floor;
      startHeroTurn(s, h);
    }
    return s;
  }
  if (a.type === 'endRound') {
    endRound(s);
    return s;
  }
  const h = s.heroes[s.active];
  if (!h || h.dead || h.traitor || h.ended) return s;
  const r = roomAt(s, h.pos),
    legal = actions(s);
  if (
    executeAction(
      s,
      a,
      [...legal.abilities, ...legal.itemAbilities],
      RULE_ACTION_HANDLERS,
      {
        hero: h,
        room: r,
        moveCost: legal.moveCost,
      },
    )
  )
    return s;
  if (a.type === 'endHero') {
    finishHeroTurn(s, h);
    h.ended = true;
    h.moves = 0;
    const next = living(s).find((n) => !n.ended);
    if (next) {
      s.active = next.id;
      s.viewFloor = roomAt(s, next.pos).floor;
      startHeroTurn(s, next);
      log(s, h.name + '结束行动，轮到' + next.name + '。');
    } else endRound(s);
    return s;
  }
  if (
    a.type === 'explore' &&
    legal.explore.some(
      (f) =>
        f.dir === a.dir &&
        ['from', 'floor', 'x', 'y'].every(
          (key) => a[key] === undefined || a[key] === f[key],
        ),
    )
  ) {
    discover(s, h, a.dir);
    return s;
  }
  if (a.type === 'move' && [...legal.move, ...legal.stairs].includes(a.pos)) {
    const fromRoomId = h.pos,
      destination = roomAt(s, a.pos);
    h.moves -= legal.moveCost;
    h.pos = a.pos;
    recordEvent(s, 'EntityMoved', {
      entityType: 'hero',
      entityId: h.id,
      fromRoomId,
      toRoomId: destination.id,
      path: [fromRoomId, destination.id],
      moveKind:
        roomAt(s, fromRoomId).floor === destination.floor ? 'walk' : 'stairs',
    });
    s.viewFloor = destination.floor;
    log(
      s,
      `${h.name}进入${FLOORS.find((f) => f.id === s.viewFloor).name} · ${roomRuleView(s, roomAt(s, h.pos), h.id).name}，移动力剩余${h.moves}。`,
    );
    enterRoom(s, h, destination, {
      fromRoomId,
      enterKind:
        roomAt(s, fromRoomId).floor === destination.floor ? 'walk' : 'stairs',
      collapseDice: a.collapseDice,
    });
    return s;
  }
  return s;
}

export function act(state, a) {
  if (
    ['endHero', 'endRound'].includes(a.type) &&
    ((a.round !== undefined && a.round !== state.round) ||
      (a.type === 'endHero' &&
        a.actorId !== undefined &&
        a.actorId !== state.active))
  )
    return state;
  const result = applyInteractiveAction(state, a);
  if (result.roundEnding && !pending(result) && result.phase !== 'over') {
    const next = structuredClone(result);
    startNextRound(next);
    return next;
  }
  return result;
}
function applyInteractiveAction(state, a) {
  if (a.type === 'continueRoom') {
    const p = pending(state);
    if (p?.kind !== 'roomFall' || p.uid !== a.requestId) return state;
    const next = act(state, { type: 'advance' });
    return pending(next)?.kind === 'diceRequest' &&
      (p.passengerIds?.length || 1) === 1
      ? act(next, { type: 'rollAll' })
      : next;
  }
  if (
    ['allocateDamage', 'allocate'].includes(a.type) &&
    a.requestId !== undefined &&
    (pending(state)?.kind !== 'damage' || pending(state).uid !== a.requestId)
  )
    return state;
  if (a.type === 'continueCard') {
    const card = pending(state);
    if (
      state.phase === 'over' ||
      card?.kind !== 'card' ||
      card.uid !== a.requestId
    )
      return state;
    const definition = cardDefinition(
      state,
      card.cardType,
      card.cardId,
      card.heroId,
    );
    if (card.cardType === 'event' && definition.trait) {
      const next = startEventWorkflow(state, card);
      return pending(next)?.kind === 'diceRequest'
        ? act(next, { type: 'rollAll' })
        : next;
    }
    const next = act(state, { type: 'advance' });
    // The card button starts its own check; the dice presentation still plays in full.
    if (pending(next)?.kind === 'diceRequest')
      return act(next, { type: 'rollAll' });
    const result = pending(next);
    if (
      result?.kind === 'cardResult' &&
      !(card.cardType === 'event' && definition.trait)
    ) {
      const continued = act(next, { type: 'advance' });
      continued.cardNotice = { ...result, heroId: card.heroId };
      return continued;
    }
    return next;
  }
  if (
    a.type === 'resolveDice' &&
    (pending(state)?.kind !== 'diceRequest' ||
      pending(state).uid !== a.requestId)
  )
    return state;
  if (
    a.type === 'resolveChoice' &&
    (pending(state)?.kind !== 'choiceRequest' ||
      pending(state).uid !== a.requestId)
  )
    return state;
  const waiting = pending(state);
  if (waiting?.kind === 'choiceRequest') {
    if (a.type === 'viewFloor') return applyAction(state, a);
    if (
      a.type !== 'resolveChoice' ||
      !waiting.options?.some((option) => Object.is(option.value, a.choice))
    )
      return state;
    const s = structuredClone(state),
      request = pending(s),
      flow = request.workflow;
    if (!flow) return state;
    s.queue.shift();
    supplyChoice(flow, a.choice, workflowDefinitions());
    const next = continueWorkflow(s, flow);
    if (next.status === 'waiting') queueWorkflowRequest(s, next);
    check(s);
    finishArrival(s);
    return s;
  }
  if (
    state.executionMode === GAME_EXECUTION_MODES.simulation ||
    state.phase === 'over'
  )
    return applyAction(state, a);
  const current = pending(state);
  if (current?.kind === 'diceRequest') {
    const s = structuredClone(state),
      p = pending(s);
    if (a.type === 'viewFloor') return applyAction(s, a);
    if (a.type === 'rollDice' || a.type === 'rollAll') {
      const ids =
        a.type === 'rollDice'
          ? [a.sideId]
          : a.sideIds || p.rolls.filter((r) => !r.dice).map((r) => r.id);
      if (
        !Array.isArray(ids) ||
        !ids.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !p.rolls.some((r) => r.id === id && !r.dice))
      )
        return s;
      for (const r of p.rolls.filter((r) => ids.includes(r.id))) {
        r.dice = roll(s, r.count, {
          heroId: r.heroId,
          label: r.label,
          visibility: p.visibility || 'public',
        });
        r.rollEventId = s.eventSerial;
      }
      return s;
    }
    if (
      ['advance', 'resolveDice'].includes(a.type) &&
      p.rolls.every((r) => r.dice)
    ) {
      if (!p.workflow) return state;
      const receipt = { rolls: p.rolls, title: p.title, text: '' },
        flow = p.workflow;
      s.queue.shift();
      supplyRolls(
        flow,
        p.rolls.map((r) => r.dice),
        workflowDefinitions(),
      );
      const afterRoll = fireAfterRoll(s, flow, p);
      if (afterRoll.paused) {
        attachReactionResume(
          s,
          afterRoll.paused,
          {
            kind: 'afterRoll',
            flow,
            receipt,
            event: flow.locals.checkLifecycle.active
              ? flow.locals.checkLifecycle.checks[
                  flow.locals.checkLifecycle.active.checkId
                ].afterRollEvent
              : null,
            remainingTriggers: afterRoll.remainingTriggers,
            usage: afterRoll.usage,
          },
          receipt,
        );
        return s;
      }
      continueRolledWorkflow(s, flow, receipt);
      check(s);
      finishArrival(s);
      return s;
    }
    return s;
  }
  if (a.type === 'advance' && current?.kind === 'card') {
    const definition = cardDefinition(
      state,
      current.cardType,
      current.cardId,
      current.heroId,
    );
    if (['item', 'omen'].includes(current.cardType))
      return startCardGainWorkflow(state, current);
    if (current.cardType === 'event' && definition.trait)
      return startEventWorkflow(state, current);
  }
  if (a.type === 'advance' && current?.kind === 'hauntRoll')
    return startHauntRollWorkflow(state, current);
  if (a.type === 'advance' && current?.kind === 'roomFall')
    return startRoomFallWorkflow(state, current);
  if (
    a.type === 'place' &&
    current?.kind === 'placement' &&
    ROOM_DECK.find((tile) => tile.id === current.tileId)?.special === 'collapse'
  )
    return startCollapseEntryWorkflow(state, a, current);
  if (
    a.type === 'move' &&
    roomAt(state, a.pos) &&
    roomRuleView(state, roomAt(state, a.pos), state.active)?.special ===
      'collapse' &&
    !roomAt(state, a.pos)?.collapseChecked
  )
    return startExistingCollapseWorkflow(state, a);
  if (current) return applyAction(state, a);
  if (a.type === 'move') return startHeroMoveWorkflow(state, a);
  const registeredAction = findAction(a, actions(state).abilities);
  if (registeredAction?.checkSpec) return startActionCheckWorkflow(state, a);
  const workflowStarter =
    registeredAction?.workflow === 'room.elevator'
      ? startElevatorWorkflow
      : registeredAction?.workflow === 'combat.heroAttack'
        ? startHeroAttackWorkflow
        : null;
  if (workflowStarter) return workflowStarter(state, a);
  if (['endHero', 'endRound'].includes(a.type))
    return startTurnTransitionWorkflow(state, a);
  return applyAction(state, a);
}

function turnWolf(s, h, alpha) {
  const previousVisibility = heroVisibility(s, h),
    removedStatuses = structuredClone(h.statuses || []);
  h.traitor = true;
  h.faction = 'wolves';
  h.ended = true;
  h.moves = 0;
  h.statuses = [];
  for (const status of removedStatuses)
    recordEvent(
      s,
      'StatusRemoved',
      {
        heroId: h.id,
        statusId: status.id,
        statusLabel: status.label || STATUS_DEFINITIONS[status.id]?.name,
        statusInstanceId: status.instanceId,
        reason: 'factionChange',
      },
      previousVisibility,
    );
  recordEvent(s, 'FactionChanged', {
    heroId: h.id,
    fromFaction: 'heroes',
    toFaction: 'wolves',
    reason: alpha ? 'haunt' : 'infection',
  });
  const stats = wolfStats(s.count, alpha);
  s.enemies.push({
    id: 'wolf-' + h.id,
    name: alpha ? h.name + ' · 狼王' : h.name + ' · 新生狼人',
    kind: alpha ? 'alpha' : 'wolf',
    heroId: h.id,
    pos: h.pos,
    ...stats,
    maxHp: stats.hp,
    bornAt: s.elapsed,
  });
}

const RULE_TRIGGER_HANDLERS = {
  'status.remove': (s, _event, params, context) => {
    const hero = s.heroes[params.heroId],
      removed =
        hero?.statuses?.filter((status) => status.id === params.statusId) || [];
    if (!hero) return false;
    hero.statuses = (hero.statuses || []).filter(
      (status) => status.id !== params.statusId,
    );
    if (!removed.length) return false;
    for (const status of removed)
      recordEvent(
        s,
        'StatusRemoved',
        {
          heroId: hero.id,
          statusId: status.id,
          statusLabel:
            status.label || params.statusLabel || context.trigger?.sourceLabel,
          statusInstanceId: status.instanceId,
          reason: params.expired ? 'expired' : 'effect',
        },
        heroVisibility(s, hero),
      );
    if (params.expired)
      for (const status of removed) {
        const expiredEvent = {
          when: 'StatusExpired',
          rootActionId: `status-expired:${status.instanceId || status.id}:${s.round}`,
          causeId: `status-expired:${status.instanceId || status.id}:${s.round}`,
          heroId: hero.id,
          statusId: status.id,
          statusInstanceId: status.instanceId,
        };
        if (context.deferredEvents) context.deferredEvents.push(expiredEvent);
        else fireRuleTiming(s, expiredEvent);
      }
    return true;
  },
  'status.adjust': (s, _event, params, context) => {
    const hero = s.heroes[params.heroId],
      status = hero && statusOf(hero, params.statusId);
    if (!status || !Number.isFinite(status[params.field])) return false;
    const before = status[params.field];
    status[params.field] += params.delta;
    recordEvent(
      s,
      'StatusChanged',
      {
        heroId: hero.id,
        statusId: status.id,
        statusLabel:
          status.label || params.statusLabel || context.trigger?.sourceLabel,
        statusInstanceId: status.instanceId,
        field: params.field,
        before,
        after: status[params.field],
      },
      heroVisibility(s, hero),
    );
    return { before, after: status[params.field] };
  },
  'werewolf.convert': (s, _event, params, context) => {
    const hero = s.heroes[params.heroId];
    if (!hero || hero.dead || hero.traitor || !statusOf(hero, 'infection'))
      return false;
    turnWolf(s, hero, false);
    context.report?.push(hero.name + '的狼毒发作，加入狼群！');
    announce(
      s,
      '阵营转化 · ' + hero.name,
      '狼毒倒计时结束。现在属于狼群；本轮刚转化，下一轮才开始追猎。',
      'infection',
    );
    return true;
  },
  'enemy.heal': (s, _event, params, context) => {
    const enemy = s.enemies.find((entry) => entry.id === params.enemyId);
    if (!enemy || enemy.hp >= enemy.maxHp) return false;
    const amount = Math.min(params.amount, enemy.maxHp - enemy.hp);
    enemy.hp += amount;
    context.report?.push(enemy.name + '在月光中恢复' + amount + '点生命。');
    return true;
  },
};

const RULE_EFFECT_HANDLERS = {
  'effect.atomic': (s, params, context) => {
    if (
      !Array.isArray(params.effects) ||
      !params.effects.length ||
      (context.atomicDepth || 0) >= 8
    )
      return false;
    const draft = structuredClone(s),
      draftEvent = context.event && structuredClone(context.event),
      result = executeEffects(draft, params.effects, RULE_EFFECT_HANDLERS, {
        ...context,
        event: draftEvent,
        atomicDepth: (context.atomicDepth || 0) + 1,
      });
    if (result.paused || result.executed.length !== params.effects.length)
      return false;
    for (const key of Object.keys(s)) delete s[key];
    Object.assign(s, draft);
    if (context.event && draftEvent) {
      for (const key of Object.keys(context.event)) delete context.event[key];
      Object.assign(context.event, draftEvent);
    }
    return { effects: result.executed };
  },
  'reaction.request': (s, params, context) =>
    startReactionWorkflow(s, params, context),
  'trigger.chooseFirst': (_s, params, context) => {
    const remaining = context.resume?.remainingTriggers;
    if (!Array.isArray(remaining)) return false;
    const index = remaining.findIndex(
      (trigger) =>
        trigger.sourceId === params.sourceId &&
        trigger.id === params.triggerId &&
        trigger._playerOrderKey === params.orderKey,
    );
    if (index < 0) return false;
    const [selected] = remaining.splice(index, 1);
    selected._playerOrderSelected = true;
    remaining.unshift(selected);
    return { sourceId: selected.sourceId, triggerId: selected.id };
  },
  'event.cancel': (_s, _params, context) => {
    if (!context.event || !('cancelled' in context.event)) return false;
    context.event.cancelled = true;
    return { cancelled: true };
  },
  'check.adjustDice': (_s, params, context) => {
    const rolls = context.event?.rolls,
      index = params.rollIndex ?? 0,
      rollSpec = Array.isArray(rolls) && rolls[index];
    if (
      context.event?.when !== 'BeforeCheck' ||
      !rollSpec ||
      !Number.isInteger(params.delta)
    )
      return false;
    const before = rollSpec.count;
    rollSpec.count = Math.max(1, Math.min(16, before + params.delta));
    if (rollSpec.count === before) return false;
    return { rollIndex: index, before, after: rollSpec.count };
  },
  'check.reroll': (s, params, context) => {
    const resume = context.resume,
      rollIndex = params.rollIndex ?? 0,
      rollKey = resume?.event?.rollKey,
      groups = resume?.flow?.locals?.rolls?.[rollKey],
      dice = groups?.[rollIndex],
      indices = params.diceIndices;
    if (
      context.event?.when !== 'AfterRoll' ||
      resume?.kind !== 'afterRoll' ||
      !Array.isArray(dice) ||
      !Array.isArray(indices) ||
      !indices.length ||
      new Set(indices).size !== indices.length ||
      indices.some(
        (index) =>
          !Number.isInteger(index) || index < 0 || index >= dice.length,
      )
    )
      return false;
    const eventGroup = context.event.groups?.[rollIndex],
      rerolled = roll(s, indices.length, {
        heroId: eventGroup?.heroId,
        label: eventGroup?.label,
        rerollOf: context.event.checkId,
        visibility: context.event.visibility,
      }),
      before = indices.map((index) => dice[index]);
    indices.forEach((index, offset) => {
      dice[index] = rerolled[offset];
    });
    if (eventGroup) {
      eventGroup.dice = structuredClone(dice);
      eventGroup.total =
        dice.reduce((sum, face) => sum + face, 0) + (eventGroup.bonus || 0);
      context.event.total = context.event.groups.reduce(
        (sum, group) => sum + group.total,
        0,
      );
    }
    const receiptRoll = resume.receipt?.rolls?.[rollIndex];
    if (receiptRoll) {
      receiptRoll.dice = structuredClone(dice);
      receiptRoll.rollEventId = s.eventSerial;
    }
    return { rollIndex, diceIndices: [...indices], before, after: rerolled };
  },
  'damage.adjust': (_s, params, context) => {
    if (
      !Number.isFinite(params.delta) ||
      !Number.isFinite(context.event.amount)
    )
      return false;
    const before = context.event.amount;
    context.event.amount = Math.max(0, before + params.delta);
    return { before, after: context.event.amount };
  },
  'damage.deal': (s, params, context) => {
    const hero = s.heroes[params.heroId];
    if (!hero || hero.dead || !Number.isFinite(params.amount)) return false;
    const event = context.event || {};
    return {
      queued: damage(s, hero, params.damageType || 'physical', params.amount, {
        rootActionId: event.rootActionId,
        causeId: event.causeId,
        causeTag: params.causeTag || 'effect',
        sourceKind: params.sourceKind || 'effect',
        sourceEnemyId: params.sourceEnemyId,
        sourceCardId: params.sourceCardId,
        sourceRoomId: params.sourceRoomId,
        triggerUsage: context.usage,
      }),
    };
  },
  'enemy.changeHp': (s, params, context) => {
    const enemy = s.enemies.find((entry) => entry.id === params.enemyId);
    if (!enemy || !Number.isFinite(params.delta)) return false;
    const before = enemy.hp;
    enemy.hp = Math.max(0, Math.min(enemy.maxHp, enemy.hp + params.delta));
    if (enemy.hp === before) return false;
    const source = context.trigger?.sourceLabel || '规则效果';
    log(s, `${source}令${enemy.name}生命 ${before} → ${enemy.hp}。`);
    defeatEnemy(s, enemy);
    return { enemyId: enemy.id, before, after: enemy.hp };
  },
  'hero.changeTrait': (s, params, context) => {
    const hero = s.heroes[params.heroId];
    if (
      !hero ||
      hero.dead ||
      !TRAIT_KEYS.includes(params.trait) ||
      !Number.isInteger(params.delta)
    )
      return false;
    return {
      heroId: hero.id,
      change: changeTrait(s, hero, params.trait, params.delta, {
        ...context.event,
        triggerUsage: context.usage,
      }),
    };
  },
  'hero.changeMoves': (s, params) => {
    const hero = s.heroes[params.heroId];
    if (!hero || hero.dead || hero.stopped || !Number.isInteger(params.delta))
      return false;
    const before = hero.moves;
    hero.moves = Math.max(0, hero.moves + params.delta);
    return { heroId: hero.id, before, after: hero.moves };
  },
  'hero.restoreTrait': (s, params, context) => {
    const hero = s.heroes[params.heroId],
      view =
        hero && TRAIT_KEYS.includes(params.trait)
          ? traitRuleView(s, hero, params.trait)
          : null;
    if (
      !hero ||
      hero.dead ||
      !view?.changeable ||
      !Number.isInteger(params.amount) ||
      params.amount <= 0 ||
      view.current >= view.start
    )
      return false;
    const delta = Math.min(params.amount, view.start - view.current);
    return {
      heroId: hero.id,
      change: changeTrait(s, hero, params.trait, delta, {
        ...context.event,
        triggerUsage: context.usage,
      }),
    };
  },
  'status.add': (s, params) => {
    const hero = s.heroes[params.heroId];
    if (!hero || hero.dead || !params.status?.id) return false;
    const status = {
      ...structuredClone(params.status),
      instanceId:
        params.status.instanceId ||
        `status-${(s.statusSerial = (s.statusSerial || 0) + 1)}`,
    };
    hero.statuses ||= [];
    hero.statuses.push(status);
    recordEvent(
      s,
      'StatusAdded',
      {
        heroId: hero.id,
        statusId: status.id,
        statusLabel: status.label,
        statusInstanceId: status.instanceId,
      },
      heroVisibility(s, hero),
    );
    return {
      heroId: hero.id,
      statusId: status.id,
      instanceId: status.instanceId,
    };
  },
  'status.remove': (s, params) => {
    const hero = s.heroes[params.heroId],
      removed = (hero?.statuses || []).filter(
        (status) =>
          (params.instanceId && status.instanceId === params.instanceId) ||
          (!params.instanceId && status.id === params.statusId),
      ),
      before = hero?.statuses?.length || 0;
    if (!hero) return false;
    hero.statuses = (hero.statuses || []).filter(
      (status) =>
        !(
          (params.instanceId && status.instanceId === params.instanceId) ||
          (!params.instanceId && status.id === params.statusId)
        ),
    );
    if (hero.statuses.length === before) return false;
    for (const status of removed)
      recordEvent(
        s,
        'StatusRemoved',
        {
          heroId: hero.id,
          statusId: status.id,
          statusLabel: status.label || params.statusLabel,
          statusInstanceId: status.instanceId,
        },
        heroVisibility(s, hero),
      );
    return { heroId: hero.id, removed: before - hero.statuses.length };
  },
  'entity.move': (s, params) => {
    const destination = roomAt(s, params.toRoomId);
    if (!destination) return false;
    const isHero = params.entityType === 'hero',
      entity = isHero
        ? s.heroes[params.entityId]
        : params.entityType === 'enemy'
          ? s.enemies.find((entry) => entry.id === params.entityId)
          : null;
    if (!entity || entity.dead || entity.pos === destination.id) return false;
    const fromRoomId = entity.pos;
    entity.pos = destination.id;
    if (!isHero) {
      const explorer = enemyExplorer(s, entity);
      if (explorer) explorer.pos = destination.id;
    }
    const result = {
      entityType: params.entityType,
      entityId: entity.id,
      fromRoomId,
      toRoomId: destination.id,
      path: params.path || [fromRoomId, destination.id],
      moveKind: params.moveKind || 'effect',
    };
    recordEvent(s, 'EntityMoved', result);
    if (isHero && params.enterRoom)
      enterRoom(s, entity, destination, {
        fromRoomId,
        enterKind: result.moveKind,
      });
    return result;
  },
  'card.draw': (s, params) => {
    const hero = s.heroes[params.heroId],
      cardType = params.cardType;
    if (
      !hero ||
      hero.dead ||
      !['event', 'item', 'omen'].includes(cardType) ||
      (!s.decks[cardType]?.length &&
        !(cardType === 'event' && s.discards.event.length))
    )
      return false;
    drawCard(s, cardType, hero);
    const card = s.queue.find(
      (entry) =>
        entry.kind === 'card' &&
        entry.cardType === cardType &&
        entry.heroId === hero.id,
    );
    return card
      ? { heroId: hero.id, cardType, cardId: card.cardId, requestId: card.uid }
      : false;
  },
  'item.transfer': (s, params, context) => {
    const fromHero = s.heroes[params.fromHeroId],
      toHero = s.heroes[params.toHeroId],
      instance = itemInstances(fromHero || {}).find(
        (entry) => entry.instanceId === params.instanceId,
      );
    if (
      !fromHero ||
      !toHero ||
      fromHero.dead ||
      toHero.dead ||
      !instance ||
      !transferItemInstance(fromHero, toHero, params.instanceId)
    )
      return false;
    const result = {
      itemInstanceId: params.instanceId,
      cardId: instance.definitionId,
      fromHeroId: fromHero.id,
      toHeroId: toHero.id,
    };
    recordEvent(
      s,
      'ItemTransferred',
      result,
      context.event?.visibility || 'public',
    );
    return result;
  },
  'item.markUsed': (s, params) => {
    const hero = s.heroes[params.heroId],
      instance =
        hero &&
        itemInstances(hero).find(
          (entry) => entry.instanceId === params.instanceId,
        );
    if (!hero || !instance || itemInstanceUsed(hero, instance)) return false;
    markItemInstanceUsed(hero, instance);
    return { instanceId: instance.instanceId };
  },
  'item.spendCharge': (s, params) => {
    const hero = s.heroes[params.heroId],
      instance =
        hero &&
        itemInstances(hero).find(
          (entry) => entry.instanceId === params.instanceId,
        ),
      current = itemInstanceCharges(instance, {
        charges: params.initialCharges,
      });
    if (
      !hero ||
      !instance ||
      !Number.isInteger(params.amount) ||
      params.amount <= 0 ||
      !Number.isInteger(current) ||
      current < params.amount
    )
      return false;
    spendItemCharge(
      hero,
      instance.instanceId,
      params.amount,
      params.initialCharges,
    );
    return { before: current, after: current - params.amount };
  },
  'item.remove': (s, params) => {
    const hero = s.heroes[params.heroId];
    if (!hero || !removeItemInstance(hero, params.instanceId)) return false;
    return { instanceId: params.instanceId };
  },
  'item.drop': (s, params, context) => {
    const hero = s.heroes[params.heroId],
      room = roomAt(s, params.roomId),
      instance = itemInstances(hero || {}).find(
        (entry) => entry.instanceId === params.instanceId,
      );
    if (
      !hero ||
      !room ||
      !instance ||
      !dropItemInstance(hero, room, params.instanceId)
    )
      return false;
    const result = {
      itemInstanceId: params.instanceId,
      cardId: instance.definitionId,
      heroId: hero.id,
      roomId: room.id,
    };
    recordEvent(
      s,
      'ItemDropped',
      result,
      context.event?.visibility || 'public',
    );
    return result;
  },
  'item.pickup': (s, params, context) => {
    const hero = s.heroes[params.heroId],
      room = roomAt(s, params.roomId),
      carried = room?.droppedItems?.find(
        (entry) => entry.instanceId === params.instanceId,
      );
    if (
      !hero ||
      !room ||
      !carried ||
      !pickupItemInstance(hero, room, params.instanceId)
    )
      return false;
    const result = {
      itemInstanceId: params.instanceId,
      cardId: carried.definitionId,
      heroId: hero.id,
      roomId: room.id,
    };
    recordEvent(
      s,
      'ItemPickedUp',
      result,
      context.event?.visibility || 'public',
    );
    return result;
  },
  'map.addLink': (s, params) => {
    const result = addMapLink(s, params.fromRoomId, params.toRoomId);
    if (!result) return false;
    recordEvent(s, 'MapLinkAdded', result);
    return result;
  },
  'map.relocateRoom': (s, params) => {
    const result = relocateMapRoom(s, params.roomId, params.destination || {});
    if (!result) return false;
    const event = {
      roomId: params.roomId,
      ...result,
      moveKind: params.moveKind || 'effect',
    };
    recordEvent(s, 'RoomRelocated', event);
    return event;
  },
  'map.setCollapseLanding': (s, params) => {
    const result = setCollapseLanding(
      s,
      params.sourceRoomId,
      params.landingRoomId,
    );
    if (!result) return false;
    recordEvent(s, 'CollapseLandingSet', result);
    return result;
  },
};

export function executeRuleEffects(state, effects, context = {}) {
  return executeEffects(state, effects, RULE_EFFECT_HANDLERS, context);
}

export function applyWerewolfInfection(state, hero, cause = {}) {
  if (
    !hero ||
    hero.dead ||
    hero.traitor ||
    statusOf(hero, 'infection') ||
    statusOf(hero, 'immunity')?.until > state.elapsed
  )
    return false;
  const result = executeRuleEffects(
    state,
    [
      {
        op: 'status.add',
        params: {
          heroId: hero.id,
          status: {
            id: 'infection',
            label: STATUS_DEFINITIONS.infection.name,
            turns: WOLF_RULES.infectionRounds,
            acquired: state.elapsed,
            attempts: 0,
          },
        },
      },
    ],
    { event: { ...cause, heroId: hero.id } },
  );
  return result.executed.length === 1;
}

export function applyWerewolfCure(state, hero, cause = {}) {
  if (!hero || !statusOf(hero, 'infection')) return false;
  const removals = (hero.statuses || [])
      .filter((status) => ['infection', 'immunity'].includes(status.id))
      .map((status) => ({
        op: 'status.remove',
        params: {
          heroId: hero.id,
          ...(status.instanceId
            ? { instanceId: status.instanceId }
            : { statusId: status.id }),
          statusLabel: STATUS_DEFINITIONS[status.id]?.name,
        },
      })),
    effects = [
      ...removals,
      {
        op: 'status.add',
        params: {
          heroId: hero.id,
          status: {
            id: 'immunity',
            label: STATUS_DEFINITIONS.immunity.name,
            until: state.elapsed + WOLF_RULES.immunityRounds + 1,
          },
        },
      },
    ],
    result = executeRuleEffects(
      state,
      [{ op: 'effect.atomic', params: { effects } }],
      { event: { ...cause, heroId: hero.id } },
    );
  return result.executed.length === 1;
}

function fireRuleTiming(
  s,
  event,
  report,
  usage = [],
  { allowPause = false, deferredEvents } = {},
) {
  const stateBefore = allowPause ? null : structuredClone(s),
    eventBefore = allowPause ? null : structuredClone(event),
    result = fireTiming(s, event, RULE_TRIGGER_HANDLERS, {
      report,
      usage,
      deferredEvents,
      requestOrder: (state, activeEvent, triggers) =>
        requestTriggerOrder(state, activeEvent, triggers),
      executeEffects: (state, effects, context) =>
        executeEffects(state, effects, RULE_EFFECT_HANDLERS, context),
    });
  if (result.paused && !allowPause) {
    for (const key of Object.keys(s)) delete s[key];
    Object.assign(s, stateBefore);
    for (const key of Object.keys(event)) delete event[key];
    Object.assign(event, eventBefore);
    throw new Error(
      `Trigger timing ${event.when} cannot pause before its parent operation is migrated to Workflow`,
    );
  }
  return result;
}
