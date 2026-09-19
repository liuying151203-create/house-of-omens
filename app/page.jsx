'use client';
import EnemyGlyph from './enemy-glyph';
import MapPawn from './map-pawn';
import Traits from './attribute-tracks';
import LobbyScreen from './lobby-screen';
import {
  useState,
  useLayoutEffect,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useSyncExternalStore,
  createContext,
  useContext,
} from 'react';
import {
  ArrowRight,
  BookOpen,
  Bell,
  Eye,
  Waves,
  Compass,
  DoorOpen,
  Volume2,
  VolumeX,
  CircleHelp,
  RotateCcw,
  RotateCw,
  Check,
  Sparkles,
  Skull,
  Ghost,
  Save,
  Flame,
  Clock,
  Plus,
  Minus,
  Layers,
  Package,
  ArrowUpDown,
  Dices,
  Library,
  Users,
  Maximize,
  X,
  Settings2,
  FlaskConical,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  SCENARIOS,
  FLOORS,
  ROOM_DECK,
  DIRS,
  createGame,
  act,
  actions,
  living,
  pending,
  frontiers,
  roomPlacementOptions,
  roomAt,
  doorsOf,
  restoreGameSave,
} from '@/lib/game-engine.mjs';
import Workshop from './workshop';
import PersonalPanel from './personal-panel';
import { mapScrollTarget, preserveMapScroll } from '../lib/map-camera.mjs';
import {
  explorationScope,
  selectExploration,
} from '../lib/exploration-preview.mjs';
import RoomStatusIcons from './room-status-icons';
import CardNotice from './card-notice';
import WerewolfPanel from './werewolf-panel';
import ExplorerActions from './explorer-actions';
import DeckSupply from './deck-supply';
import FactionRoster from './faction-roster';
import AttributeFeedback, { useAttributeChanges } from './attribute-feedback';
import {
  hauntCardRule,
  publicEnemies,
  canInspectHero,
  heroController,
  isHeroMine,
} from '../lib/game-view.mjs';
import { moonlit, windowsOf } from '../lib/werewolf.mjs';
import { roomRuleView, traitRuleView } from '../lib/rule-views.mjs';
import { eventJournalEntries } from '../lib/event-journal.mjs';
import DiceRequest from './dice-request';
import EnemyMotion, { useEnemyMotion } from './enemy-motion';
import { resolveCard as cardDefinition } from '../lib/card-rules.mjs';
import DamagePlanner from './damage-planner';
import { useNetwork, NetworkLobby, networkStatusLabel } from './network';
import PlaytestControls from './playtest-controls';
import {
  createHauntPlaytest,
  saveKeyFor,
  NORMAL_SAVE_KEY,
  PLAYTEST_SAVE_KEY,
} from '../lib/playtest.mjs';
const MotionContext = createContext(true);
let storageUnavailable = false;
function subscribeSave(listener) {
  window.addEventListener('storage', listener);
  window.addEventListener('house-save', listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener('house-save', listener);
  };
}
function readSave() {
  try {
    return storageUnavailable
      ? 'unavailable'
      : localStorage.getItem(NORMAL_SAVE_KEY);
  } catch {
    return 'unavailable';
  }
}
function readPlaytestSave() {
  try {
    return localStorage.getItem(PLAYTEST_SAVE_KEY);
  } catch {
    return null;
  }
}
const serverSave = () => null;
const iconMap = {
    mystery: Compass,
    werewolf: Flame,
    bells: Bell,
    mirror: Eye,
    flood: Waves,
  },
  cardIcons = { event: Sparkles, item: Package, omen: Eye };
const targetLabels = {
  moonSeal: '月印',
  moonRitual: '解咒入口',
  seal: '祭坛',
  mirror: '古镜',
  fuse: '保险丝',
  generator: '发电机',
};
const atlas = (t) => ({
  backgroundImage: 'url(./rooms.png)',
  backgroundSize: '300% 300%',
  backgroundPosition: `${(t % 3) * 50}% ${Math.floor(t / 3) * 50}%`,
});
function TileFace({ tile, rotation = tile.rotation || 0 }) {
  const CardIcon = cardIcons[tile.icon];
  return (
    <>
      {windowsOf({ ...tile, rotation }).map((d) => (
        <span
          key={'window' + d}
          className={'tile-window window-' + d}
          title="窗户"
        />
      ))}
      <span
        className="tile-art"
        style={{ ...atlas(tile.art), transform: `rotate(${rotation * 90}deg)` }}
      />
      <span className="tile-frame" />
      {doorsOf(tile, rotation).map((d) => (
        <span key={d} className={'tile-door door-' + d} />
      ))}
      <span className="room-name">{tile.name}</span>
      {CardIcon && (
        <span
          className={'tile-card-icon icon-' + tile.icon}
          title={
            { event: '事件房间', item: '物品房间', omen: '预兆房间' }[tile.icon]
          }
          aria-label={
            { event: '事件房间', item: '物品房间', omen: '预兆房间' }[tile.icon]
          }
        >
          <CardIcon size={15} />
        </span>
      )}
      {[
        'stairs',
        'upper',
        'stairsDown',
        'basement',
        'elevator',
        'collapse',
      ].includes(tile.special) && (
        <ArrowUpDown
          className="stairs-symbol"
          size={17}
          aria-label="上下楼通道"
        />
      )}
    </>
  );
}
function Dice({ dice, label, presented = false }) {
  const animate = useContext(MotionContext);
  return (
    <div
      className={
        'dice-group ' +
        (animate && !presented ? 'dice-animated' : 'dice-static')
      }
    >
      {label && <span>{label}</span>}
      <div className="dice-row">
        {dice.map((n, i) => (
          <span
            className="die"
            key={i}
            style={{ animationDelay: `${i * 65}ms` }}
            aria-label={n + '点'}
          >
            {n === 0 ? '—' : n === 1 ? '●' : '● ●'}
          </span>
        ))}
      </div>
    </div>
  );
}
function Prompt({
  game,
  send,
  locked = false,
  diceMotion,
  toggleDice,
  net,
  autoRoll,
  toggleAuto,
  testTools,
}) {
  const p = pending(game);
  if (!p || p.kind === 'placement') return null;
  if (p.kind === 'diceRequest')
    return (
      <DiceRequest
        key={p.uid}
        game={game}
        send={send}
        net={net}
        motion={diceMotion}
        toggleMotion={toggleDice}
        autoRoll={autoRoll}
        toggleAuto={toggleAuto}
        testTools={testTools}
      />
    );
  const tile =
      p.kind === 'placement' ? ROOM_DECK.find((t) => t.id === p.tileId) : null,
    c =
      p.kind === 'card'
        ? cardDefinition(game, p.cardType, p.cardId, p.heroId)
        : null,
    h = p.heroId !== undefined ? game.heroes[p.heroId] : null,
    CardIcon = cardIcons[p.cardType] || Sparkles;
  const kindLabels = {
    intro: '探索开始',
    placement: '抽取房间',
    card: '翻开卡牌',
    cardResult: '效果结算',
    hauntRoll: '预兆 · 作祟检定',
    hauntResult: '作祟检定结果',
    haunt: 'THE HAUNT BEGINS',
    damage: '伤害分配',
    combat: '攻击与防御',
    enemyTurn: '敌人回合',
    trait: '属性变化',
    floor: '楼层连通',
    reveal: '真身现形',
    check: '目标检定',
    roundStart: '新回合 · 全队准备',
    damageResult: '伤害结算',
    choiceRequest: '等待你的决定',
    privateRequest: '等待其他玩家',
  };
  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent
        key={p.uid}
        className={
          'story-dialog prompt-dialog ' +
          (p.kind === 'haunt' ? 'haunt-cinematic ' : '') +
          (p.kind === 'card' ? 'flip-card ' : '') +
          ('prompt-' + p.kind)
        }
        showCloseButton={false}
      >
        {p.dice && (
          <button className="text-button prompt-motion" onClick={toggleDice}>
            <Dices size={14} />
            骰子动画：{diceMotion ? '开' : '关'}
          </button>
        )}
        {locked && (
          <output className="prompt-wait">
            等待负责此角色的玩家或房主确认…
          </output>
        )}
        <fieldset className="prompt-fields" disabled={locked}>
          {p.kind === 'haunt' && (
            <div className="haunt-rings" aria-hidden="true" />
          )}
          <span className="eyebrow">{kindLabels[p.kind] || '宅邸手记'}</span>
          {p.kind === 'haunt' ? (
            <Bell className="haunt-bell" size={58} />
          ) : p.kind === 'card' ? (
            <CardIcon className={'card-emblem icon-' + p.cardType} size={37} />
          ) : null}
          <DialogTitle>
            {p.kind === 'haunt' ? (
              <>
                作祟，降临。
                <small>
                  {SCENARIOS.find((s) => s.id === game.scenario).title}
                </small>
              </>
            ) : (
              c?.title || p.title
            )}
          </DialogTitle>
          <DialogDescription className={p.rollReceipt ? 'sr-only' : undefined}>
            {c
              ? c.story
              : p.kind === 'placement'
                ? `${FLOORS.find((f) => f.id === p.floor).name} · 来自「${roomAt(game, p.from).name}」的${DIRS[p.dir].name}侧门。请选择朝向，然后放置。`
                : p.rollReceipt
                  ? p.title
                  : p.text}
          </DialogDescription>
          {tile && (
            <>
              <div className="placement-tile">
                <TileFace tile={tile} rotation={p.rotation} />
              </div>
              <div className="placement-details">
                <span>
                  允许楼层：
                  {tile.floors
                    .map((id) => FLOORS.find((f) => f.id === id).name)
                    .join(' / ')}
                </span>
                <span>
                  {tile.icon
                    ? `房间图标：${{ event: '事件', item: '物品', omen: '预兆' }[tile.icon]}，落位后抽卡`
                    : '没有抽卡图标，可以继续移动'}
                </span>
                <span className="placement-valid">
                  <Check size={15} />
                  入口门已接上 · {p.options.length}个可用朝向 · 当前
                  {p.rotation * 90}°
                </span>
                {p.options.find((o) => o.rotation === p.rotation)?.blocked >
                  0 && (
                  <span>
                    其他相邻门无法全部对齐，将视为封闭门；入口始终连通。
                  </span>
                )}
              </div>
              <button
                className="secondary-button rotate-button"
                disabled={p.options.length < 2}
                onClick={() => send({ type: 'rotate' })}
              >
                <RotateCw size={17} />
                切换合法朝向
              </button>
            </>
          )}
          {c && (
            <div className="card-rules">
              {p.cardType === 'event' ? (
                c.trait ? (
                  <>
                    <strong>
                      {
                        traitRuleView(game, game.heroes[p.heroId], c.trait)
                          .label
                      }
                      检定 · 目标 {c.threshold}+
                    </strong>
                    <p>成功：{c.success.text}</p>
                    <p>失败：{c.failure.text}</p>
                  </>
                ) : (
                  <p>{c.effect.text}</p>
                )
              ) : (
                <p>{c.effect}</p>
              )}
              {hauntCardRule(c, game) && (
                <div className="haunt-card-rule">
                  <strong>☾ 作祟能力已解锁</strong>
                  <p>{hauntCardRule(c, game)}</p>
                </div>
              )}
              {c.explorationText && (
                <p className="exploration-rule">{c.explorationText}</p>
              )}
              <span className="card-owner">
                由 {h.name} 结算 ·{' '}
                {c.stopsMovement ? '抽卡后本回合停止移动' : '此牌不停止移动'}
              </span>
            </div>
          )}
          {p.rollReceipt && (
            <div className="resolved-rolls">
              {p.rollReceipt.rolls.map((r) => (
                <Dice
                  key={r.id}
                  presented={true}
                  dice={r.dice}
                  label={`${r.label || '属性骰'}${r.bonus ? ' · 加值 +' + r.bonus : ''}`}
                />
              ))}
            </div>
          )}
          {!p.rollReceipt && p.dice && (
            <Dice
              presented={p.dicePresented}
              dice={p.dice}
              label={p.defenseDice ? '你的攻击骰' : null}
            />
          )}{' '}
          {!p.rollReceipt && p.defenseDice && (
            <Dice
              presented={p.dicePresented}
              dice={p.defenseDice}
              label="敌人的防御骰"
            />
          )}
          {p.total !== undefined && (
            <div
              className={
                'roll-total ' + (p.triggers || p.success ? 'roll-success' : '')
              }
            >
              总点数 <strong>{p.total}</strong>
              {p.threshold && <span> / 目标 {p.threshold}</span>}
            </div>
          )}
          {p.rollReceipt && (
            <output className="inline-roll-result">
              <p>{p.rollReceipt.text || p.text}</p>
            </output>
          )}
          {p.changes?.length > 0 && (
            <div className="attribute-changes">
              {p.changes.map((t, i) => (
                <span key={i}>
                  <ArrowUpDown size={15} />
                  {t}
                </span>
              ))}
            </div>
          )}
          {p.skipHint && (
            <div className="skip-haunt">
              <Check size={20} />
              <span>{p.skipHint}</span>
            </div>
          )}
          {p.kind === 'roundStart' && (
            <div className="round-roster">
              {living(game).map((h) => (
                <span key={h.id} style={{ color: h.color }}>
                  {h.name}
                  <b>{h.moves} 移动</b>
                </span>
              ))}
            </div>
          )}
          {p.kind === 'damage' && (
            <DamagePlanner key={p.uid} game={game} p={p} send={send} />
          )}
          {p.kind === 'choiceRequest' && (
            <div className="reaction-options">
              {p.options.map((option) => (
                <button
                  className="secondary-button"
                  key={option.value}
                  onClick={() =>
                    send({
                      type: 'resolveChoice',
                      requestId: p.uid,
                      choice: option.value,
                    })
                  }
                >
                  <strong>{option.label}</strong>
                  {option.detail && <small>{option.detail}</small>}
                </button>
              ))}
            </div>
          )}
          {p.kind === 'haunt' && (
            <>
              <div className="haunt-objective">
                <strong>你的新目标</strong>
                <p>{p.objective}</p>
                <ul>
                  {p.targets.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <span>剩余 {p.remaining} 回合 · 地图已标记目标</span>
              </div>
              <p className="haunt-warning">
                从现在起，敌人将在回合结束时行动。
                <br />
                任意属性降到骷髅位，角色都会死亡。
              </p>
            </>
          )}
          {!['damage', 'choiceRequest'].includes(p.kind) && (
            <button
              className="gold-button"
              onClick={() =>
                send(
                  ['card', 'roomFall'].includes(p.kind)
                    ? {
                        type:
                          p.kind === 'card' ? 'continueCard' : 'continueRoom',
                        requestId: p.uid,
                      }
                    : { type: tile ? 'place' : 'advance' },
                )
              }
            >
              {tile
                ? '放置房间并进入'
                : p.kind === 'card'
                  ? c.trait && p.cardType === 'event'
                    ? '掷骰并查看结果'
                    : p.cardType === 'event'
                      ? '应用并继续'
                      : '收下并继续'
                  : p.kind === 'roomFall'
                    ? '掷骰，查看伤害'
                    : p.kind === 'hauntRoll'
                      ? '掷骰，试探黑暗'
                      : p.kind === 'hauntResult' && p.triggers
                        ? '揭开作祟剧本'
                        : p.kind === 'haunt'
                          ? '我已了解，面对作祟'
                          : p.rollReceipt
                            ? '收起结果，继续'
                            : '确认并继续'}
              <ArrowRight size={18} />
            </button>
          )}
        </fieldset>
        {testTools}
      </DialogContent>
    </Dialog>
  );
}
function FloorPeople({ game, f, onInspect, room }) {
  return (
    <fieldset className="floor-party" aria-label={f.name + '的人物'}>
      {game.heroes
        .filter(
          (h) => !h.dead && !h.traitor && roomAt(game, h.pos).floor === f.id,
        )
        .map((h) => (
          <MapPawn
            key={h.id}
            hero={h}
            active={h.id === game.active}
            className={
              'floor-hero ' + (h.id === game.active ? 'floor-hero-active' : '')
            }
            badge={
              h.statuses?.find((status) => status.id === 'infection')?.turns
            }
            onInspect={onInspect}
            mine={isHeroMine(room, h.id)}
            playerName={heroController(room, h.id)?.name}
          />
        ))}
      {publicEnemies(game)
        .filter((e) => roomAt(game, e.pos)?.floor === f.id)
        .map((e) => (
          <button
            type="button"
            className="floor-hero floor-enemy"
            key={e.id}
            title={e.name + ' · ' + f.name}
            aria-label={'查看' + e.name + '的状态，位于' + f.name}
            onClick={() => onInspect?.('enemy-' + e.id)}
          >
            {<EnemyGlyph enemy={e} />}
          </button>
        ))}
    </fieldset>
  );
}
function Board({
  game,
  send,
  zoom,
  setZoom,
  locked = false,
  enemyMotion,
  onInspect,
  room,
}) {
  const [snapped, setSnapped] = useState(false);
  const [explorationPreview, setExplorationPreview] = useState(null);
  const cameraLayout = useRef(null);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const currentPlacement =
    pending(game)?.kind === 'placement' ? pending(game) : null;
  const placement = currentPlacement?.destinations
    ? {
        ...currentPlacement,
        options: roomPlacementOptions(
          currentPlacement.destinations,
          currentPlacement,
        ),
      }
    : currentPlacement;
  const tile = placement
    ? ROOM_DECK.find((t) => t.id === placement.tileId)
    : null;
  const ref = useRef(null),
    hero = game.heroes[game.active],
    legal = locked ? { move: [], explore: [] } : actions(game),
    floor = game.viewFloor;
  const previewContext = `${floor}:${hero.id}:${hero.pos}`;
  const [previousPreviewContext, setPreviousPreviewContext] =
    useState(previewContext);
  if (previousPreviewContext !== previewContext) {
    setPreviousPreviewContext(previewContext);
    setExplorationPreview(null);
  }
  const rooms = game.rooms.filter((r) => r.floor === floor),
    allFrontiers = placement?.destinations
      ? placement.destinations.filter((d) => d.floor === floor)
      : frontiers(game, floor),
    cells = [...rooms, ...allFrontiers];
  const minX = Math.min(...cells.map((r) => r.x)) - 1,
    maxX = Math.max(...cells.map((r) => r.x)) + 1,
    minY = Math.min(...cells.map((r) => r.y)) - 1,
    maxY = Math.max(...cells.map((r) => r.y)) + 1,
    cols = maxX - minX + 1,
    rows = maxY - minY + 1;
  const focusId = enemyMotion?.frame?.pos || hero.pos;
  const focus =
    rooms.find((r) => r.id === focusId) ||
    rooms.find((r) => r.starter) ||
    rooms[0];
  const focusX = Number(focus.x),
    focusY = Number(focus.y);
  const fitNext = useRef(false);
  const cameraOverview = useRef(false);
  const centerMap = useCallback(
    (overview = false, behavior = 'instant') => {
      const viewport = ref.current;
      if (!viewport) return;
      cameraOverview.current = overview;
      const width = viewport.clientWidth,
        height = viewport.clientHeight;
      viewport.querySelector('.modular-map').style.padding =
        `${height}px ${width}px`;
      const point = overview
        ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
        : { x: focusX, y: focusY };
      viewport.scrollTo({
        ...mapScrollTarget({ point, minX, minY, zoom, width, height }),
        behavior,
      });
    },
    [minX, maxX, minY, maxY, focusX, focusY, zoom],
  );
  const motionPosition = enemyMotion?.frame?.pos;
  useLayoutEffect(() => {
    const viewport = ref.current;
    const previous = cameraLayout.current;
    if (
      !previous ||
      previous.floor !== floor ||
      previous.zoom !== zoom ||
      previous.roomMotion !== game.roomMotion?.uid ||
      fitNext.current ||
      (motionPosition && previous.motionPosition !== motionPosition)
    ) {
      centerMap(fitNext.current);
    } else {
      viewport.scrollTo({
        ...preserveMapScroll({
          left: viewport.scrollLeft,
          top: viewport.scrollTop,
          previous,
          minX,
          minY,
          zoom,
        }),
        behavior: 'instant',
      });
    }
    fitNext.current = false;
    cameraLayout.current = {
      floor,
      zoom,
      minX,
      minY,
      motionPosition,
      roomMotion: game.roomMotion?.uid,
    };
  }, [
    centerMap,
    floor,
    zoom,
    minX,
    minY,
    motionPosition,
    game.roomMotion?.uid,
  ]);
  useEffect(() => {
    const viewport = ref.current;
    let width = viewport.clientWidth,
      height = viewport.clientHeight;
    const observer = new ResizeObserver(() => {
      if (width === viewport.clientWidth && height === viewport.clientHeight)
        return;
      width = viewport.clientWidth;
      height = viewport.clientHeight;
      centerMap(cameraOverview.current);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [centerMap]);
  useEffect(() => {
    const cancel = (event) => {
      if (event.key === 'Escape') setExplorationPreview(null);
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);
  return (
    <>
      <div className="map-navigation">
        <div className="map-camera-dock">
          <fieldset className="map-camera-tools">
            <legend className="sr-only">地图视角工具</legend>
            <button
              className="secondary-button"
              aria-label="回到人物"
              title="回到人物"
              onClick={() => {
                const heroFloor = roomAt(game, hero.pos).floor;
                if (floor !== heroFloor)
                  send({ type: 'viewFloor', floor: heroFloor });
                else centerMap(false, 'smooth');
              }}
            >
              <Compass size={18} />
            </button>
            <button
              className="secondary-button"
              aria-label="全图"
              title="全图"
              onClick={() => {
                const size = Math.max(
                  4,
                  Math.min(
                    110,
                    (ref.current.clientWidth - 30) / (cols + (cols - 1) / 11),
                    (ref.current.clientHeight - 250) / (rows + (rows - 1) / 11),
                  ),
                );
                fitNext.current = true;
                setZoom(size);
                if (size === zoom) {
                  centerMap(true);
                  fitNext.current = false;
                }
              }}
            >
              <Maximize size={18} />
            </button>
            <button
              aria-label="缩小地图"
              title={`缩小地图 · 当前 ${Math.round((zoom / 110) * 100)}%`}
              className="icon-button"
              disabled={zoom <= 30}
              onClick={() => setZoom((z) => Math.max(30, z - 15))}
            >
              <Minus size={16} />
            </button>
            <button
              aria-label="放大地图"
              title={`放大地图 · 当前 ${Math.round((zoom / 110) * 100)}%`}
              className="icon-button"
              disabled={zoom >= 155}
              onClick={() => setZoom((z) => Math.min(155, z + 15))}
            >
              <Plus size={16} />
            </button>
          </fieldset>
        </div>
        <Tabs
          value={String(floor)}
          onValueChange={(v) => send({ type: 'viewFloor', floor: Number(v) })}
          className="floor-tabs"
        >
          <TabsList>
            {FLOORS.map((f) => (
              <TabsTrigger value={String(f.id)} key={f.id}>
                <span className="floor-title">
                  <Layers size={14} />
                  {f.name}
                  <small>
                    {game.rooms.filter((r) => r.floor === f.id).length}
                  </small>
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="floor-occupants" aria-label="各楼层人物与敌人">
            {FLOORS.map((f) => (
              <FloorPeople
                key={f.id}
                game={game}
                f={f}
                onInspect={onInspect}
                room={room}
              />
            ))}
          </div>
          {FLOORS.map((f) => (
            <TabsContent value={String(f.id)} key={f.id}>
              {f.id === -1 && !game.basementUnlocked ? (
                <div className="floor-hint">
                  地下室尚未连通。在一楼探索，寻找「地下阶梯」。
                </div>
              ) : (
                <div className="floor-hint">
                  {roomAt(game, hero.pos).floor === f.id
                    ? ''
                    : `正在查看${f.name} · ${hero.name}位于${FLOORS.find((f) => f.id === roomAt(game, hero.pos).floor).name}`}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
      <div
        className={
          'map-viewport ' + (game.phase === 'haunt' ? 'haunted-map' : '')
        }
        ref={ref}
        onPointerDown={(e) => {
          if (e.button !== 0 || e.target.closest('.room-status-icons')) return;
          suppressClick.current = false;
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            left: e.currentTarget.scrollLeft,
            top: e.currentTarget.scrollTop,
            moving: false,
          };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          if (!drag.current.moving) {
            if (
              Math.hypot(
                e.clientX - drag.current.x,
                e.clientY - drag.current.y,
              ) < 6
            )
              return;
            drag.current.moving = true;
            e.currentTarget.setPointerCapture(e.pointerId);
          }
          e.currentTarget.scrollLeft =
            drag.current.left + drag.current.x - e.clientX;
          e.currentTarget.scrollTop =
            drag.current.top + drag.current.y - e.clientY;
        }}
        onPointerUp={() => {
          if (drag.current?.moving) suppressClick.current = true;
          drag.current = null;
        }}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
            suppressClick.current = false;
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div
          className={'modular-map ' + (zoom < 55 ? 'overview-map' : '')}
          style={{
            gap: zoom / 11,
            gridTemplateColumns: `repeat(${cols},${zoom}px)`,
            gridTemplateRows: `repeat(${rows},${zoom}px)`,
          }}
        >
          <span className="map-north">↑ 北</span>
          {enemyMotion?.frame &&
            (() => {
              const step = enemyMotion.frame;
              const at = roomAt(game, step.pos),
                from = roomAt(game, step.from);
              if (at.floor !== floor) return null;
              const sameFloor = at.floor === from.floor;
              return (
                <span
                  key={enemyMotion.stepKey}
                  className="travelling-enemy"
                  aria-label={step.name + '移动到' + at.name}
                  style={{
                    gridColumn: at.x - minX + 1,
                    gridRow: at.y - minY + 1,
                    '--step-x': sameFloor
                      ? (from.x - at.x) * (zoom + zoom / 11) + 'px'
                      : '0px',
                    '--step-y': sameFloor
                      ? (from.y - at.y) * (zoom + zoom / 11) + 'px'
                      : '0px',
                  }}
                >
                  {<EnemyGlyph enemy={step} />}
                </span>
              );
            })()}
          {rooms.map((r) => {
            const occupants = game.heroes.filter(
                (h) => h.pos === r.id && !h.dead && !h.traitor,
              ),
              enemies = publicEnemies(game).filter(
                (e) => e.pos === r.id && e.id !== enemyMotion?.frame?.enemyId,
              ),
              here = hero.pos === r.id,
              roomView = roomRuleView(game, r, hero.id);
            return (
              <div
                className={
                  'room-cell ' +
                  (game.roomMotion?.roomId === r.id
                    ? 'room-arrival room-arrival-' + game.roomMotion.kind
                    : '')
                }
                key={
                  r.id +
                  '-' +
                  (game.roomMotion?.roomId === r.id ? game.roomMotion.uid : '')
                }
                style={{ gridColumn: r.x - minX + 1, gridRow: r.y - minY + 1 }}
              >
                <button
                  data-current={here}
                  data-motion={enemyMotion?.frame?.pos === r.id}
                  disabled={!legal.move.includes(r.id)}
                  onClick={() => send({ type: 'move', pos: r.id })}
                  className={
                    'modular-room ' +
                    (here ? 'current ' : '') +
                    (legal.move.includes(r.id) ? 'reachable ' : '') +
                    (roomView.target ? 'quest-room ' : '') +
                    (moonlit(game, roomView) ? 'moonlit-room' : '')
                  }
                  title={`${roomView.name}${moonlit(game, roomView) ? ' · 月光：狼人力量 +1，可封窗解除' : roomView.states?.boarded ? ' · 已封窗：无月光加成' : ''}`}
                  aria-label={`${roomView.name}${here ? '，当前位置' : ''}${legal.move.includes(r.id) ? '，可经门移动' : ''}`}
                >
                  <TileFace tile={roomView} />
                </button>
                <span className="room-tokens">
                  {occupants.map((h) => (
                    <MapPawn
                      key={h.id}
                      hero={h}
                      active={h.id === game.active}
                      onInspect={onInspect}
                      mine={isHeroMine(room, h.id)}
                      playerName={heroController(room, h.id)?.name}
                    />
                  ))}
                  {enemies.map((e) => (
                    <button
                      type="button"
                      className="enemy-pawn"
                      key={e.id}
                      title={e.name + ' ' + e.hp + '/' + e.maxHp}
                      aria-label={'查看' + e.name + '的状态'}
                      onPointerDown={(event) => event.stopPropagation()}
                      onPointerUp={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        onInspect?.('enemy-' + e.id);
                      }}
                    >
                      <EnemyGlyph enemy={e} size={16} />
                    </button>
                  ))}
                </span>
                <RoomStatusIcons game={game} room={r} />
              </div>
            );
          })}
          {[
            ...new Map(allFrontiers.map((f) => [`${f.x},${f.y}`, f])).values(),
          ].map((f) => {
            const isPlacement =
              placement &&
              placement.floor === floor &&
              placement.x === f.x &&
              placement.y === f.y;
            const destination = placement?.destinations?.find(
              (d) => d.floor === floor && d.x === f.x && d.y === f.y,
            );
            const choice = legal.explore.find(
              (e) => e.floor === floor && e.x === f.x && e.y === f.y,
            );
            const previewing =
              choice &&
              explorationPreview?.scope === explorationScope(game) &&
              explorationPreview.x === f.x &&
              explorationPreview.y === f.y;
            return (
              <button
                className={
                  'frontier-cell ' +
                  (previewing ? 'exploration-preview ' : '') +
                  (choice || destination ? 'active-frontier' : '') +
                  (isPlacement
                    ? ' placement-ghost ' + (snapped ? 'snapped' : '')
                    : '')
                }
                key={`${f.x},${f.y}`}
                style={{ gridColumn: f.x - minX + 1, gridRow: f.y - minY + 1 }}
                disabled={locked || (!choice && !isPlacement && !destination)}
                onDragOver={(e) => {
                  if (isPlacement) {
                    e.preventDefault();
                    setSnapped(true);
                    e.dataTransfer.dropEffect = 'move';
                  }
                }}
                onDrop={(e) => {
                  if (isPlacement) {
                    e.preventDefault();
                    setSnapped(true);
                  }
                }}
                onClick={() => {
                  if (isPlacement) {
                    setSnapped(true);
                    return;
                  }
                  if (destination) {
                    send({
                      type: 'roomDestination',
                      from: destination.from,
                      dir: destination.dir,
                    });
                    return;
                  }
                  const next = selectExploration(
                    game,
                    explorationPreview,
                    choice,
                  );
                  setExplorationPreview(next.preview);
                  if (next.action) send(next.action);
                }}
                aria-label={
                  choice
                    ? `${previewing ? '再次点击抽取房间，' : '预览探索位置，'}从${roomAt(game, choice.from).name}${DIRS[choice.dir].name}门探索新房间`
                    : destination
                      ? `选择${roomAt(game, destination.from).name}${DIRS[destination.dir].name}门为落点`
                      : '未探索的门外'
                }
              >
                {isPlacement ? (
                  <>
                    <TileFace tile={tile} rotation={placement.rotation} />
                  </>
                ) : (
                  <>
                    <Plus size={19} />
                    <span>
                      {destination
                        ? '选择落点'
                        : previewing
                          ? '再次点击抽取'
                          : choice
                            ? '探索'
                            : '未知'}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {placement && (
        <section
          className="placement-dock"
          key={placement.uid}
          aria-label="放置抽到的房间"
        >
          <div
            className="dock-tile"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', placement.tileId);
              e.dataTransfer.effectAllowed = 'move';
              setSnapped(false);
            }}
          >
            <TileFace tile={tile} rotation={placement.rotation} />
          </div>
          <div className="dock-copy">
            <span className="eyebrow">
              {placement.mode === 'elevator'
                ? '电梯停靠'
                : placement.mode === 'collapse'
                  ? '坍塌落点'
                  : '抽到房间'}{' '}
              · {FLOORS.find((f) => f.id === placement.floor).name}
            </span>
            <h3>{tile.name}</h3>
            {placement.destinations && (
              <div className="room-floor-choices" aria-label="选择落点楼层">
                {FLOORS.filter((f) =>
                  placement.destinations.some((d) => d.floor === f.id),
                ).map((f) => {
                  const target = placement.destinations.find(
                    (d) => d.floor === f.id,
                  );
                  return (
                    <button
                      key={f.id}
                      disabled={locked}
                      className="secondary-button"
                      aria-pressed={placement.floor === f.id}
                      onClick={() =>
                        send({
                          type: 'roomDestination',
                          from: target.from,
                          dir: target.dir,
                        })
                      }
                    >
                      {f.name}
                    </button>
                  );
                })}
              </div>
            )}
            {placement.text && <p>{placement.text}</p>}
            {placement.mode === 'collapse' && (
              <p>楼板断裂。选择亮起的门口安放地下室房间。</p>
            )}
            <p>
              从「{roomAt(game, placement.from).name}」的
              {DIRS[placement.dir].name}
              门接入。
            </p>
            <span className="placement-valid">
              入口门已接上 · 当前 {placement.rotation * 90}° ·{' '}
              {placement.options.length} 个合法朝向
            </span>
            {placement.options.find((o) => o.rotation === placement.rotation)
              ?.blocked > 0 && <small>其他未对齐的相邻门视为封闭门。</small>}
          </div>
          <div className="dock-actions">
            {placement.mode === 'elevator' && placement.total === 4 && (
              <button
                className="secondary-button"
                disabled={locked}
                onClick={() => send({ type: 'stayElevator' })}
              >
                留在原位
              </button>
            )}
            <button
              className="secondary-button"
              disabled={locked || placement.options.length < 2}
              onClick={() => send({ type: 'rotate' })}
            >
              <RotateCw size={16} />
              旋转朝向
            </button>
            {floor !== placement.floor && (
              <button
                className="secondary-button"
                onClick={() =>
                  send({ type: 'viewFloor', floor: placement.floor })
                }
              >
                返回放置楼层
              </button>
            )}
            <button
              className="gold-button"
              disabled={locked}
              onClick={() => {
                send({ type: 'place' });
                setSnapped(false);
              }}
            >
              {placement.mode === 'elevator'
                ? '确认停靠'
                : placement.mode === 'collapse'
                  ? '确认落点'
                  : '确认放置并进入'}
              <Check size={16} />
            </button>
          </div>
        </section>
      )}
      <div className="board-legend">
        <span>
          <i className="legend-gold" />
          门对门通行
        </span>
        <span>
          <Sparkles size={13} />
          剧本目标
        </span>
        <span>
          <Ghost size={13} />
          敌人
        </span>
        <span>
          {game.rooms.length} 间房 · 剩余 {game.decks.rooms.length} 张房间牌
        </span>
      </div>
    </>
  );
}
export default function Home() {
  const [game, setGame] = useState(null),
    [choice, setChoice] = useState('mystery'),
    [playtestFocus, setPlaytestFocus] = useState('basic'),
    [playtestEpoch, setPlaytestEpoch] = useState(0),
    [count, setCount] = useState(3),
    [help, setHelp] = useState(false),
    [confirm, setConfirm] = useState(null),
    [sound, setSound] = useState(false),
    [zoom, setZoom] = useState(110),
    [view, setView] = useState('game'),
    [diceMotion, setDiceMotion] = useState(true),
    [autoRoll, setAutoRoll] = useState(false),
    [panel, setPanel] = useState(null),
    [partyOpen, setPartyOpen] = useState(true),
    [storyOpen, setStoryOpen] = useState(true),
    [journalOpen, setJournalOpen] = useState(false);
  const [inspected, setInspected] = useState(null);
  const togglePanel = (name) =>
    setPanel((open) => (open === name ? null : name));
  const enemyMotion = useEnemyMotion(game, playtestEpoch);
  useEffect(() => {
    const close = (e) => {
      if (e.key === 'Escape') {
        setPanel(null);
        setPartyOpen(false);
        setStoryOpen(false);
        setJournalOpen(false);
        setInspected(null);
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  const net = useNetwork(setGame);
  const netRef = useRef(net);
  useEffect(() => {
    netRef.current = net;
  }, [net]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const timer = setTimeout(() => {
      if (
        params.get('network') === 'remote' &&
        /^[A-Z0-9]{6}$/.test(params.get('join')?.toUpperCase() || '')
      )
        setView('network');
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const attributeFeedback = useAttributeChanges(game);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        setDiceMotion(
          localStorage.getItem('hillhouse-dice-motion-v2') !== 'off',
        );
        setAutoRoll(localStorage.getItem('hillhouse-auto-roll') === 'on');
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  function toggleDice() {
    setDiceMotion((v) => {
      try {
        localStorage.setItem('hillhouse-dice-motion-v2', v ? 'off' : 'on');
      } catch {}
      return !v;
    });
  }
  function toggleAuto() {
    setAutoRoll((v) => {
      try {
        localStorage.setItem('hillhouse-auto-roll', v ? 'off' : 'on');
      } catch {}
      return !v;
    });
  }
  const rawSave = useSyncExternalStore(subscribeSave, readSave, serverSave),
    storageError = rawSave === 'unavailable';
  const saved = useMemo(() => {
    try {
      const s = restoreGameSave(JSON.parse(rawSave));
      return s && s.phase !== 'over' ? s : null;
    } catch {
      return null;
    }
  }, [rawSave]);
  const audio = useRef(null);
  const rawPlaytestSave = useSyncExternalStore(
    subscribeSave,
    readPlaytestSave,
    serverSave,
  );
  const savedPlaytest = useMemo(() => {
    try {
      const s = restoreGameSave(JSON.parse(rawPlaytestSave));
      return s && s.playtest?.mode === 'haunt' && s.phase !== 'over' ? s : null;
    } catch {
      return null;
    }
  }, [rawPlaytestSave]);
  useEffect(() => {
    if (game && !net.session) {
      try {
        localStorage.setItem(saveKeyFor(game), JSON.stringify(game));
      } catch {
        storageUnavailable = true;
      }
      window.dispatchEvent(new Event('house-save'));
    }
  }, [game, net.session]);
  useEffect(
    () => () => {
      audio.current?.close();
    },
    [],
  );
  const p = game ? pending(game) : null;
  useEffect(() => {
    if (sound && p?.kind === 'haunt' && audio.current) {
      const ctx = audio.current;
      [0, 0.7, 1.4].forEach((delay) => {
        const o = ctx.createOscillator(),
          g = ctx.createGain();
        o.frequency.value = 146.83;
        o.type = 'sine';
        g.gain.setValueAtTime(0, ctx.currentTime + delay);
        g.gain.linearRampToValueAtTime(0.09, ctx.currentTime + delay + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 2);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(ctx.currentTime + delay);
        o.stop(ctx.currentTime + delay + 2.1);
      });
    }
  }, [p?.uid, p?.kind, sound]);
  function toggleSound() {
    if (sound) {
      audio.current?.suspend();
      setSound(false);
      return;
    }
    try {
      if (!audio.current) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        audio.current = ctx;
        [55, 82.41, 110.13].forEach((hz, i) => {
          const o = ctx.createOscillator(),
            g = ctx.createGain();
          o.frequency.value = hz;
          g.gain.value = 0.014 / (i + 1);
          o.connect(g);
          g.connect(ctx.destination);
          o.start();
        });
      }
      audio.current.resume();
      setSound(true);
    } catch {
      setSound(false);
    }
  }
  function send(a) {
    if (enemyMotion.moving && a.type !== 'viewFloor') return;
    if (
      ![
        'viewFloor',
        'rotate',
        'select',
        'rollDice',
        'rollAll',
        'resolveDice',
      ].includes(a.type)
    )
      setPanel(null);
    if (net.session && a.type !== 'viewFloor') {
      if (
        (waiting &&
          !['rollDice', 'rollAll', 'wolfOrder'].includes(a.type) &&
          !(a.type === 'endRound' && net.room?.you === net.room?.hostId)) ||
        net.busy
      )
        return;
      void net.update({ type: 'action', action: a });
      return;
    }
    setGame((s) => act(s, a));
  }
  function restorePlaytest(next) {
    setGame(next);
    setPlaytestEpoch((v) => v + 1);
  }
  const sc = SCENARIOS.find((s) => s.id === (game?.scenario || choice)),
    Icon = iconMap[sc.id],
    remaining = game ? living(game).filter((h) => !h.ended).length : 0;
  const localPlayer = net.room?.players?.find(
      (player) => player.id === net.room.you,
    ),
    localHeroNames = game
      ? game.heroes
          .filter((hero) => isHeroMine(net.room, hero.id))
          .map((hero) => hero.name)
      : [];
  const waiting =
    !!net.room?.game &&
    (p && p.heroId === undefined
      ? net.room.you !== net.room.hostId
      : (net.room.seats[p?.heroId ?? game?.active] || net.room.hostId) !==
        net.room.you);
  useEffect(() => {
    if (!net.session || !p?.canResolveTimeout || !Number.isFinite(p.deadlineAt))
      return;
    const timer = setTimeout(
      () =>
        void netRef.current.update({
          type: 'action',
          action: { type: 'timeoutChoice', requestId: p.uid },
        }),
      Math.max(0, p.deadlineAt - Date.now()) + 50,
    );
    return () => clearTimeout(timer);
  }, [
    net.session,
    net.room?.revision,
    p?.uid,
    p?.deadlineAt,
    p?.canResolveTimeout,
  ]);
  return (
    <MotionContext.Provider value={diceMotion}>
      <main
        className={
          game
            ? 'app playing revision-two revision-three map-focus' +
              (view !== 'workshop' ? ' map-stage' : '')
            : 'app lobby revision-two revision-three'
        }
      >
        <header className="topbar">
          <button
            className="brand"
            onClick={() => (game ? setConfirm('menu') : null)}
            aria-label="预兆之屋主菜单"
          >
            <span className="brand-seal">
              <Flame size={20} />
            </span>
            <span>
              预兆之屋<small>HOUSE OF OMENS</small>
            </span>
          </button>
          <div className="top-center">
            {game ? (
              <>
                <span
                  className={
                    'phase-dot ' + (game.phase === 'explore' ? '' : 'red')
                  }
                />
                {game.phase === 'explore'
                  ? '探索阶段'
                  : game.phase === 'over'
                    ? '故事落幕'
                    : '作祟阶段'}
                <span className="divider" />第 {game.round} 回合
              </>
            ) : null}
          </div>
          {game && net.session && (
            <div
              className={`network-status network-status-${net.kind}`}
              title={`${net.kind === 'remote' ? '远程' : '局域网'}房间 ${net.room?.code || net.session.code} · ${networkStatusLabel(net.kind, net.connectionState)}`}
            >
              <Users size={16} />
              <span className="network-identity">
                <b>{localPlayer?.name || '你'}</b>
                <small>{localHeroNames.join('、') || '旁观中'}</small>
              </span>
              <span className="network-room">
                {net.room?.code || net.session.code} ·{' '}
                {networkStatusLabel(net.kind, net.connectionState)}
              </span>
              <span className="network-turn">
                {waiting ? '等待队友' : '轮到你'}
              </span>
              <button
                className="icon-button"
                aria-label="离开联机"
                title="离开联机"
                onClick={() => {
                  net.leave();
                  setView('network');
                }}
              >
                <DoorOpen size={16} />
              </button>
              {net.error && <output>{net.error}</output>}
            </div>
          )}
          {game?.playtest?.mode === 'haunt' && (
            <button
              className="top-test-toggle"
              aria-label="测试"
              aria-expanded={panel === 'test'}
              aria-controls="test-details"
              onClick={() => togglePanel('test')}
            >
              <FlaskConical size={19} />
              <span>测试</span>
            </button>
          )}
          {
            <button
              className="icon-button settings-toggle"
              aria-label="设置与菜单"
              aria-expanded={panel === 'settings'}
              onClick={() => togglePanel('settings')}
            >
              <Settings2 size={19} />
            </button>
          }
          <div className="top-actions" hidden={panel !== 'settings'}>
            {game?.playtest?.mode === 'haunt' && !net.session && (
              <button
                className="secondary-button top-text-button"
                onClick={() => {
                  restorePlaytest(
                    createHauntPlaytest(
                      game.scenario,
                      game.playtest.seed,
                      game.count,
                      game.playtest.focus || 'basic',
                    ),
                  );
                  setView('game');
                }}
                title="回到相同测试开局，清除本测试局的后续操作"
              >
                <RotateCcw size={16} />
                重置测试局
              </button>
            )}
            <button
              className="secondary-button top-text-button"
              onClick={() => setView(view === 'workshop' ? 'game' : 'workshop')}
            >
              <Library size={16} />
              素材室
            </button>
            {!game && (
              <button
                className="secondary-button top-text-button"
                onClick={() => setView('network')}
              >
                <Users size={16} />
                联机
              </button>
            )}
            <button
              className="icon-button"
              onClick={toggleDice}
              aria-pressed={diceMotion}
              aria-label={diceMotion ? '关闭骰子动画' : '开启骰子动画'}
              title={diceMotion ? '骰子动画：开' : '骰子动画：关'}
            >
              <Dices size={19} />
              <small>{diceMotion ? '开' : '关'}</small>
            </button>
            <button
              className="icon-button"
              onClick={toggleSound}
              aria-label={sound ? '关闭氛围音' : '开启氛围音'}
            >
              {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
            </button>
            <button
              className="icon-button"
              onClick={() => setHelp(true)}
              aria-label="玩法说明"
            >
              <CircleHelp size={19} />
            </button>
          </div>
        </header>
        {view === 'workshop' ? (
          <Workshop
            onClose={() => setView('game')}
            TileFace={TileFace}
            game={game}
          />
        ) : !game && (view === 'network' || net.session) ? (
          <NetworkLobby
            net={net}
            scenario={choice}
            count={count}
            onClose={() => setView('game')}
          />
        ) : !game ? (
          <LobbyScreen
            count={count}
            setCount={setCount}
            choice={choice}
            setChoice={setChoice}
            saved={saved}
            savedPlaytest={savedPlaytest}
            playtestFocus={playtestFocus}
            setPlaytestFocus={setPlaytestFocus}
            onStart={() => setGame(createGame(choice, Date.now(), count))}
            onContinue={(save) => {
              setChoice(save.automaticHaunt ? 'mystery' : save.scenario);
              setGame(save);
            }}
            onTest={() =>
              setGame(
                createHauntPlaytest(
                  choice,
                  Date.now(),
                  count,
                  choice === 'werewolf' ? playtestFocus : 'basic',
                ),
              )
            }
            onNetwork={() => setView('network')}
          />
        ) : (
          <>
            <AttributeFeedback
              feedback={{
                ...attributeFeedback,
                changes: attributeFeedback.changes.filter((c) =>
                  canInspectHero(game, game.heroes[c.heroId], net.room),
                ),
                notices: attributeFeedback.notices.filter((notice) =>
                  canInspectHero(game, game.heroes[notice.heroId], net.room),
                ),
              }}
            />
            <nav className="floating-dock" aria-label="探索工具">
              <button
                className="roster-toggle"
                aria-expanded={partyOpen}
                aria-controls="party-details"
                onClick={() => setPartyOpen((open) => !open)}
              >
                <Users size={19} />
                <span>全员状态</span>
              </button>
            </nav>
            {panel === 'test' && (
              <section
                className="floating-window test-window"
                id="test-details"
                aria-label="快速测试工具"
              >
                <div className="floating-heading">
                  <strong>测试点工具</strong>
                  <button
                    className="icon-button"
                    aria-label="收起测试工具"
                    onClick={() => setPanel(null)}
                  >
                    <X size={18} />
                  </button>
                </div>
                <PlaytestControls
                  game={game}
                  onRestore={restorePlaytest}
                  network={!!net.session}
                />
              </section>
            )}
            <EnemyMotion game={game} playback={enemyMotion} />
            {game.cardNotice && (
              <CardNotice key={game.cardNotice.uid} notice={game.cardNotice} />
            )}
            <DeckSupply
              game={game}
              net={net}
              moving={enemyMotion.moving}
              onEndRound={() =>
                remaining > 0
                  ? setConfirm('round')
                  : send({ type: 'endRound', round: game.round })
              }
            />
            <PersonalPanel
              game={game}
              net={net}
              send={send}
              waiting={waiting}
              moving={enemyMotion.moving}
              Traits={Traits}
              changes={attributeFeedback.changes}
              commands={
                <ExplorerActions
                  game={game}
                  send={send}
                  net={net}
                  waiting={waiting}
                  moving={enemyMotion.moving}
                />
              }
            />
            <div
              className={
                'game-layout party-expanded story-expanded ' +
                (waiting ? 'waiting-player' : '')
              }
            >
              <aside
                className="party-panel floating-window"
                id="party-details"
                hidden={!partyOpen}
                aria-label="人物与物品"
              >
                <div className="floating-heading">
                  <strong>全员状态与物品</strong>
                  <button
                    className="icon-button"
                    aria-label="收起人物与物品"
                    onClick={() => setPartyOpen(false)}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="panel-heading">
                  <span className="eyebrow">THE EXPLORERS</span>
                  <h2>
                    探险队{' '}
                    <span>
                      {living(game).length}/{game.count}人
                    </span>
                  </h2>
                </div>
                <FactionRoster
                  open={partyOpen}
                  game={game}
                  send={send}
                  net={net}
                  waiting={waiting}
                  pending={p}
                  Traits={Traits}
                  changes={attributeFeedback.changes}
                  inspected={inspected}
                  onInspectedChange={setInspected}
                />
                <div className="save-status">
                  <Save size={13} />
                  {net.session
                    ? net.kind === 'remote'
                      ? '远程房间已持久化保存'
                      : '联机状态由房主电脑保存'
                    : storageError
                      ? '无法保存进度'
                      : '进度已自动保存'}
                </div>
              </aside>
              <section className="board-panel">
                <Board
                  key={playtestEpoch}
                  game={enemyMotion.game}
                  enemyMotion={enemyMotion}
                  send={send}
                  zoom={zoom}
                  setZoom={setZoom}
                  locked={waiting || net.busy || enemyMotion.moving}
                  onInspect={(id) => {
                    setInspected(id);
                    setPartyOpen(true);
                  }}
                  room={net.room}
                />
              </section>
              <div className="right-info-rail" aria-label="章节与探索记录">
                <button
                  className="chapter-toggle"
                  aria-expanded={storyOpen}
                  aria-controls="story-details"
                  onClick={() => setStoryOpen((open) => !open)}
                >
                  <BookOpen size={19} />
                  <span>
                    章节 · 作祟
                    {game.phase === 'haunt' && (
                      <small>剩余 {game.limit - game.elapsed} 轮</small>
                    )}
                  </span>
                </button>
                <button
                  className="journal-toggle"
                  aria-expanded={journalOpen}
                  aria-controls="journal-details"
                  onClick={() => setJournalOpen((open) => !open)}
                >
                  <BookOpen size={19} />
                  <span>探索手记</span>
                </button>
                <aside
                  className="story-panel floating-window"
                  id="story-details"
                  hidden={!storyOpen}
                >
                  <div className="floating-heading">
                    <strong>
                      {game.phase === 'explore' ? '探索章节' : '作祟章节'}
                    </strong>
                    <button
                      className="icon-button"
                      aria-label="收起当前目标"
                      onClick={() => setStoryOpen(false)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="story-top">
                    <span className="eyebrow">CHAPTER {sc.number}</span>
                    <Icon size={26} />
                    <h2>{sc.title}</h2>
                    <span className="english-title">{sc.subtitle}</span>
                  </div>
                  <p className="chapter-phase">
                    第 {game.round} 回合 ·{' '}
                    {game.phase === 'explore'
                      ? '探索阶段'
                      : game.phase === 'over'
                        ? '故事落幕'
                        : '作祟阶段'}
                  </p>
                  {game.phase !== 'explore' && (
                    <details className="chapter-rule">
                      <summary>作祟规则与背景</summary>
                      <p>{sc.haunt}</p>
                    </details>
                  )}
                  <WerewolfPanel
                    game={game}
                    send={send}
                    net={net}
                    waiting={waiting}
                    rulesOnly
                  />
                  <div
                    className={
                      'objective-card ' +
                      (game.phase === 'haunt' ? 'haunting' : '')
                    }
                  >
                    <div className="mini-heading">
                      <span>
                        {game.phase === 'explore' ? '探索目标' : '作祟目标'}
                      </span>
                      <span>✦</span>
                    </div>
                    <p>
                      {game.phase === 'explore'
                        ? '探索三层宅邸，收集物品与预兆。预兆越多，作祟越可能发生。'
                        : sc.objective}
                    </p>
                    {game.phase === 'explore' ? (
                      <>
                        <div className="omen-track">
                          <Eye size={23} />
                          <strong>{game.omens}</strong>
                          <span>张预兆</span>
                        </div>
                        <p className="haunt-roll-help">
                          抽到预兆后投等量骰子
                          <br />
                          总点数 ≥ 5，作祟降临
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="countdown">
                          <Clock size={15} />
                          <span>
                            剩余 {Math.max(0, game.limit - game.elapsed)} 回合
                          </span>
                        </div>
                        <div className="danger-track">
                          <i
                            style={{
                              width: `${(game.elapsed / game.limit) * 100}%`,
                            }}
                          />
                        </div>
                        <div className="objective-progress">
                          {game.scenario === 'werewolf'
                            ? game.progress + '/2 月印已净化；全部完成后回入口'
                            : game.scenario === 'bells'
                              ? `${game.progress}/3 祭坛已封印`
                              : game.scenario === 'mirror'
                                ? game.mirrorFound
                                  ? '真身已现形！'
                                  : `${game.progress}/3 古镜已调查`
                                : game.powered
                                  ? '电力已恢复，返回入口'
                                  : `${game.fuses}/2 保险丝已找到`}
                        </div>
                        <ul className="target-list">
                          {(game.targetRooms || []).map((id) => {
                            const r = roomAt(game, id);
                            return (
                              <li key={id}>
                                <button
                                  onClick={() =>
                                    send({ type: 'viewFloor', floor: r.floor })
                                  }
                                >
                                  {r.done ? (
                                    <Check size={12} />
                                  ) : (
                                    <Sparkles size={12} />
                                  )}
                                  <span>
                                    {FLOORS.find((f) => f.id === r.floor).name}{' '}
                                    · {r.name}
                                    <small>
                                      {targetLabels[r.target]}
                                      {r.target === 'moonSeal'
                                        ? ` · ${r.charges || 0}/${r.requiredCharges} 次净化`
                                        : ''}
                                      {r.done ? ' · 已完成' : ''}
                                    </small>
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    )}
                  </div>
                </aside>
                <aside
                  className="journal-panel floating-window"
                  id="journal-details"
                  hidden={!journalOpen}
                  aria-label="探索手记"
                >
                  <div className="floating-heading">
                    <strong>探索手记</strong>
                    <button
                      className="icon-button"
                      aria-label="收起探索手记"
                      onClick={() => setJournalOpen(false)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <output className="live-feedback" key={game.feedbackId}>
                    <Sparkles size={16} />
                    {game.feedback}
                  </output>
                  <div className="journal">
                    <div className="mini-heading">
                      <span>
                        <BookOpen size={15} />
                        最近结算
                      </span>
                      <span>最新</span>
                    </div>
                    <div className="journal-entries">
                      {eventJournalEntries(game).map((l, i) => (
                        <div
                          className={
                            'journal-entry ' + (i === 0 ? 'latest' : '')
                          }
                          key={l.id}
                        >
                          <span className="journal-dot" />
                          <small>第{l.round}回合</small>
                          <p>{l.text}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mini-heading">
                      <span>
                        <BookOpen size={15} />
                        宅邸手记
                      </span>
                    </div>
                    <div className="journal-entries">
                      {game.logs.map((l) => (
                        <div className="journal-entry" key={l.id}>
                          <span className="journal-dot" />
                          <small>第{l.round}回合</small>
                          <p>{l.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </aside>
              </div>
            </div>
            {!enemyMotion.moving && (
              <Prompt
                key={playtestEpoch}
                game={game}
                send={send}
                locked={waiting || net.busy}
                diceMotion={diceMotion}
                toggleDice={toggleDice}
                net={net}
                autoRoll={autoRoll}
                toggleAuto={toggleAuto}
                testTools={
                  game.playtest?.mode === 'haunt' && !net.session ? (
                    <details className="prompt-test-tools">
                      <summary>测试点工具</summary>
                      <PlaytestControls
                        game={game}
                        onRestore={restorePlaytest}
                      />
                    </details>
                  ) : null
                }
              />
            )}
            <Dialog open={game.phase === 'over'} onOpenChange={() => {}}>
              <DialogContent
                className="story-dialog result-dialog"
                showCloseButton={false}
              >
                <span className="eyebrow">
                  {game.result?.won ? 'DAWN BREAKS' : 'THE HOUSE WINS'}
                </span>
                {game.result?.won ? (
                  <DoorOpen size={38} />
                ) : (
                  <Skull size={38} />
                )}
                <DialogTitle>
                  {game.scenario === 'werewolf'
                    ? game.result?.won
                      ? '解围成功 · 好人阵营获胜'
                      : '血月终夜 · 狼群阵营获胜'
                    : game.result?.won
                      ? '你们看见了黎明。'
                      : '宅邸留下了你们。'}
                </DialogTitle>
                <DialogDescription>
                  {game.scenario === 'werewolf'
                    ? game.result?.reason
                    : game.result?.won
                      ? sc.ending
                      : game.result?.reason}
                </DialogDescription>
                {game.lastRollReceipt && (
                  <div className="resolved-rolls">
                    {game.lastRollReceipt.rolls.map((r) => (
                      <Dice
                        key={r.id}
                        dice={r.dice}
                        presented={true}
                        label={r.label}
                      />
                    ))}
                    <output className="inline-roll-result">
                      <p>{game.result.reason}</p>
                    </output>
                  </div>
                )}
                <div className="result-stats">
                  <span>
                    <strong>{game.round}</strong>经历回合
                  </span>
                  <span>
                    <strong>{game.rooms.length}</strong>探索房间
                  </span>
                  <span>
                    <strong>{living(game).length}</strong>幸存者
                  </span>
                </div>
                {game.playtest?.mode === 'haunt' && !net.session && (
                  <PlaytestControls game={game} onRestore={restorePlaytest} />
                )}
                <button
                  className="gold-button"
                  onClick={() =>
                    net.session
                      ? (net.leave(), setView('network'))
                      : setGame(
                          (game.playtest?.mode === 'haunt'
                            ? createHauntPlaytest
                            : createGame)(
                            game.automaticHaunt ? 'mystery' : sc.id,
                            Date.now(),
                            game.count,
                            game.playtest?.focus || 'basic',
                          ),
                        )
                  }
                >
                  再来一局
                  <RotateCcw size={17} />
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    if (net.session) net.leave();
                    else setGame(null);
                    setView('game');
                  }}
                >
                  返回入屋准备
                </button>
              </DialogContent>
            </Dialog>
          </>
        )}
        <Dialog open={help} onOpenChange={setHelp}>
          <DialogContent className="story-dialog help-dialog">
            <span className="eyebrow">SURVIVAL GUIDE · 03</span>
            <DialogTitle>这栋房子如何醒来</DialogTitle>
            <DialogDescription>
              由你一人指挥3—6名探险者。人物数值沿属性轨变化，队员拥有不同的力量、速度、理智和知识。
            </DialogDescription>
            <ol className="help-list">
              <li>
                <strong>随机抽房间，旋转拼接</strong>
                <p>
                  每次从未探索的门出去，都从洗好的房间牌堆抽取一张符合当前楼层的房间。旋转到合法朝向后放置。入口必须门对门；其他门尽量匹配，无法匹配的视为堵死。角色和怪物都只能沿连通的门移动。
                </p>
              </li>
              <li>
                <strong>真正的三层宅邸</strong>
                <p>
                  大楼梯连接一楼和二楼平台；找到地下阶梯后，地下室也会连通。切换楼层页签只查看地图，上下楼必须亲自走到楼梯。为保证试玩能接触地下室，一楼探索3间后会优先抽出地下阶梯。
                </p>
              </li>
              <li>
                <strong>速度决定移动力，卡牌会停止移动</strong>
                <p>
                  每轮初始移动力等于速度（装备可修正）。穿过一对门通常消耗1点；离开敌人所在房间额外消耗1点。首次发现带事件、物品、预兆图标的房间，立即抽对应卡并停止移动。仍可使用物品、攻击或完成目标。
                </p>
              </li>
              <li>
                <strong>四属性与伤害分配</strong>
                <p>
                  属性值决定检定骰数，每枚骰子为0、1、2点。肉体伤害在力量和速度间分配；精神伤害在理智和知识间分配。先用
                  − 分配、+
                  撤回，预览轨道后统一确认。伤害按格下降，不是直接减数值。作祟前不会死亡，作祟后任一属性落到骷髅位就死亡。属性轨下方的小点表示起始位置。
                </p>
              </li>
              <li>
                <strong>预兆效果与作祟检定</strong>
                <p>
                  预兆先结算自身效果，再按全队累计预兆数掷骰。若骰子最高总点数不足5，会提示并自动跳过检定。总点数达到5后，进入作祟揭示动画与新目标说明，必须确认才能继续。作祟后的新预兆仍有效，但不重复触发作祟。
                </p>
              </li>
              <li>
                <strong>同室攻击与每轮行动</strong>
                <p>
                  攻击要求与敌人在同一房间，双方投力量骰，比差值决定伤害。每人每轮攻击、目标互动、休整各一次，均不扣移动力；休整会停止移动。Demo将一次反击或敌袭伤害上限设为3。结束整轮后敌人沿连通房间及楼梯行动。
                </p>
              </li>
            </ol>
            <p className="help-note">
              36张房间牌、10张事件卡、10张物品卡、12张预兆卡均为本 Demo
              的原创内容。包含四个原创剧本、单人模式、局域网与远程联机；仍未覆盖原版全部特殊房间、卡牌交易和怪物规则。
            </p>
            <button className="gold-button" onClick={() => setHelp(false)}>
              我准备好了
              <ArrowRight size={17} />
            </button>
          </DialogContent>
        </Dialog>
        <Dialog
          open={!!confirm}
          onOpenChange={(open) => {
            if (!open) setConfirm(null);
          }}
        >
          <DialogContent className="story-dialog">
            <DialogTitle>
              {confirm === 'round' ? '让时间继续流动？' : '暂时离开宅邸？'}
            </DialogTitle>
            <DialogDescription>
              {confirm === 'round'
                ? `还有${remaining}名队员未结束行动。结束整轮会跳过他们的剩余行动，并让作祟中的敌人行动。`
                : net.session
                  ? net.kind === 'remote'
                    ? '离开此远程房间后，本设备上的房间身份会被清除；房间将在最后一次操作 24 小时后过期。'
                    : '离开此局域网房间，房间在主机关闭前继续保留。'
                  : '当前进度已保存在本机。你可以随时从主菜单继续探索。'}
            </DialogDescription>
            <button
              className="gold-button"
              onClick={() => {
                if (confirm === 'round')
                  send({ type: 'endRound', round: game.round });
                else if (net.session) {
                  net.leave();
                  setView('game');
                } else setGame(null);
                setConfirm(null);
              }}
            >
              {confirm === 'round' ? '结束整轮' : '返回主菜单'}
              <ArrowRight size={17} />
            </button>
            <button className="text-button" onClick={() => setConfirm(null)}>
              继续探索
            </button>
          </DialogContent>
        </Dialog>
      </main>
    </MotionContext.Provider>
  );
}
