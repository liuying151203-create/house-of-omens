import { resolveCard as cardDefinition, cardCureBonus } from './card-rules.mjs';
import {
  WOLF_RULES,
  wolfStats,
  moonlit,
  wolfMight,
  statusOf,
  infect,
  cure,
  chooseHaunt,
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
};
export const DIRS = [
  { dx: 0, dy: -1, name: '北' },
  { dx: 1, dy: 0, name: '东' },
  { dx: 0, dy: 1, name: '南' },
  { dx: -1, dy: 0, name: '西' },
];
export const ENTRANCE = 'entrance';
export const random = (s) => {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
};
export const roll = (s, n, meta = {}) => {
  const count = Math.max(1, Math.min(n, 16));
  if (s._rollReplay) return s._rollReplay.shift();
  if (s._rollCapture) {
    s._rollCapture.push({ count, ...meta });
    return Array(count).fill(0);
  }
  return Array.from({ length: count }, () => Math.floor(random(s) * 3));
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
export const traitValue = (h, key) => h.tracks[key][h.stats[key]];
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
  return traitValue(h, 'speed') + (hasBonus(h, 'movement', s) ? 1 : 0);
}
export function connections(s, id) {
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
  return [...new Set(con)];
}
export function pathTo(s, start, target) {
  const queue = [[start]],
    seen = new Set([start]);
  while (queue.length) {
    const path = queue.shift(),
      id = path.at(-1);
    if (id === target) return path;
    for (const next of connections(s, id))
      if (!seen.has(next)) {
        seen.add(next);
        queue.push([...path, next]);
      }
  }
  return [];
}
export const graphDistance = (s, a, b) => {
  const p = pathTo(s, a, b);
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
function log(s, text) {
  s.logs.unshift({ id: ++s.serial, round: s.round, text });
  s.logs = s.logs.slice(0, 100);
  s.feedback = text;
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
export function createGame(scenario, seed = Date.now(), count = 3) {
  if (!SCENARIOS.some((s) => s.id === scenario))
    throw Error('Unknown scenario');
  count = Math.max(3, Math.min(6, Math.trunc(count)));
  const s = {
    version: 2,
    scenario,
    automaticHaunt: scenario === 'mystery',
    seed: seed >>> 0,
    count,
    phase: 'explore',
    round: 1,
    active: 0,
    viewFloor: 0,
    serial: 0,
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
  log(s, '探险队抵达入口大厅。门外的山路已被浓雾吞没。');
  announce(s, '门已经关上了', '探索宅邸，等待预兆降临。', 'intro');
  return s;
}
export function validSave(s) {
  try {
    return (
      s?.version === 2 &&
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
      Array.isArray(s.links) &&
      Array.isArray(s.decks.rooms) &&
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
function end(s, won, reason) {
  s.phase = 'over';
  s.result = { won, reason };
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
  else if (s.phase === 'haunt' && s.scenario === 'bells' && s.progress === 3)
    end(s, true, '三处祭坛已全部封印。');
  if (s.phase === 'haunt' && s.scenario === 'werewolf' && !s.enemies.length)
    end(s, true, '狼群已全部被击败，幸存者逃出生天。');
  if (s.phase === 'over' && s.scenario === 'werewolf')
    s.result.winnerFaction = s.result.won ? 'heroes' : 'wolves';
  ensureActive(s);
}
function changeTrait(s, h, key, delta) {
  const before = traitValue(h, key),
    old = h.stats[key],
    minimum = s.phase === 'explore' ? 1 : 0;
  h.stats[key] = Math.max(
    minimum,
    Math.min(h.tracks[key].length - 1, old + delta),
  );
  const after = traitValue(h, key),
    actual = h.stats[key] - old;
  log(
    s,
    `${h.name}的${TRAITS[key]} ${before} → ${after}（${actual >= 0 ? '+' : ''}${actual}格）${delta < 0 && actual === 0 ? '，作祟前不会降到骷髅位' : ''}。`,
  );
  if (h.stats[key] === 0 && !h.dead) {
    h.dead = true;
    h.moves = 0;
    h.ended = true;
    announce(
      s,
      h.name + '倒下了',
      `${TRAITS[key]}降至骷髅位置，${h.name}无法继续行动。`,
      'death',
    );
  }
  return `${TRAITS[key]} ${before} → ${after}（${actual >= 0 ? '+' : ''}${actual}格）`;
}
function damage(s, h, kind, amount) {
  if (h.dead) return;
  if (kind === 'mental' && hasBonus(h, 'mentalWard', s))
    amount = Math.max(0, amount - 1);
  if (amount > 0)
    enqueue(s, {
      kind: 'damage',
      title: kind === 'physical' ? '分配肉体伤害' : '分配精神伤害',
      text: `${h.name}需要承受${amount}点${kind === 'physical' ? '肉体' : '精神'}伤害。每点伤害让所选属性下降1格。`,
      heroId: h.id,
      damageType: kind,
      remaining: amount,
      total: amount,
      allocation: [],
    });
}
function applyEffect(s, h, effect) {
  if (effect.trait) return changeTrait(s, h, effect.trait, effect.delta);
  if (effect.damage) {
    damage(s, h, effect.damage, effect.amount);
    return `需要分配 ${effect.amount} 点${effect.damage === 'physical' ? '肉体' : '精神'}伤害`;
  }
  return '';
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
  });
  log(
    s,
    `${h.name}抽取了一张${type === 'event' ? '事件' : type === 'item' ? '物品' : '预兆'}卡。${card.stopsMovement ? '本回合停止移动。' : '这张牌不停止移动。'}`,
  );
}
function enterRoom(s, h, r) {
  if (r.special === 'stairsDown' && !s.basementUnlocked) {
    s.basementUnlocked = true;
    s.links.push([r.id, 'basement']);
    log(s, '发现地下阶梯！地下室现在与一楼连通。');
    announce(
      s,
      '地下室的入口',
      '你听见台阶深处传来水滴声。这个房间与地下室平台永久连通，可用1点移动力上下楼。',
      'floor',
    );
  }
  if (TRAIT_KEYS.includes(r.special) && !r.roomBonus.includes(h.id)) {
    r.roomBonus.push(h.id);
    const change = changeTrait(s, h, r.special, 1);
    announce(
      s,
      '房间的馈赠',
      r.name + '令你有所领悟。' + change + '。每名探险者在此房间仅触发一次。',
      'trait',
    );
  }
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
  if (s.scenario === 'werewolf') {
    setupWerewolf(s, sc);
    return;
  }
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
    r.target =
      s.scenario === 'bells'
        ? 'seal'
        : s.scenario === 'mirror'
          ? 'mirror'
          : i < 2
            ? 'fuse'
            : 'generator';
    r.done = false;
    r.attempts = 0;
  });
  s.targetRooms = targets.slice(0, 3);
  s.trueMirror = s.targetRooms[Math.floor(random(s) * 3)];
  s.limit = sc.limit + Math.max(0, Math.ceil(s.rooms.length / 6) - 2);
  let narrative = sc.haunt;
  if (s.scenario === 'bells') {
    const h = living(s).find((h) => h.id === 2) || living(s).at(-1);
    h.traitor = true;
    h.ended = true;
    h.moves = 0;
    const hp = 5 + s.count;
    s.enemies.push({
      id: 'keeper',
      heroId: h.id,
      name: '守钟人',
      pos: h.pos,
      hp,
      maxHp: hp,
      kind: 'keeper',
      might: 3,
      speed: 1,
    });
    narrative = narrative.replaceAll('沈墨', h.name);
  } else {
    const hp = s.count + 1;
    s.enemies.push({
      id: 'wanderer',
      name: s.scenario === 'flood' ? '溺亡者' : '游荡倒影',
      pos: s.targetRooms[0],
      hp,
      maxHp: hp,
      kind: 'shadow',
      might: 2,
      speed: 1,
    });
  }
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
function resolveCard(s, p) {
  const h = s.heroes[p.heroId],
    c = cardDefinition(s, p.cardType, p.cardId, h.id);
  if (p.cardType === 'event') {
    const dice = c.trait
        ? roll(
            s,
            traitValue(h, c.trait) +
              (hasBonus(h, 'all', s) ? 1 : 0) +
              (hasBonus(h, 'event', s) &&
              ['sanity', 'knowledge'].includes(c.trait)
                ? 1
                : 0),
            { heroId: h.id, label: h.name + ' · ' + TRAITS[c.trait] },
          )
        : null,
      total = dice?.reduce((a, b) => a + b, 0),
      success = !c.trait || total >= c.threshold,
      effect = c.effect || (success ? c.success : c.failure);
    const result = {
      kind: 'cardResult',
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
    h.items.push(c.id);
    announce(
      s,
      c.title,
      '已放入' + h.name + '的随身物品。' + c.effect,
      'cardResult',
      { cardType: 'item' },
    );
    log(s, h.name + '获得物品「' + c.title + '」。');
  } else {
    if (s.phase === 'explore')
      s.hauntContext = {
        omenId: c.id,
        omenTitle: c.title,
        room: structuredClone(roomAt(s, h.pos)),
        heroId: h.id,
      };
    h.omens.push(c.id);
    s.omens++;
    const change = c.trait ? changeTrait(s, h, c.trait, c.delta) : '';
    announce(s, c.title, c.effect, 'cardResult', {
      cardType: 'omen',
      changes: [change],
    });
    log(
      s,
      h.name + '获得预兆「' + c.title + '」，全队累计 ' + s.omens + ' 张。',
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
        { diceCount: s.omens },
      );
  }
}
function advance(s) {
  const p = s.queue.shift();
  if (!p) return;
  if (p.kind === 'card') resolveCard(s, p);
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
    };
  if (!h || h.dead || h.traitor || h.ended || s.phase === 'over' || pending(s))
    return none;
  const r = roomAt(s, h.pos),
    canMove = !h.stopped && h.moves > 0;
  const cost = 1 + (s.enemies.some((e) => e.pos === h.pos) ? 1 : 0);
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
    attack:
      !h.attacked && s.phase === 'haunt'
        ? s.enemies.filter((e) => e.pos === h.pos).map((e) => e.id)
        : [],
    interact:
      s.phase === 'haunt' &&
      !h.interacted &&
      ((r.target &&
        !r.done &&
        (r.target !== 'moonRitual' || s.progress >= 2)) ||
        (s.scenario === 'flood' && s.powered && h.pos === ENTRANCE)),
    rest: !h.rested && TRAIT_KEYS.some((k) => h.stats[k] < h.start[k]),
    moveCost: cost,
  };
}
function endRound(s) {
  if (s.phase === 'haunt') {
    const movements = [];
    s.elapsed++;
    const report = [];
    if (s.scenario === 'werewolf') {
      for (const h of living(s)) {
        h.statuses = (h.statuses || []).filter(
          (x) => x.id !== 'immunity' || x.until > s.elapsed,
        );
        const infection = statusOf(h, 'infection');
        if (
          infection &&
          infection.acquired < s.elapsed &&
          --infection.turns <= 0
        ) {
          turnWolf(s, h, false);
          report.push(h.name + '的狼毒发作，加入狼群！');
          announce(
            s,
            '阵营转化 · ' + h.name,
            '狼毒倒计时结束。现在属于狼群；本轮刚转化，下一轮才开始追猎。',
            'infection',
          );
        }
      }
      check(s);
      if (s.phase === 'over') return;
    }
    for (const e of s.enemies) {
      if (e.bornAt === s.elapsed) continue;
      if (e.kind === 'alpha' && moonlit(s, roomAt(s, e.pos))) {
        e.hp = Math.min(e.maxHp, e.hp + 2);
        report.push(e.name + '在月光中恢复2点生命。');
      }
      const target =
        living(s).find((h) => h.id === e.huntTarget) ||
        living(s).sort(
          (a, b) =>
            graphDistance(s, e.pos, a.pos) - graphDistance(s, e.pos, b.pos),
        )[0];
      if (!target) break;
      const path = pathTo(s, e.pos, target.pos);
      const route = path.length ? path.slice(0, e.speed + 1) : [e.pos];
      if (!e.hidden && e.revealed !== false)
        movements.push({
          enemyId: e.id,
          name: e.name,
          kind: e.kind,
          ...(e.heroId !== undefined ? { heroId: e.heroId } : {}),
          path: route,
          targetId: target.id,
          targetName: target.name,
          attacks: route.at(-1) === target.pos,
        });
      if (path.length > 1) {
        e.pos = path[Math.min(e.speed, path.length - 1)];
        const explorer = enemyExplorer(s, e);
        if (explorer) explorer.pos = e.pos;
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
              traitValue(target, 'might') +
                (hasBonus(target, 'all', s) ? 1 : 0),
              { heroId: target.id, label: target.name + ' · 防御' },
            ),
            a = attack.reduce((a, b) => a + b, 0),
            d = defense.reduce((a, b) => a + b, 0),
            amount = Math.min(3, Math.max(0, a - d));
          report.push(
            `${e.name}攻击${target.name}：${a} 对 ${d}，${amount ? amount + '点肉体伤害' : '挡住了攻击'}。`,
          );
          damage(s, target, 'physical', amount);
          if (amount && ['alpha', 'wolf'].includes(e.kind) && infect(s, target))
            report.push(
              target.name +
                '感染狼毒：还有3个行动轮治疗，重复咬伤不会缩短时间。',
            );
        }
      }
    }
    if (s.scenario === 'bells' && s.elapsed % 3 === 0 && s.enemies.length < 3) {
      s.enemies.push({
        id: 'shade' + s.elapsed,
        name: '钟声幽影',
        pos: s.targetRooms[0],
        hp: 3,
        maxHp: 3,
        kind: 'shadow',
        might: 2,
        speed: 1,
      });
      report.push('祭坛旁凝聚了一只钟声幽影。');
    }
    report.forEach((t) => log(s, t));
    announce(
      s,
      '黑暗中的动静',
      report.join('\n') || '暂时没有敌人靠近，但宅邸的倒计时仍在推进。',
      'enemyTurn',
      { remaining: s.limit - s.elapsed },
    );
    // Presentation data is captured before rolling, without applying probe effects.
    if (s._rollCapture) s._enemyMovements = movements;
    if (s.elapsed >= s.limit) {
      end(
        s,
        false,
        s.scenario === 'werewolf'
          ? '血月升至天顶，狼群赢得了这座宅邸。'
          : s.scenario === 'flood'
            ? '黑水漫过最后一级台阶，逃生时间用尽了。'
            : s.scenario === 'bells'
              ? '第十三声钟响响起。你们的名字被写进旧名册。'
              : '所有镜面一起合拢，倒影替你们走出了宅邸。',
      );
      if (s.scenario === 'werewolf') s.result.winnerFaction = 'wolves';
      return;
    }
  }
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
  check(s);
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
    a.type === 'wolfOrder' &&
    !p &&
    s.phase === 'haunt' &&
    s.scenario === 'werewolf'
  ) {
    const e = s.enemies.find((x) => x.heroId === a.heroId);
    if (e && living(s).some((x) => x.id === a.targetId)) {
      e.huntTarget = a.targetId;
      log(s, e.name + '锁定了' + s.heroes[a.targetId].name + '。');
    }
    return s;
  }
  if (p) {
    if (p.kind === 'placement') {
      if (a.type === 'rotate') {
        const i = p.options.findIndex((o) => o.rotation === p.rotation);
        p.rotation = p.options[(i + 1) % p.options.length].rotation;
        return s;
      }
      if (a.type === 'place') {
        const tile = ROOM_DECK.find((t) => t.id === p.tileId),
          valid = placementOptions(s, p.from, p.dir, tile);
        if (!valid.some((o) => o.rotation === p.rotation)) return s;
        s.queue.shift();
        const h = s.heroes[p.heroId],
          r = {
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
        enterRoom(s, h, r);
        if (r.icon) drawCard(s, r.icon, h);
        return s;
      }
      return s;
    }
    if (p.kind === 'damage') {
      if (a.type === 'allocateDamage') {
        const keys =
          p.damageType === 'physical'
            ? ['might', 'speed']
            : ['sanity', 'knowledge'];
        if (
          !a.allocation ||
          Object.keys(a.allocation).some((k) => !keys.includes(k)) ||
          keys.some(
            (k) => !Number.isInteger(a.allocation[k]) || a.allocation[k] < 0,
          ) ||
          keys.reduce((n, k) => n + a.allocation[k], 0) !== p.remaining
        )
          return s;
        s.queue.shift();
        const h = s.heroes[p.heroId],
          changes = [];
        for (const key of keys)
          if (a.allocation[key] > 0)
            changes.push(changeTrait(s, h, key, -a.allocation[key]));
        if (h.dead)
          s.queue = s.queue.filter(
            (entry) => entry.kind !== 'damage' || entry.heroId !== h.id,
          );
        announce(
          s,
          h.name + '的伤害已结算',
          changes.join('；'),
          'damageResult',
          { heroId: h.id, changes },
        );
        check(s);
        return s;
      }
      if (a.type !== 'allocate') return s;
      const keys =
        p.damageType === 'physical'
          ? ['might', 'speed']
          : ['sanity', 'knowledge'];
      if (!keys.includes(a.trait)) return s;
      const h = s.heroes[p.heroId];
      changeTrait(s, h, a.trait, -1);
      p.remaining--;
      p.allocation.push(TRAITS[a.trait]);
      if (p.remaining <= 0 || h.dead) s.queue.shift();
      if (h.dead)
        s.queue = s.queue.filter(
          (entry) => entry.kind !== 'damage' || entry.heroId !== h.id,
        );
      check(s);
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
  if (s.scenario === 'werewolf' && s.phase === 'haunt' && !h.interacted) {
    if (a.type === 'boardWindow' && moonlit(s, r)) {
      h.interacted = true;
      r.states ||= {};
      r.states.boarded = true;
      log(s, h.name + '封住了' + r.name + '的窗户，月光不再增强狼人。');
      return s;
    }
    if (a.type === 'cure') {
      const target = living(s).find(
        (x) => x.id === a.heroId && x.pos === h.pos && statusOf(x, 'infection'),
      );
      if (!target) return s;
      h.interacted = true;
      const infection = statusOf(target, 'infection');
      infection.attempts++;
      const bonus = infection.attempts - 1 + cardCureBonus(s, h, target);
      const dice = roll(s, traitValue(h, 'knowledge'), {
        heroId: h.id,
        label: h.name + ' · 治疗狼毒',
        bonus,
      });
      const total = dice.reduce((a, b) => a + b, 0) + bonus;
      if (total >= 3) cure(s, target);
      announce(
        s,
        total >= 3 ? '狼毒已清除' : '治疗尚未成功',
        target.name +
          (total >= 3
            ? '获得两轮净血保护。'
            : '仍有' + infection.turns + '轮；下次治疗额外 +1。'),
        'check',
        { dice, total, threshold: 3 },
      );
      log(s, h.name + '治疗' + target.name + '：' + total + '/3。');
      return s;
    }
  }
  if (a.type === 'endHero') {
    h.ended = true;
    h.moves = 0;
    const next = living(s).find((n) => !n.ended);
    if (next) {
      s.active = next.id;
      s.viewFloor = roomAt(s, next.pos).floor;
      log(s, h.name + '结束行动，轮到' + next.name + '。');
    } else endRound(s);
    return s;
  }
  if (a.type === 'explore' && legal.explore.some((f) => f.dir === a.dir)) {
    discover(s, h, a.dir);
    return s;
  }
  if (a.type === 'move' && [...legal.move, ...legal.stairs].includes(a.pos)) {
    h.moves -= legal.moveCost;
    h.pos = a.pos;
    s.viewFloor = roomAt(s, h.pos).floor;
    log(
      s,
      `${h.name}进入${FLOORS.find((f) => f.id === s.viewFloor).name} · ${roomAt(s, h.pos).name}，移动力剩余${h.moves}。`,
    );
    enterRoom(s, h, roomAt(s, h.pos));
    return s;
  }
  if (
    a.type === 'useItem' &&
    h.items.includes(a.id) &&
    !h.used.includes(a.id)
  ) {
    const c = cardDefinition(s, 'item', a.id, h.id);
    if (!c.use) return s;
    let change = '';
    if (c.use === 'movement') {
      if (h.stopped) {
        announce(
          s,
          '本回合已停止移动',
          '你已因抽卡或休整停止移动，咖啡不能解除。本次未消耗咖啡，请留到下一回合使用。',
        );
        return s;
      }
      h.moves += c.useAmount;
      change = '本回合移动力 +' + c.useAmount + '。';
    } else {
      const keys =
        c.use === 'healPhysical' ? ['might', 'speed'] : ['sanity', 'knowledge'];
      if (!keys.includes(a.trait) || h.stats[a.trait] >= h.start[a.trait])
        return s;
      change = changeTrait(
        s,
        h,
        a.trait,
        Math.min(c.useAmount, h.start[a.trait] - h.stats[a.trait]),
      );
    }
    h.used.push(c.id);
    if (c.consumable) h.items.splice(h.items.indexOf(c.id), 1);
    announce(s, '使用' + c.title, change, 'itemUse');
    return s;
  }
  if (
    a.type === 'rest' &&
    legal.rest &&
    TRAIT_KEYS.includes(a.trait) &&
    h.stats[a.trait] < h.start[a.trait]
  ) {
    h.rested = true;
    h.stopped = true;
    h.moves = 0;
    const change = changeTrait(s, h, a.trait, 1);
    announce(s, '喘息片刻', change + '。休整后，本回合不能再移动。', 'trait');
    return s;
  }
  if (a.type === 'attack' && legal.attack.includes(a.id)) {
    h.attacked = true;
    const e = s.enemies.find((e) => e.id === a.id),
      attack = roll(
        s,
        traitValue(h, 'might') +
          (hasBonus(h, 'attack', s) ? 1 : 0) +
          (hasBonus(h, 'all', s) ? 1 : 0),
        { heroId: h.id, label: h.name + ' · 力量', bonus: s.silver },
      ),
      defense = roll(s, wolfMight(s, e), enemyDiceMeta(s, e)),
      aTotal = attack.reduce((a, b) => a + b, 0) + s.silver,
      dTotal = defense.reduce((a, b) => a + b, 0),
      delta = aTotal - dTotal;
    const dealt =
      e.kind === 'alpha'
        ? Math.min(delta, moonlit(s, roomAt(s, e.pos)) ? 2 : 3)
        : delta;
    if (delta > 0) e.hp -= dealt;
    announce(
      s,
      delta > 0
        ? '你的攻击命中了'
        : delta === 0
          ? '双方僵持'
          : '对方发动了反击',
      `${h.name} ${aTotal} 对 ${e.name} ${dTotal}。${delta > 0 ? '敌人损失' + dealt + '点生命。' + (dealt < delta ? '狼王厚皮吸收了部分伤害。' : '') : delta < 0 ? '你需要分配' + Math.min(3, -delta) + '点肉体伤害。' : '双方均未受伤。'}`,
      'combat',
      {
        dice: attack,
        defenseDice: defense,
        total: aTotal,
        defenseTotal: dTotal,
      },
    );
    log(s, `${h.name}攻击${e.name}：${aTotal} 对 ${dTotal}。`);
    if (delta < 0) damage(s, h, 'physical', Math.min(3, -delta));
    if (e.hp <= 0) {
      s.enemies = s.enemies.filter((x) => x.id !== e.id);
      log(s, e.name + '已被击败。');
      const explorer = enemyExplorer(s, e);
      if (explorer) explorer.dead = true;
      if (e.kind === 'wraith') end(s, true, '镜魇的真身终于被打碎。');
    }
    check(s);
    return s;
  }
  if (a.type === 'interact' && legal.interact) {
    if (s.scenario === 'flood' && h.pos === ENTRANCE && s.powered) {
      if (living(s).every((x) => x.pos === ENTRANCE))
        end(s, true, '所有幸存者已逃离宅邸。');
      else
        announce(
          s,
          '还有人没有回来',
          '请让所有幸存者抵达入口大厅，再一起逃生。',
        );
      return s;
    }
    if (s.scenario === 'werewolf') {
      h.interacted = true;
      if (r.target === 'moonSeal') {
        r.attempts++;
        const dice = roll(
          s,
          traitValue(h, 'knowledge') + (hasBonus(h, 'ritual', s) ? 1 : 0),
          {
            heroId: h.id,
            label: h.name + ' · 净化月印',
            bonus: r.attempts - 1,
          },
        );
        const total = dice.reduce((a, b) => a + b, 0) + r.attempts - 1;
        if (total >= WOLF_RULES.ritualThreshold) {
          r.charges = (r.charges || 0) + 1;
          if (r.charges >= r.requiredCharges) {
            r.done = true;
            s.progress++;
          }
        }
        announce(
          s,
          total >= 4 ? '月印净化' : '咒文渐渐清晰',
          total >= 4
            ? '本处月印 ' +
                r.charges +
                '/' +
                r.requiredCharges +
                '，已净化 ' +
                s.progress +
                '/2处；全部完成后回入口解咒。'
            : '下次尝试累计 +1。',
          'check',
          { dice, total, threshold: 4 },
        );
      } else if (r.target === 'moonRitual' && s.progress >= 2) {
        for (const x of s.heroes) {
          x.statuses = [];
          if (!x.dead) {
            x.traitor = false;
            x.faction = 'heroes';
          }
        }
        s.enemies = [];
        end(
          s,
          true,
          '两道月印汇入银光，狼毒解除，狼王被驱逐。幸存者共同获胜。',
        );
        s.result.winnerFaction = 'heroes';
      }
      return s;
    }
    if (r.target === 'generator' && s.fuses < 2) {
      announce(s, '缺少保险丝', '需要收集两枚保险丝，才能修复发电机。');
      return s;
    }
    h.interacted = true;
    r.attempts++;
    if (r.target === 'seal') {
      const dice = roll(
          s,
          traitValue(h, 'knowledge') +
            (hasBonus(h, 'ritual', s) ? 1 : 0) +
            (hasBonus(h, 'all', s) ? 1 : 0),
          { heroId: h.id, label: h.name + ' · 知识', bonus: r.attempts - 1 },
        ),
        total = dice.reduce((a, b) => a + b, 0) + r.attempts - 1,
        threshold = 3 + Math.floor((s.count - 3) / 2);
      if (total >= threshold) {
        r.done = true;
        s.progress++;
      }
      announce(
        s,
        total >= threshold ? '封印落下' : '残缺的咒文',
        total >= threshold
          ? `已经封印 ${s.progress} / 3 处祭坛。`
          : '本次未成功。此祭坛下次检定额外 +1，可换队员尝试。',
        'check',
        { dice, total, threshold, success: total >= threshold },
      );
      log(s, `祭坛检定 ${total} / ${threshold}，已封印${s.progress}/3。`);
    } else if (r.target === 'mirror') {
      r.done = true;
      s.progress++;
      if (r.id === s.trueMirror) {
        s.mirrorFound = true;
        const hp = 5 + s.count;
        s.enemies.push({
          id: 'wraith',
          name: '镜魇真身',
          pos: r.id,
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
        '调查古镜：' + (r.id === s.trueMirror ? '发现真身！' : '发现银屑。'),
      );
    } else if (r.target === 'fuse') {
      r.done = true;
      s.fuses++;
      announce(
        s,
        '找到保险丝',
        `全队已经收集 ${s.fuses} / 2 枚保险丝。`,
        'itemUse',
      );
      log(s, '保险丝 ' + s.fuses + '/2。');
    } else if (r.target === 'generator') {
      r.done = true;
      s.powered = true;
      announce(
        s,
        '灯亮了',
        '门厅的门锁恢复了电力。让所有幸存者经楼梯返回一楼入口，然后一起逃生。',
        'power',
      );
      log(s, '电力恢复，全员返回入口大厅！');
    }
    check(s);
    return s;
  }
  return s;
}

export function createInteractiveGame(...args) {
  return { ...createGame(...args), rollMode: 'interactive' };
}
export function act(state, a) {
  if (
    a.type === 'resolveDice' &&
    (pending(state)?.kind !== 'diceRequest' ||
      pending(state).uid !== a.requestId)
  )
    return state;
  if (state.rollMode !== 'interactive' || state.phase === 'over')
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
      for (const r of p.rolls.filter((r) => ids.includes(r.id)))
        r.dice = roll(s, r.count);
      return s;
    }
    if (
      ['advance', 'resolveDice'].includes(a.type) &&
      p.rolls.every((r) => r.dice)
    ) {
      s.queue = p.resumeQueue;
      s._rollReplay = p.rolls.map((r) => r.dice);
      const result = applyAction(s, p.resumeAction);
      delete result._rollReplay;
      for (const entry of result.queue)
        if (entry.dice) entry.dicePresented = true;
      const receipt = {
        rolls: p.rolls,
        title: p.title,
        text:
          result.queue.find((entry) =>
            [
              'combat',
              'cardResult',
              'hauntResult',
              'check',
              'enemyTurn',
            ].includes(entry.kind),
          )?.text ||
          result.result?.reason ||
          '',
      };
      if (result.queue[0]) result.queue[0].rollReceipt = receipt;
      else if (result.result) result.lastRollReceipt = receipt;
      return result;
    }
    return s;
  }
  const probe = { ...structuredClone(state), _rollCapture: [] };
  const result = applyAction(probe, a),
    groups = result._rollCapture;
  const movements = result._enemyMovements;
  delete result._rollCapture;
  delete result._enemyMovements;
  if (!groups?.length) {
    if (movements?.length && result.queue[0])
      result.queue[0].enemyMovements = movements;
    return result;
  }
  const s = structuredClone(state);
  if (movements?.length)
    s.viewFloor = roomAt(s, movements.at(-1).path.at(-1)).floor;
  s.queue = [
    {
      uid: ++s.serial,
      kind: 'diceRequest',
      heroId: current?.heroId ?? s.active,
      title:
        a.type === 'attack'
          ? '力量交锋'
          : a.type === 'endRound' || a.type === 'endHero'
            ? '敌人来袭'
            : current?.title || '属性检定',
      text:
        current?.kind === 'card'
          ? `${TRAITS[cardDefinition(s, current.cardType, current.cardId, current.heroId)?.trait]} · 目标 ${cardDefinition(s, current.cardType, current.cardId, current.heroId)?.threshold}+`
          : current?.kind === 'hauntRoll'
            ? '总点数达到 5，作祟降临。'
            : a.type === 'interact'
              ? `知识检定 · 目标 ${3 + Math.floor((s.count - 3) / 2)}+`
              : '',
      rolls: groups.map((r, i) => ({ ...r, id: 'side-' + i, dice: null })),
      ...(movements?.length ? { enemyMovements: movements } : {}),
      resumeAction: a,
      resumeQueue: s.queue,
    },
  ];
  return s;
}

function turnWolf(s, h, alpha) {
  h.traitor = true;
  h.faction = 'wolves';
  h.ended = true;
  h.moves = 0;
  h.statuses = [];
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
function setupWerewolf(s, sc) {
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
