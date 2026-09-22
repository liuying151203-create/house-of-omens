export function setupClassic(s, sc, context, definition) {
  const {
    shuffle,
    pathTo,
    ENTRANCE,
    roomAt,
    random,
    ensureActive,
    log,
    announce,
    FLOORS,
  } = context;
  const candidate = shuffle(
    s,
    s.rooms.filter((r) => !r.starter).map((r) => r.id),
  );
  for (const r of s.rooms.filter(
    (r) => !candidate.includes(r.id) && r.id !== 'entrance',
  ))
    candidate.push(r.id);
  const targets = []; // Spread objectives across reachable explored floors before selecting other rooms.
  const reachable = new Set(
    s.rooms.filter((r) => pathTo(s, ENTRANCE, r.id).length).map((r) => r.id),
  );
  for (const floor of [1, -1, 0]) {
    const pick = candidate.find(
      (id) =>
        reachable.has(id) &&
        roomAt(s, id).floor === floor &&
        !targets.includes(id),
    );
    if (pick) targets.push(pick);
  }
  for (const id of candidate)
    if (reachable.has(id) && !targets.includes(id) && targets.length < 3)
      targets.push(id);
  targets.slice(0, 3).forEach((id, i) => {
    const r = roomAt(s, id);
    r.target = definition.target(i);
    r.done = false;
    r.attempts = 0;
  });
  s.targetRooms = targets.slice(0, 3);
  s.trueMirror = s.targetRooms[Math.floor(random(s) * 3)];
  s.limit = sc.limit + Math.max(0, Math.ceil(s.rooms.length / 6) - 2);
  let narrative = sc.haunt;
  narrative = definition.spawn(s, sc, context) || narrative;
  ensureActive(s);
  log(s, '作祟降临：' + sc.title + '。' + sc.objective);
  announce(s, '作祟降临', narrative, 'haunt', {
    scenario: s.scenario,
    objective: sc.objective,
    targets: s.targetRooms.map((id) => {
      const r = roomAt(s, id);
      return `${FLOORS.find((f) => f.id === r.floor).name} · ${r.name}`;
    }),
    remaining: s.limit,
  });
}

export function spawnWanderer(s, name) {
  const hp = s.count + 1;
  s.enemies.push({
    id: 'wanderer',
    name,
    pos: s.targetRooms[0],
    hp,
    maxHp: hp,
    kind: 'shadow',
    might: 2,
    speed: 1,
  });
}
