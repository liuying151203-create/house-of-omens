export const werewolf = {
  id: 'werewolf',
  hauntRules: [
    {
      priority: 40,
      matches: (omenId, room) =>
        isWildOmen(omenId) && (room?.tags || []).includes('moon'),
    },
    { priority: 10, matches: (omenId) => isWildOmen(omenId) },
  ],
  setup: setupWerewolf,
  victory: (game) =>
    !game.enemies.length && '狼群已全部被击败，幸存者逃出生天。',
  timeoutReason: '血月升至天顶，狼群赢得了这座宅邸。',
  winnerFaction: (won) => (won ? 'heroes' : 'wolves'),
};

function setupWerewolf(s, sc, context) {
  const {
    WOLF_RULES,
    living,
    random,
    turnWolf,
    ENTRANCE,
    pathTo,
    roomAt,
    ensureActive,
    announce,
    log,
  } = context;
  s.limit = WOLF_RULES.limit + Math.max(0, Math.ceil(s.rooms.length / 8) - 1);
  // Avoid removing the active explorer mid-confirmation when another explorer can turn.
  const eligible = living(s).filter((h) => h.id !== s.active);
  const alpha =
    eligible[Math.floor(random(s) * eligible.length)] || living(s).at(-1);
  turnWolf(s, alpha, true);
  const available = s.rooms.filter(
    (r) => r.id !== ENTRANCE && pathTo(s, ENTRANCE, r.id).length,
  );
  const sites = [];
  for (const floor of [1, 0, -1]) {
    const r = available.filter((r) => r.floor === floor).at(-1);
    if (r && sites.length < 2) sites.push(r);
  }
  for (const r of available)
    if (sites.length < 2 && !sites.includes(r)) sites.push(r);
  for (const r of sites) {
    r.target = 'moonSeal';
    r.done = false;
    r.attempts = 0;
    r.charges = 0;
    r.requiredCharges = Math.ceil(s.count / 2);
  }
  const entrance = roomAt(s, ENTRANCE);
  entrance.target = 'moonRitual';
  entrance.done = false;
  s.targetRooms = [...sites.map((r) => r.id), ENTRANCE];
  s.progress = 0;
  for (const r of s.rooms) r.states ||= {};
  ensureActive(s);
  announce(s, '血月升起 · ' + alpha.name + '化为狼王', sc.haunt, 'haunt', {
    objective: sc.objective,
    targets: sites.map((r) => r.name),
    remaining: s.limit,
  });
  log(s, '作祟降临：' + sc.title + '。' + sc.objective);
}

const isWildOmen = (id) => ['locket', 'bone', 'thorn', 'mask'].includes(id);
