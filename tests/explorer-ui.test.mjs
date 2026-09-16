import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  act,
  createGame,
  updateRoomRule,
  updateTraitRule,
} from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = new URL(
  `../outputs/explorer-ui-${process.pid}.mjs`,
  import.meta.url,
);
await mkdir(new URL('../outputs/', import.meta.url), { recursive: true });
const built = await build({
  stdin: {
    contents: `export {default as Inventory} from './app/hero-inventory.jsx';
    export {default as Roster} from './app/faction-roster.jsx';
    export {default as Personal} from './app/personal-panel.jsx';
    export {default as Commands} from './app/explorer-actions.jsx';
    export {default as Supply} from './app/deck-supply.jsx';
    export {default as MapPawn} from './app/map-pawn.jsx';`,
    resolveDir: root,
  },
  absWorkingDir: root,
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react'],
});
await writeFile(bundle, built.outputFiles[0].contents);
after(() => unlink(bundle));
const { Inventory, Roster, Personal, Commands, Supply, MapPawn } = await import(
  bundle.href
);
const render = (Component, props) =>
  renderToStaticMarkup(createElement(Component, props));
const start = () => act(createGame('werewolf', 83, 3), { type: 'advance' });

test('map explorer tokens are buttons for the matching status sheet', () => {
  const hero = start().heroes[0];
  const html = render(MapPawn, { hero, active: true });
  assert.match(html, /<button/);
  assert.match(html, new RegExp(`查看${hero.name}的状态`));
  assert.match(html, /selected-pawn/);
  assert.match(html, /portraits/);
});

test('wolf personal and roster readouts share health tracks and show effective moonlight strength without human traits', () => {
  const game = act(createHauntPlaytest('werewolf', 23, 4), { type: 'advance' });
  const wolf = game.heroes.find((h) => h.traitor);
  const enemy = game.enemies.find((e) => e.heroId === wolf.id);
  const room = {
    hostId: 'host',
    you: 'wolf',
    seats: game.heroes.map((h) => (h.id === wolf.id ? 'wolf' : 'host')),
  };
  const personal = render(Personal, {
    game,
    net: { room },
    send() {},
    changes: [],
  });
  assert.match(personal, new RegExp(`生命当前${enemy.hp}/${enemy.maxHp}`));
  assert.doesNotMatch(personal, /理智当前|知识当前|力量当前/);
  const roster = render(Roster, { game, net: { room }, changes: [] });
  assert.match(roster, /trait-health/);
  assert.doesNotMatch(roster, /理智当前|知识当前/);
});

test('personal tracks and room commands render the current effective rules', () => {
  let game = start();
  game = updateTraitRule(game, {
    id: 'ui-speed-name',
    sourceId: 'scenario',
    heroId: game.active,
    trait: 'speed',
    patch: { label: '疾行' },
  });
  game = updateRoomRule(game, {
    id: 'ui-room-target',
    sourceId: 'scenario',
    roomId: game.heroes[game.active].pos,
    patch: { target: 'seal' },
  });
  game.phase = 'haunt';
  const net = { room: null, busy: false },
    personal = render(Personal, { game, net, send() {}, changes: [] }),
    commands = render(Commands, {
      game,
      net,
      send() {},
      waiting: false,
      moving: false,
    });
  assert.match(personal, /疾行/);
  assert.match(commands, /封印祭坛/);
});

test('inventory slots retain distinct item names and accessible controls without opening all descriptions', () => {
  const game = start();
  game.heroes[0].items = ['coffee', 'bandage'];
  game.heroes[0].omens = ['locket'];
  const html = render(Inventory, { game, hero: game.heroes[0], slots: true });
  for (const name of ['浓缩咖啡', '止血绷带', '银色吊坠'])
    assert.match(html, new RegExp(name));
  assert.equal((html.match(/aria-expanded="false"/g) || []).length, 3);
  assert.doesNotMatch(html, /carried-card-content|inventory-popover/);
  assert.match(html, /slot-omen/);
  assert.match(html, /empty-slot/);
});

test('roster remains inspectable while an action is pending and does not expose hidden enemy data', () => {
  const game = act(createHauntPlaytest('mirror', 13, 6), { type: 'advance' });
  game.enemies.push({
    ...game.enemies[0],
    id: 'hidden-test',
    name: '隐形测试敌人',
    hidden: true,
  });
  const html = render(Roster, {
    game,
    net: {},
    waiting: true,
    pending: { kind: 'card' },
    changes: [],
  });
  assert.equal((html.match(/class="party-member /g) || []).length >= 6, true);
  assert.match(html, /尚未现形/);
  assert.doesNotMatch(html, /隐形测试敌人/);
  assert.doesNotMatch(
    html.slice(html.indexOf('class="party-member member-unknown"')),
    /monster-health/,
  );
  assert.doesNotMatch(html, /disabled=""/);
  assert.doesNotMatch(html, /carried-card-content/);
});

test('a LAN wolf player cannot see good explorer inventory in either the belt or roster summary', () => {
  const game = act(createHauntPlaytest('werewolf', 23, 4), { type: 'advance' });
  const wolf = game.heroes.find((h) => h.traitor);
  const good = game.heroes.find((h) => !h.traitor);
  good.items = ['coffee'];
  const room = {
    hostId: 'host',
    you: 'wolf',
    seats: game.heroes.map((h) => (h.id === wolf.id ? 'wolf' : 'host')),
  };
  const html = render(Inventory, { game, hero: good, room, slots: true });
  assert.match(html, /未公开或已停用/);
  assert.doesNotMatch(html, /浓缩咖啡|item-slot/);
  const roster = render(Roster, {
    game,
    net: { room, session: {} },
    changes: [],
  });
  assert.doesNotMatch(roster, /member-stats|浓缩咖啡/);
});

test('personal controls preserve a full-track request and disable ending another LAN player turn', () => {
  const game = start();
  const room = { hostId: 'host', you: 'guest', seats: ['host', 'guest', null] };
  const html = render(Personal, {
    game,
    net: { room },
    send() {},
    changes: [],
    onActions() {},
  });
  assert.equal((html.match(/class="trait-track"/g) || []).length, 4);
  assert.match(
    html,
    new RegExp(
      `力量当前${game.heroes[1].tracks.might[game.heroes[1].stats.might]}`,
    ),
  );
  assert.match(html, /等待队友行动/);
  assert.doesNotMatch(html, /亮格 · 当前|下划线 · 起始/);
  assert.match(html, /class="finish-turn" disabled=""/);
});

test('contextual commands expose room actions without scenario narration or deck counts', () => {
  const game = act(createHauntPlaytest('werewolf', 23, 4, 'treatment'), {
    type: 'advance',
  });
  const hero = game.heroes[game.active];
  hero.statuses = [{ id: 'infection', turns: 3 }];
  const html = render(Commands, { game, net: {}, send() {}, waiting: false });
  assert.match(html, /治疗/);
  assert.doesNotMatch(html, /牌堆|狼群获胜|感染与胜负规则|CHAPTER/);
  const blocked = render(Commands, { game, net: {}, send() {}, waiting: true });
  assert.match(blocked, /disabled=""/);
});

test('supply panel exposes all four decks and restricts round completion to the host', () => {
  const game = start();
  const guest = render(Supply, {
    game,
    net: { session: {}, room: { you: 'guest', hostId: 'host' } },
    onEndRound() {},
  });
  for (const name of ['房间', '事件', '物品', '预兆'])
    assert.match(guest, new RegExp(name));
  assert.match(guest, /disabled=""/);
  const host = render(Supply, { game, net: {}, onEndRound() {} });
  assert.doesNotMatch(host, /disabled=""/);
});
