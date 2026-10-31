import { mechanismCues } from './audio-mechanisms.mjs';
import { footMaterial, STORY_BY_CARD } from './audio-spatial.mjs';
const latest = (g) => g?.eventSerial ?? g?.events?.at(-1)?.id ?? 0;
const mine = (room, id) =>
  !room || (room.seats?.[id] || room.hostId) === room.you;
const publicEvent = (e) => e.visibility !== 'internal';
const keyOf = (e) => `${e.heroId}:${e.causeId || e.rootActionId || e.id}`;
export function endingSound(game, room) {
  if (!room) return game.result?.won ? 'victory' : 'defeat';
  const controlled = game.heroes.filter((h) => mine(room, h.id));
  const factions = new Set(
    controlled.map((h) => h.faction || (h.traitor ? 'traitors' : 'heroes')),
  );
  const winner =
    game.result?.winnerFaction || (game.result?.won ? 'heroes' : 'traitors');
  if (factions.size !== 1) return 'objectiveDone';
  return factions.has(winner) ? 'victory' : 'defeat';
}
export const audioScene = (game) =>
  !game
    ? 'lobby'
    : game.phase === 'over'
      ? 'over'
      : game.phase === 'haunt'
        ? 'hauntMusic'
        : 'exploreMusic';

// Stateful presentation observer. It only reads projected state, never game RNG.
export class AudioEvents {
  reset(game, epoch) {
    this.epoch = epoch;
    this.previous = game;
    this.board = game;
    this.cursor = this.floor = latest(game);
    this.requests = new Set((game?.queue || []).map((p) => p.uid));
    this.steps = new Set();
    this.rolls = new Set();
    this.checks = new Set();
  }
  collect(
    game,
    {
      epoch = 0,
      suspended = false,
      step,
      enemy,
      enemyKey,
      motion = true,
      room,
    } = {},
  ) {
    if (
      !this.requests ||
      this.epoch !== epoch ||
      !game ||
      !this.previous ||
      latest(game) < this.cursor
    ) {
      this.reset(game, epoch);
      return [];
    }
    const cues = [];
    const add = (id, key, extra = {}) => cues.push({ id, key, ...extra });
    const oldRooms = new Set(this.board.rooms.map((r) => r.id));
    for (const e of game.events || []) {
      if (
        e.type === 'CollapseStarted' &&
        publicEvent(e) &&
        e.id > this.floor &&
        !this.steps.has(`collapse:${e.id}`)
      ) {
        this.steps.add(`collapse:${e.id}`);
        add('collapse', `collapse:${e.id}`);
      }
    }
    if (game.rooms.some((r) => !oldRooms.has(r.id)))
      add('tilePlace', `room:${game.serial}`);
    this.board = game;
    if (
      step?.kind === 'move' &&
      Number(step.key.split(':')[1]) > this.floor &&
      !this.steps.has(step.key)
    ) {
      this.steps.add(step.key);
      const from = game.rooms.find((r) => r.id === step.from),
        to = game.rooms.find((r) => r.id === step.pos);
      const movement = game.events?.find(
        (e) => e.id === Number(step.key.split(':')[1]),
      );
      add(
        movement?.moveKind === 'fall'
          ? 'fall'
          : from?.floor !== to?.floor
            ? 'stairs'
            : 'step',
        step.key,
        {
          tag: 'move',
          variation:
            game.heroes.find((h) => h.id === step.heroId)?.faction === 'wolves'
              ? 'wolf'
              : footMaterial(to),
        },
      );
    }
    if (
      enemy &&
      enemy.from !== enemy.pos &&
      enemy.id > this.floor &&
      !this.steps.has(enemyKey)
    ) {
      this.steps.add(enemyKey);
      add('enemyStep', enemyKey, {
        tag: 'move',
        variation: ['alpha', 'wolf'].includes(enemy.kind) ? 'wolf' : 'spectre',
      });
    }
    if (
      step?.kind === 'trigger' &&
      Number(step.key.split(':')[1]) > this.floor &&
      !this.steps.has(step.key)
    ) {
      this.steps.add(step.key);
      add('trapSnap', step.key, { tag: 'move' });
    }
    if (suspended) return cues;
    const previous = this.previous,
      events = (game.events || []).filter(
        (e) => e.id > this.cursor && publicEvent(e),
      );
    this.cursor = latest(game);
    this.previous = game;
    if (game.phase === 'over' && previous.phase !== 'over')
      return [{ id: endingSound(game, room), key: 'ending' }];
    const p = game.queue?.[0];
    const fresh = p && !this.requests.has(p.uid);
    if (fresh) {
      this.requests.add(p.uid);
      if (p.kind === 'placement' && !p.mode) add('explore', `request:${p.uid}`);
      if (p.kind === 'card')
        add(
          { event: 'cardEvent', item: 'cardItem', omen: 'cardOmen' }[
            p.cardType
          ],
          `request:${p.uid}`,
        );
      if (p.kind === 'haunt') add('haunt', `request:${p.uid}`);
      if (p.kind === 'card' && STORY_BY_CARD[p.cardId])
        add(STORY_BY_CARD[p.cardId], `story:${p.uid}`, {
          tag: 'story',
          delay: 240,
        });
      if (p.kind === 'trapResult') add('trapSnap', `request:${p.uid}`);
      if (p.kind === 'roundStart') add('round', `request:${p.uid}`);
      if (p.kind === 'turnStart' && mine(room, p.heroId))
        add('turn', `request:${p.uid}`);
      const flow = p.workflow?.definitionId || '';
      if (
        p.kind === 'diceRequest' &&
        (p.rolls?.length > 1 || /combat\.|gainAttack/.test(flow))
      )
        add('attack', `request:${p.uid}`);
      if (p.kind === 'diceRequest' && flow === 'turn.hauntRoll')
        add('hauntRoll', `request:${p.uid}`);
      if (
        p.kind !== 'hauntResult' &&
        Number.isFinite(p.total) &&
        Number.isFinite(p.threshold)
      ) {
        const checkKey = p.workflow?.flowId || `request:${p.uid}`;
        if (!this.checks.has(checkKey)) {
          this.checks.add(checkKey);
          add(
            (p.success ?? p.total >= p.threshold)
              ? 'checkSuccess'
              : 'checkFailure',
            checkKey,
          );
        }
      }
    }
    for (const r of p?.rolls || []) {
      if (
        !r.dice ||
        !r.rollEventId ||
        r.rollEventId <= this.floor ||
        this.rolls.has(r.rollEventId)
      )
        continue;
      this.rolls.add(r.rollEventId);
      if (motion) add('diceRoll', `roll:${r.rollEventId}`, { tag: 'dice' });
      add('diceStop', `stop:${r.rollEventId}`, {
        delay: motion ? 750 : 0,
        tag: 'dice',
      });
    }
    for (const e of events) {
      if (e.type !== 'DiceRolled' || !e.rerollOf || this.rolls.has(e.id))
        continue;
      this.rolls.add(e.id);
      if (motion) add('diceRoll', `reroll:${e.id}`, { tag: 'dice' });
      add('diceStop', `reroll-stop:${e.id}`, {
        tag: 'dice',
        delay: motion ? 750 : 0,
      });
    }
    const damage = new Set(
      events.filter((e) => e.type === 'DamageApplied').map(keyOf),
    );
    const rested = new Set(
      events
        .filter(
          (e) =>
            e.type === 'HeroRested' ||
            (e.type === 'ItemUsed' &&
              ['medkit', 'bandage', 'tonic', 'tea'].includes(e.itemId)),
        )
        .map((e) => e.heroId),
    );
    const handledTraits = new Set();
    for (const e of events) {
      if (e.type === 'CheckResolved') {
        const checkKey = e.rootActionId || e.causeId || `check:${e.id}`;
        if (!this.checks.has(checkKey)) {
          this.checks.add(checkKey);
          add(e.success ? 'checkSuccess' : 'checkFailure', checkKey);
        }
      }
      if (e.type === 'DamageApplied' && e.actualAmount > 0)
        add(e.damageType === 'mental' ? 'mentalHit' : 'hit', `damage:${e.id}`);
      if (e.type === 'TraitChanged' && !damage.has(keyOf(e)) && !e.dead) {
        // A still-open damage workflow can emit partial attribute events before its final receipt.
        const pendingDamage = p?.kind === 'damage' && p.heroId === e.heroId;
        if (
          pendingDamage ||
          (e.steps < 0 && (e.sourceKind === 'enemy' || e.sourceKind === 'hero'))
        )
          continue;
        const group = `${keyOf(e)}:${Math.sign(e.steps)}`;
        if (!handledTraits.has(group)) {
          handledTraits.add(group);
          add(
            e.steps > 0
              ? rested.has(e.heroId)
                ? 'heal'
                : 'traitUp'
              : 'traitDown',
            group,
          );
        }
      }
    }
    for (const h of game.heroes)
      if (h.dead && previous.heroes.some((old) => old.id === h.id && !old.dead))
        add('death', `death:${h.id}`);
    for (const e of previous.enemies || []) {
      const current = game.enemies.find((v) => v.id === e.id);
      if (!current) add('enemyDeath', `enemy:${e.id}`);
      else if (current.hp < e.hp) add('hit', `hp:${e.id}:${current.hp}`);
    }
    let progress =
      game.progress > previous.progress ||
      game.fuses > previous.fuses ||
      game.silver > previous.silver;
    let completed = game.powered && !previous.powered;
    for (const r of game.rooms) {
      const old = previous.rooms.find((v) => v.id === r.id);
      if (old) {
        progress ||= (r.charges || 0) > (old.charges || 0);
        completed ||= r.done && !old.done;
      }
    }
    if (completed || progress)
      add(completed ? 'objectiveDone' : 'objective', `goal:${game.serial}`);
    // One notification per semantic class per update, with major results taking precedence.
    const mechanisms = mechanismCues(game, previous, events, p, fresh);
    const seen = new Set();
    return [...cues, ...mechanisms.cues].filter(
      (c) =>
        c.id &&
        !mechanisms.suppress.has(c.id) &&
        !seen.has(c.id) &&
        seen.add(c.id),
    );
  }
}
