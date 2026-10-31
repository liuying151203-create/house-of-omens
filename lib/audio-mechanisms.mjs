import { canCleanseStatus } from './status-rules.mjs';
// Only consume visible, committed state. Never infer actions from translated logs.
export function mechanismCues(game, previous, events, request, fresh) {
  const cues = [],
    suppress = new Set();
  const add = (id, replaces = []) => {
    cues.push({ id, key: `mechanism:${game.eventSerial}:${id}` });
    replaces.forEach((v) => suppress.add(v));
  };
  const eventSounds = {
    FirearmLoaded: 'metal',
    AlphaKnockedDown: 'weakness',
    AlphaWeakened: 'silverBurn',
    HeroConverted: 'transform',
    PursuitUsed: 'pursuit',
    RoomRelocated: 'elevator',
    ItemTransferred: 'inventory',
    ItemDropped: 'inventory',
    ItemPickedUp: 'inventory',
    CardGained: 'inventory',
    ProtectionApplied: 'ward',
  };
  for (const e of events) {
    const status = game.heroes
      .find((h) => h.id === e.heroId)
      ?.statuses?.find((s) => s.id === e.statusId) || { id: e.statusId };
    const negative = canCleanseStatus(status) || status.negative === true;
    if (eventSounds[e.type]) add(eventSounds[e.type]);
    if (
      e.type === 'CheckResolved' &&
      e.sourceItemId === 'saint-badge' &&
      e.success
    )
      add('ward', ['checkSuccess']);
    if (e.type === 'ShotResolved') {
      add(e.silver ? 'silverShot' : 'shot');
      if (!e.hit) add('ward');
    }
    if (e.type === 'ActorAttackResolved' && e.amount === 0) add('ward');
    if (e.type === 'CardAttackResolved' && e.damage === 0) add('ward');
    if (
      e.type === 'DamageApplied' &&
      e.actualAmount === 0 &&
      e.preventedAmount > 0
    )
      add('ward');
    if (e.type === 'InfectionGained')
      add(e.level > 1 ? 'infectionDeep' : 'infection', [
        'traitUp',
        'traitDown',
      ]);
    if (e.type === 'MoonPhaseChanged') add('moon');
    if (
      e.type === 'BloodlustRestored' &&
      Object.values(e.allocation || {}).some((v) => v > 0)
    )
      add('bloodlust', ['heal', 'traitUp']);
    if (e.type === 'FactionChanged' && e.reason === 'infection')
      add('transform');
    if (e.type === 'DiceRolled' && e.rerollOf) add('ring');
    if (e.type === 'StatusAdded' && (negative || e.statusId === 'immunity'))
      add(e.statusId === 'immunity' ? 'ward' : 'infection');
    if (e.type === 'StatusChanged' && negative && e.field === 'level')
      add(e.after > e.before ? 'infectionDeep' : 'cleanse');
    if (
      e.type === 'StatusRemoved' &&
      negative &&
      !['factionChange', 'expired', 'death'].includes(e.reason)
    )
      add('cleanse');
    if (e.type === 'ItemUsed') {
      if (['medkit', 'bandage'].includes(e.itemId)) add('bandage', ['heal']);
      else if (
        ['coffee', 'tea', 'tonic', 'antidote'].includes(e.itemId) ||
        e.itemId?.endsWith('-potion')
      )
        add('drink', ['heal', 'traitUp']);
      else add('inventory');
    }
  }
  // Bloodlust allocations can span renders: wait for the final receipt above.
  if (
    events.some((e) => e.type === 'TraitChanged' && e.causeTag === 'bloodlust')
  )
    suppress.add('traitUp');
  if (fresh) {
    if (
      request.kind === 'hauntResult' &&
      !request.triggers &&
      (request.dice?.length || request.rolls?.length)
    )
      add('relief');
    if (
      request.kind === 'diceRequest' &&
      request.workflow?.definitionId === 'room.elevator'
    )
      add('elevator');
    if (request.kind === 'roomFall' && request.passengerIds) add('metal');
    if (request.kind === 'haunt')
      add(
        {
          bells: 'bell',
          mirror: 'glass',
          flood: 'generator',
          werewolf: 'transform',
          bloodmoon: 'transform',
        }[game.scenario],
      );
  }
  const oldRequest = previous.queue?.[0];
  if (
    request?.kind === 'placement' &&
    oldRequest?.uid === request.uid &&
    ['rotation', 'floor', 'x', 'y'].some((k) => request[k] !== oldRequest[k])
  )
    add('uiTick');
  for (const h of game.heroes) {
    const old = previous.heroes.find((v) => v.id === h.id);
    if (old && h.sterilizationUsed && !old.sterilizationUsed) add('cleanse');
  }
  for (const r of game.rooms) {
    const old = previous.rooms.find((v) => v.id === r.id);
    if (!old) continue;
    if (r.states?.boarded && !old.states?.boarded) add('board');
    if (
      (r.traps || []).some((t) => !(old.traps || []).some((v) => v.id === t.id))
    )
      add('metal');
    if (r.done && !old.done)
      add(
        r.target === 'mirror'
          ? 'glass'
          : r.target === 'seal'
            ? 'bell'
            : 'cleanse',
        ['objectiveDone'],
      );
  }
  if (game.powered && !previous.powered) add('generator', ['objectiveDone']);
  if (game.silver > previous.silver) add('glass', ['objective']);
  if (game.fuses > previous.fuses) add('metal', ['objective']);
  if ((game.links || []).length > (previous.links || []).length) add('passage');
  if (game.phase === 'haunt' && previous.phase === 'haunt') {
    if (game.enemies.some((e) => !previous.enemies.some((v) => v.id === e.id)))
      add(
        game.scenario === 'bells'
          ? 'bell'
          : game.scenario === 'mirror'
            ? 'glass'
            : 'transform',
      );
    if (
      game.scenario !== 'bloodmoon' &&
      Number.isFinite(game.limit) &&
      previous.limit - previous.elapsed > 3 &&
      game.limit - game.elapsed <= 3
    )
      add('threat');
  }
  if (
    (game.bloodmoon?.crafted || []).length >
    (previous.bloodmoon?.crafted || []).length
  )
    add('craft', ['inventory', 'checkSuccess']);
  if (
    (game.bloodmoon?.smelted || []).length >
    (previous.bloodmoon?.smelted || []).length
  )
    add('metal', ['inventory', 'checkSuccess']);
  for (const steam of game.bloodmoon?.steam || []) {
    const old = previous.bloodmoon?.steam?.find((v) => v.id === steam.id);
    if (!old && !steam.active) add('metal');
    if (steam.active && !old?.active) add('steam');
  }
  if (
    (previous.bloodmoon?.steam || []).some(
      (s) => s.active && !game.bloodmoon?.steam?.some((v) => v.id === s.id),
    )
  )
    add('relief');
  if (cues.some((c) => c.id === 'transform'))
    ['infection', 'infectionDeep', 'cleanse'].forEach((id) => suppress.add(id));
  if (cues.some((c) => c.id === 'infectionDeep')) suppress.add('infection');
  if (cues.some((c) => c.id === 'ward')) suppress.add('checkSuccess');
  return { cues, suppress };
}

export class NetworkAudioEvents {
  collect(net) {
    const next = {
      code: net.session?.code,
      state: net.connectionState,
      players: (net.room?.players || []).map((p) => p.id),
      error: net.error || '',
    };
    const old = this.previous;
    this.previous = next;
    if (!old) return [];
    if (next.error && next.error !== old.error) return ['error'];
    if (!next.code || old.code !== next.code) return [];
    if (old.state === 'connected' && next.state !== 'connected')
      return ['networkLost'];
    if (next.state === 'connected' && old.state !== 'connected')
      return ['networkBack'];
    if (next.state !== 'connected') return [];
    if (next.players.some((id) => !old.players.includes(id)))
      return ['networkJoin'];
    if (old.players.some((id) => !next.players.includes(id)))
      return ['networkLeave'];
    return [];
  }
}
