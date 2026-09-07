'use client';
import {
  useState,
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
  Footprints,
  Swords,
  Compass,
  DoorOpen,
  Volume2,
  VolumeX,
  CircleHelp,
  RotateCcw,
  RotateCw,
  Check,
  Sparkles,
  Zap,
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
  MousePointer2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
  ENTRANCE,
  DIRS,
  createInteractiveGame as createGame,
  act,
  actions,
  living,
  pending,
  frontiers,
  roomAt,
  doorsOf,
  traitValue,
  validSave,
} from '@/lib/game-engine.mjs';
import Workshop from './workshop';
import DiceRequest from './dice-request';
import DamagePlanner from './damage-planner';
import { useNetwork, NetworkLobby } from './network';
const MotionContext = createContext(true);
const KEY = 'hillhouse-demo-v2';
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
    return storageUnavailable ? 'unavailable' : localStorage.getItem(KEY);
  } catch {
    return 'unavailable';
  }
}
const serverSave = () => null;
const iconMap = { bells: Bell, mirror: Eye, flood: Waves },
  cardIcons = { event: Sparkles, item: Package, omen: Eye };
const targetLabels = {
    seal: '祭坛',
    mirror: '古镜',
    fuse: '保险丝',
    generator: '发电机',
  },
  targetActions = {
    seal: '进行封印',
    mirror: '调查古镜',
    fuse: '拾取保险丝',
    generator: '修复发电机',
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
        <span className={'tile-card-icon icon-' + tile.icon}>
          <CardIcon size={15} />
        </span>
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
function Traits({ hero, compact = false }) {
  return (
    <div className={'traits-grid ' + (compact ? 'compact-traits' : '')}>
      {TRAIT_KEYS.map((k) => (
        <div className={'trait-row trait-' + k} key={k}>
          <div className="trait-caption">
            <span>{TRAITS[k]}</span>
            <strong>{traitValue(hero, k)}</strong>
          </div>
          {!compact && (
            <div
              className="trait-track"
              aria-label={`${TRAITS[k]}当前${traitValue(hero, k)}，位于第${hero.stats[k]}格`}
            >
              {hero.tracks[k].map((n, i) => (
                <span
                  key={i}
                  className={
                    (i === hero.stats[k] ? 'trait-current ' : '') +
                    (i === hero.start[k] ? 'trait-start' : '')
                  }
                >
                  {i === 0 ? <Skull size={10} /> : n}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
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
      />
    );
  const tile =
      p.kind === 'placement' ? ROOM_DECK.find((t) => t.id === p.tileId) : null,
    c =
      p.kind === 'card'
        ? (p.cardType === 'event'
            ? EVENTS
            : p.cardType === 'item'
              ? ITEMS
              : OMENS
          ).find((c) => c.id === p.cardId)
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
              p.title
            )}
          </DialogTitle>
          <DialogDescription>
            {c
              ? c.story
              : p.kind === 'placement'
                ? `${FLOORS.find((f) => f.id === p.floor).name} · 来自「${roomAt(game, p.from).name}」的${DIRS[p.dir].name}侧门。请选择朝向，然后放置。`
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
                      {TRAITS[c.trait]}检定 · 目标 {c.threshold}+
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
              <span className="card-owner">
                由 {h.name} 结算 · 抽卡后本回合停止移动
              </span>
            </div>
          )}
          {p.dice && (
            <Dice
              presented={p.dicePresented}
              dice={p.dice}
              label={p.defenseDice ? '你的攻击骰' : null}
            />
          )}{' '}
          {p.defenseDice && (
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
          {p.kind !== 'damage' && (
            <button
              className="gold-button"
              onClick={() => send({ type: tile ? 'place' : 'advance' })}
            >
              {tile
                ? '放置房间并进入'
                : p.kind === 'card'
                  ? c.trait && p.cardType === 'event'
                    ? '投掷属性骰'
                    : '结算卡牌效果'
                  : p.kind === 'hauntRoll'
                    ? '掷骰，试探黑暗'
                    : p.kind === 'hauntResult' && p.triggers
                      ? '揭开作祟剧本'
                      : p.kind === 'haunt'
                        ? '我已了解，面对作祟'
                        : '确认并继续'}
              <ArrowRight size={18} />
            </button>
          )}
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}
function Board({ game, send, zoom, setZoom, locked = false }) {
  const [snapped, setSnapped] = useState(false);
  const drag = useRef(null);
  const placement = pending(game)?.kind === 'placement' ? pending(game) : null;
  const tile = placement
    ? ROOM_DECK.find((t) => t.id === placement.tileId)
    : null;
  const ref = useRef(null),
    hero = game.heroes[game.active],
    legal = locked ? { move: [], explore: [] } : actions(game),
    floor = game.viewFloor;
  const rooms = game.rooms.filter((r) => r.floor === floor),
    allFrontiers = frontiers(game, floor),
    cells = [...rooms, ...allFrontiers];
  const minX = Math.min(...cells.map((r) => r.x)) - 1,
    maxX = Math.max(...cells.map((r) => r.x)) + 1,
    minY = Math.min(...cells.map((r) => r.y)) - 1,
    maxY = Math.max(...cells.map((r) => r.y)) + 1,
    cols = maxX - minX + 1,
    rows = maxY - minY + 1;
  useEffect(() => {
    ref.current?.querySelector('[data-current="true"]')?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: 'smooth',
    });
  }, [hero.pos, floor]);
  return (
    <>
      <div className="board-heading">
        <div>
          <span className="eyebrow">BLACK PINE MANOR</span>
          <h2>黑松岭宅邸</h2>
        </div>
        <div className="map-tools">
          <button
            className="secondary-button"
            onClick={() => {
              const size = Math.max(
                4,
                Math.min(
                  110,
                  (ref.current.clientWidth - 30) / (cols + (cols - 1) / 11),
                  (ref.current.clientHeight - 30) / (rows + (rows - 1) / 11),
                ),
              );
              setZoom(size);
              ref.current.scrollTo({ top: 0, left: 0 });
            }}
          >
            <Maximize size={14} />
            全图
          </button>
          <button
            aria-label="缩小地图"
            className="icon-button"
            disabled={zoom <= 30}
            onClick={() => setZoom((z) => Math.max(30, z - 15))}
          >
            <Minus size={16} />
          </button>
          <span>{Math.round((zoom / 110) * 100)}%</span>
          <button
            aria-label="放大地图"
            className="icon-button"
            disabled={zoom >= 155}
            onClick={() => setZoom((z) => Math.min(155, z + 15))}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
      <Tabs
        value={String(floor)}
        onValueChange={(v) => send({ type: 'viewFloor', floor: Number(v) })}
        className="floor-tabs"
      >
        <TabsList>
          {FLOORS.map((f) => (
            <TabsTrigger value={String(f.id)} key={f.id}>
              <Layers size={14} />
              {f.name}
              <small>{game.rooms.filter((r) => r.floor === f.id).length}</small>
              <span className="floor-party">
                {game.heroes
                  .filter(
                    (h) =>
                      !h.dead &&
                      !h.traitor &&
                      roomAt(game, h.pos).floor === f.id,
                  )
                  .map((h) => (
                    <span
                      key={h.id}
                      className={
                        'floor-hero ' +
                        (h.id === game.active ? 'floor-hero-active' : '')
                      }
                      style={{ '--pawn-color': h.color }}
                      title={
                        h.name + (h.id === game.active ? ' · 当前行动' : '')
                      }
                      aria-label={h.name}
                    >
                      {h.mark}
                    </span>
                  ))}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
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
      <div
        className={
          'map-viewport ' + (game.phase === 'haunt' ? 'haunted-map' : '')
        }
        ref={ref}
        onPointerDown={(e) => {
          if (e.button !== 0 || e.target.closest('button')) return;
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            left: e.currentTarget.scrollLeft,
            top: e.currentTarget.scrollTop,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          e.currentTarget.scrollLeft =
            drag.current.left + drag.current.x - e.clientX;
          e.currentTarget.scrollTop =
            drag.current.top + drag.current.y - e.clientY;
        }}
        onPointerUp={() => {
          drag.current = null;
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
          {rooms.map((r) => {
            const occupants = game.heroes.filter(
                (h) => h.pos === r.id && !h.dead && !h.traitor,
              ),
              enemies = game.enemies.filter((e) => e.pos === r.id),
              here = hero.pos === r.id;
            return (
              <button
                key={r.id}
                data-current={here}
                disabled={!legal.move.includes(r.id)}
                onClick={() => send({ type: 'move', pos: r.id })}
                className={
                  'modular-room ' +
                  (here ? 'current ' : '') +
                  (legal.move.includes(r.id) ? 'reachable ' : '') +
                  (r.target ? 'quest-room' : '')
                }
                style={{ gridColumn: r.x - minX + 1, gridRow: r.y - minY + 1 }}
                aria-label={`${r.name}${here ? '，当前位置' : ''}${legal.move.includes(r.id) ? '，可经门移动' : ''}`}
              >
                <TileFace tile={r} />
                {here && !hero.ended && (
                  <span className="moving-label">
                    <MousePointer2 size={12} />
                    {hero.name}行动中
                  </span>
                )}
                {r.target && (
                  <span className={'quest-marker ' + (r.done ? 'done' : '')}>
                    {r.done ? <Check size={12} /> : <Sparkles size={12} />}
                    <span>{targetLabels[r.target]}</span>
                  </span>
                )}
                {r.special &&
                  ['stairs', 'upper', 'stairsDown', 'basement'].includes(
                    r.special,
                  ) && <ArrowUpDown className="stairs-symbol" size={17} />}
                <span className="room-tokens">
                  {occupants.map((h) => (
                    <span
                      className={
                        'pawn ' + (h.id === game.active ? 'selected-pawn' : '')
                      }
                      style={{ backgroundColor: h.color }}
                      key={h.id}
                    >
                      {h.mark}
                    </span>
                  ))}
                  {enemies.map((e) => (
                    <span
                      className="enemy-pawn"
                      key={e.id}
                      title={e.name + ' ' + e.hp + '/' + e.maxHp}
                    >
                      <Ghost size={13} />
                    </span>
                  ))}
                </span>
              </button>
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
            const choice = legal.explore.find(
              (e) => e.x === f.x && e.y === f.y,
            );
            return (
              <button
                className={
                  'frontier-cell ' +
                  (choice ? 'active-frontier' : '') +
                  (isPlacement
                    ? ' placement-ghost ' + (snapped ? 'snapped' : '')
                    : '')
                }
                key={`${f.x},${f.y}`}
                style={{ gridColumn: f.x - minX + 1, gridRow: f.y - minY + 1 }}
                disabled={!choice && !isPlacement}
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
                onClick={() =>
                  isPlacement
                    ? setSnapped(true)
                    : send({ type: 'explore', dir: choice.dir })
                }
                aria-label={
                  choice
                    ? `从${roomAt(game, choice.from).name}${DIRS[choice.dir].name}门探索新房间`
                    : '未探索的门外'
                }
              >
                {isPlacement ? (
                  <>
                    <TileFace tile={tile} rotation={placement.rotation} />
                    <span className="snap-label">
                      {snapped ? '已吸附 · 待确认' : '落位预览'}
                    </span>
                  </>
                ) : (
                  <>
                    <Plus size={19} />
                    <span>{choice ? '探索' : '未知'}</span>
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
              抽到房间 · {FLOORS.find((f) => f.id === placement.floor).name}
            </span>
            <h3>{tile.name}</h3>
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
              确认放置并进入
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
    [choice, setChoice] = useState('bells'),
    [count, setCount] = useState(3),
    [help, setHelp] = useState(false),
    [confirm, setConfirm] = useState(null),
    [sound, setSound] = useState(false),
    [zoom, setZoom] = useState(110),
    [view, setView] = useState('game'),
    [diceMotion, setDiceMotion] = useState(true),
    [autoRoll, setAutoRoll] = useState(false),
    [partyOpen, setPartyOpen] = useState(false),
    [storyOpen, setStoryOpen] = useState(false);
  const net = useNetwork(setGame);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        setDiceMotion(localStorage.getItem('hillhouse-dice-motion') !== 'off');
        setAutoRoll(localStorage.getItem('hillhouse-auto-roll') === 'on');
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  function toggleDice() {
    setDiceMotion((v) => {
      try {
        localStorage.setItem('hillhouse-dice-motion', v ? 'off' : 'on');
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
      const s = JSON.parse(rawSave);
      return validSave(s) && s.phase !== 'over'
        ? { ...s, rollMode: 'interactive' }
        : null;
    } catch {
      return null;
    }
  }, [rawSave]);
  const audio = useRef(null);
  useEffect(() => {
    if (game && !net.session) {
      try {
        localStorage.setItem(KEY, JSON.stringify(game));
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
    if (net.session && a.type !== 'viewFloor') {
      if ((waiting && !['rollDice', 'rollAll'].includes(a.type)) || net.busy)
        return;
      void net.update({ type: 'action', action: a });
      return;
    }
    setGame((s) => act(s, a));
  }
  const sc = SCENARIOS.find((s) => s.id === (game?.scenario || choice)),
    Icon = iconMap[sc.id],
    hero = game?.heroes[game.active],
    legal = game ? actions(game) : null,
    room = game ? roomAt(game, hero.pos) : null,
    remaining = game ? living(game).filter((h) => !h.ended).length : 0;
  const waiting =
    !!net.room?.game &&
    (p && p.heroId === undefined
      ? net.room.you !== net.room.hostId
      : (net.room.seats[p?.heroId ?? game?.active] || net.room.hostId) !==
        net.room.you);
  return (
    <MotionContext.Provider value={diceMotion}>
      <main
        className={
          game
            ? 'app playing revision-two revision-three map-focus'
            : 'app lobby revision-two revision-three'
        }
      >
        <header className="topbar">
          <button
            className="brand"
            onClick={() => (game ? setConfirm('menu') : null)}
            aria-label="山屋惊魂主菜单"
          >
            <span className="brand-seal">
              <Flame size={20} />
            </span>
            <span>
              山屋惊魂<small>THE HOUSE REMEMBERS</small>
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
            ) : (
              <>
                <span className="tiny-star">✦</span> 三层宅邸，无数条未知的路{' '}
                <span className="tiny-star">✦</span>
              </>
            )}
          </div>
          <div className="top-actions">
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
          <Workshop onClose={() => setView('game')} TileFace={TileFace} />
        ) : !game && (view === 'network' || net.session) ? (
          <NetworkLobby
            net={net}
            scenario={choice}
            count={count}
            onClose={() => setView('game')}
          />
        ) : !game ? (
          <>
            <section className="lobby-stage">
              <div className="manor-art" aria-hidden="true" />
              <div className="lobby-copy">
                <div className="eyebrow">
                  <span /> A NIGHT AT THE HOUSE ON THE HILL
                </div>
                <h1>
                  有些门，
                  <br />
                  不该被推开。
                </h1>
                <p className="lead">
                  一栋逐间拼起、不断揭露秘密的老宅。
                  <br />
                  当预兆降临，你熟悉的一切都将改变。
                </p>
                <div className="lobby-meta">
                  <span>
                    <Layers size={16} />
                    三层随机宅邸
                  </span>
                  <span>
                    <Footprints size={16} />
                    3—6人探险队
                  </span>
                  <span>
                    <Clock size={16} />
                    20—35分钟
                  </span>
                </div>
              </div>
              <div className="location-stamp">
                <Compass size={26} />
                <span>
                  黑松岭 · 无名宅邸<small>午夜前，请不要相信钟声。</small>
                </span>
              </div>
            </section>
            <section className="scenario-section">
              <div className="section-line">
                <div>
                  <span className="eyebrow">CHOOSE YOUR STORY</span>
                  <h2>今晚，哪段故事会发生？</h2>
                </div>
                <span className="muted">抽取房间 · 旋转拼接 · 翻开命运</span>
              </div>
              <div className="scenario-grid">
                {SCENARIOS.map((s, i) => {
                  const I = iconMap[s.id];
                  return (
                    <button
                      key={s.id}
                      className={
                        'scenario-card ' + (choice === s.id ? 'selected' : '')
                      }
                      onClick={() => setChoice(s.id)}
                      aria-pressed={choice === s.id}
                      style={{ '--scenario-color': s.color }}
                    >
                      <div
                        className="scenario-art"
                        style={atlas([3, 8, 7][i])}
                      />
                      <div className="scenario-shade" />
                      <span className="chapter-no">{s.number}</span>
                      <I className="chapter-icon" size={27} />
                      <div className="scenario-copy">
                        <span className="scenario-type">{s.type}</span>
                        <h3>{s.title}</h3>
                        <p>{s.intro}</p>
                        <div className="chapter-footer">
                          <span>{s.difficulty}难度</span>
                          <span>
                            {choice === s.id ? (
                              <>
                                <Check size={14} />
                                已选择
                              </>
                            ) : (
                              <>
                                选择故事
                                <ArrowRight size={15} />
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="team-setup">
                <div>
                  <span className="eyebrow">YOUR EXPLORERS</span>
                  <h3>探险队人数</h3>
                  <small>由你一人指挥全队；默认3人，敌人强度随人数调整。</small>
                </div>
                <RadioGroup
                  value={String(count)}
                  onValueChange={(v) => setCount(Number(v))}
                  className="count-options"
                  aria-label="探险队人数"
                >
                  {[3, 4, 5, 6].map((n) => (
                    <label
                      className={count === n ? 'count-selected' : ''}
                      key={n}
                    >
                      <RadioGroupItem value={String(n)} />
                      <span>{n}人</span>
                    </label>
                  ))}
                </RadioGroup>
                <div className="team-preview">
                  {HEROES.slice(0, count).map((h) => (
                    <span key={h.name} style={{ color: h.color }}>
                      {h.name}
                      <small>{h.role}</small>
                    </span>
                  ))}
                </div>
              </div>
              <div className="start-row">
                <span className="disclaimer">
                  原创房间与卡牌 · 原创剧本 · 非官方试玩作品
                </span>
                <div className="start-buttons">
                  {saved && (
                    <button
                      className="secondary-button"
                      onClick={() => setGame(saved)}
                    >
                      <RotateCcw size={16} />
                      继续探索
                    </button>
                  )}
                  <button
                    className="gold-button"
                    onClick={() =>
                      setGame(createGame(choice, Date.now(), count))
                    }
                  >
                    推开大门
                    <ArrowRight size={19} />
                  </button>
                </div>
              </div>
            </section>
            <footer className="lobby-footer">
              <span>每次探索，宅邸都会有所不同。</span>
              <span>新规则使用独立存档 · 旧版进度仍保留在浏览器</span>
            </footer>
          </>
        ) : (
          <>
            {net.session && (
              <div className="network-status">
                <Users size={16} />
                <strong>房间 {net.room?.code || net.session.code}</strong>
                <span>{net.connected ? '已同步' : '正在重连…'}</span>
                <span>{waiting ? '等待其他玩家操作' : '轮到你操作'}</span>
                <button
                  className="text-button"
                  onClick={() => {
                    net.leave();
                    setView('network');
                  }}
                >
                  离开联机
                </button>
                {net.error && <output>{net.error}</output>}
              </div>
            )}
            <div
              className="turn-banner"
              key={game.round + '-' + game.active}
              style={{ '--turn-color': hero.color }}
            >
              <span className="turn-number">第 {game.round} 回合</span>
              <span className="turn-pawn">{hero.mark}</span>
              <strong>
                {hero.name}
                {hero.ended ? '已结束行动' : '行动中'}
              </strong>
              <span>
                {hero.stopped
                  ? '本回合停止移动，可继续互动'
                  : hero.moves + ' 点移动力'}
              </span>
              <small>
                {FLOORS.find((f) => f.id === room.floor).name} · {room.name}
              </small>
            </div>
            <div className="map-focus-toolbar">
              <button
                className={'secondary-button ' + (partyOpen ? 'selected' : '')}
                aria-expanded={partyOpen}
                aria-controls="party-details"
                onClick={() => setPartyOpen((v) => !v)}
              >
                <Users size={16} />
                {partyOpen ? '收起人物与物品' : '人物与物品'}
              </button>
              <button
                className="focus-objective"
                aria-expanded={storyOpen}
                onClick={() => setStoryOpen((v) => !v)}
              >
                <Icon size={16} />
                <span>
                  {game.phase === 'explore'
                    ? `${game.omens} 张预兆 · 探索宅邸`
                    : sc.objective}
                </span>
                {game.phase === 'haunt' && (
                  <strong>剩余 {game.limit - game.elapsed} 回合</strong>
                )}
              </button>
              <button
                className={'secondary-button ' + (storyOpen ? 'selected' : '')}
                aria-expanded={storyOpen}
                aria-controls="story-details"
                onClick={() => setStoryOpen((v) => !v)}
              >
                <BookOpen size={16} />
                {storyOpen ? '收起目标与记录' : '目标与记录'}
              </button>
            </div>
            <div
              className={
                'game-layout ' +
                (partyOpen ? 'party-expanded ' : 'party-collapsed ') +
                (storyOpen ? 'story-expanded ' : 'story-collapsed ') +
                (waiting ? 'waiting-player' : '')
              }
            >
              <aside className="party-panel" id="party-details">
                <div className="panel-heading">
                  <span className="eyebrow">THE EXPLORERS</span>
                  <h2>
                    探险队{' '}
                    <span>
                      {living(game).length}/{game.count}人
                    </span>
                  </h2>
                </div>
                <div className="hero-list">
                  {game.heroes.map((h) => (
                    <button
                      key={h.id}
                      className={
                        'hero-card ' +
                        (h.id === game.active ? 'active ' : '') +
                        (h.dead || h.traitor ? 'fallen' : '')
                      }
                      style={{ '--hero-color': h.color }}
                      onClick={() => send({ type: 'select', id: h.id })}
                      disabled={
                        h.dead ||
                        h.traitor ||
                        !!p ||
                        (!!net.session &&
                          (waiting ||
                            (net.room?.seats[h.id] || net.room?.hostId) !==
                              net.room?.you))
                      }
                      aria-pressed={h.id === game.active}
                    >
                      <div className="hero-heading">
                        <span className="hero-portrait">
                          {h.traitor ? (
                            <Ghost size={24} />
                          ) : h.dead ? (
                            <Skull size={24} />
                          ) : (
                            h.mark
                          )}
                        </span>
                        <span className="hero-title">
                          <strong>{h.name}</strong>
                          <small>
                            {h.traitor ? '已叛变' : h.dead ? '已死亡' : h.role}
                          </small>
                        </span>
                        {h.id === game.active && (
                          <span className="active-mark">行动中</span>
                        )}
                      </div>
                      <Traits hero={h} compact={h.id !== game.active} />
                      <div className="hero-bottom">
                        <span>
                          {
                            FLOORS.find(
                              (f) => f.id === roomAt(game, h.pos).floor,
                            ).name
                          }{' '}
                          · {roomAt(game, h.pos).name}
                        </span>
                        <span>
                          {h.ended
                            ? '已结束'
                            : h.stopped
                              ? '已停止移动'
                              : `${h.moves}移动`}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="inventory">
                  <div className="mini-heading">
                    <span>
                      <Package size={15} />
                      物品与预兆
                    </span>
                    <span>{hero.items.length + hero.omens.length}</span>
                  </div>
                  {!hero.items.length && !hero.omens.length && (
                    <p className="empty-inventory">
                      发现带图标的房间，
                      <br />
                      会自动抽取对应卡牌。
                    </p>
                  )}
                  {hero.items.map((id) => {
                    const c = ITEMS.find((c) => c.id === id);
                    return (
                      <div className="item-card" key={id}>
                        <strong>{c.title}</strong>
                        <p>{c.effect}</p>
                        {c.use === 'movement' ? (
                          <button
                            className="text-button"
                            disabled={
                              !!p || hero.ended || hero.used.includes(id)
                            }
                            onClick={() => send({ type: 'useItem', id })}
                          >
                            饮用 · 移动力 +2
                          </button>
                        ) : c.use ? (
                          <div className="item-use-options">
                            {(c.use === 'healPhysical'
                              ? ['might', 'speed']
                              : ['sanity', 'knowledge']
                            ).map((k) => (
                              <button
                                key={k}
                                disabled={
                                  !!p ||
                                  hero.ended ||
                                  hero.stats[k] >= hero.start[k]
                                }
                                onClick={() =>
                                  send({ type: 'useItem', id, trait: k })
                                }
                              >
                                恢复{TRAITS[k]}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="passive-label">携带效果已生效</span>
                        )}
                      </div>
                    );
                  })}
                  {hero.omens.map((id) => {
                    const c = OMENS.find((c) => c.id === id);
                    return (
                      <div className="item-card omen-item" key={id}>
                        <strong>
                          <Eye size={13} />
                          {c.title}
                        </strong>
                        <p>{c.effect}</p>
                        <span className="passive-label">获得效果已结算</span>
                      </div>
                    );
                  })}
                </div>
                <div className="save-status">
                  <Save size={13} />
                  {net.session
                    ? '联机状态由房主电脑保存'
                    : storageError
                      ? '无法保存进度'
                      : '进度已自动保存'}
                </div>
              </aside>
              <section className="board-panel">
                <Board
                  game={game}
                  send={send}
                  zoom={zoom}
                  setZoom={setZoom}
                  locked={waiting || net.busy}
                />
                <output className="live-feedback" key={game.feedbackId}>
                  <Sparkles size={16} />
                  {game.feedback}
                </output>
                <div className="action-bar">
                  <div className="current-room">
                    <span className="eyebrow">{hero.name} · 当前位置</span>
                    <strong>{room.name}</strong>
                    <span className="muted">
                      速度 {traitValue(hero, 'speed')} · 剩余移动 {hero.moves}
                      {hero.stopped ? ' · 本回合停止移动' : ''}
                    </span>
                  </div>
                  <div className="action-buttons">
                    {legal.stairs.map((id) => (
                      <button
                        key={id}
                        className="quest-action"
                        onClick={() => send({ type: 'move', pos: id })}
                      >
                        <ArrowUpDown size={17} />
                        <span>
                          前往
                          {
                            FLOORS.find((f) => f.id === roomAt(game, id).floor)
                              .name
                          }
                          <small>{legal.moveCost}点移动力</small>
                        </span>
                      </button>
                    ))}
                    {legal.interact && (
                      <button
                        className="quest-action"
                        onClick={() => send({ type: 'interact' })}
                      >
                        <Zap size={17} />
                        <span>
                          {room.id === ENTRANCE && game.powered
                            ? '一起逃生'
                            : targetActions[room.target]}
                          <small>每人每回合一次</small>
                        </span>
                      </button>
                    )}
                    {legal.attack.map((id) => {
                      const e = game.enemies.find((e) => e.id === id);
                      return (
                        <button
                          key={id}
                          className="attack-action"
                          onClick={() => send({ type: 'attack', id })}
                        >
                          <Swords size={17} />
                          <span>
                            攻击{e.name}
                            <small>
                              {e.hp}/{e.maxHp}生命 · 本回合一次
                            </small>
                          </span>
                        </button>
                      );
                    })}
                    <button
                      disabled={hero.ended || !!p || game.phase === 'over'}
                      onClick={() => send({ type: 'endHero' })}
                    >
                      <Check size={17} />
                      <span>
                        结束此人行动<small>切换下一名队员</small>
                      </span>
                    </button>
                  </div>
                </div>
                {legal.rest && (
                  <div className="rest-controls">
                    <span>休整：恢复1格，随后停止移动</span>
                    {TRAIT_KEYS.filter(
                      (k) => hero.stats[k] < hero.start[k],
                    ).map((k) => (
                      <button
                        key={k}
                        onClick={() => send({ type: 'rest', trait: k })}
                      >
                        {TRAITS[k]} +1
                      </button>
                    ))}
                  </div>
                )}
                <div className="deck-counter">
                  {['event', 'item', 'omen'].map((type) => {
                    const I = cardIcons[type];
                    return (
                      <span key={type}>
                        <I size={15} />
                        {{ event: '事件', item: '物品', omen: '预兆' }[type]}
                        牌堆 <strong>{game.decks[type].length}</strong>
                      </span>
                    );
                  })}
                </div>
              </section>
              <aside
                className="story-panel"
                id="story-details"
                hidden={!storyOpen}
              >
                <div className="story-top">
                  <span className="eyebrow">CHAPTER {sc.number}</span>
                  <Icon size={26} />
                  <h2>{sc.title}</h2>
                  <span className="english-title">{sc.subtitle}</span>
                </div>
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
                        {game.scenario === 'bells'
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
                                  {FLOORS.find((f) => f.id === r.floor).name} ·{' '}
                                  {r.name}
                                  <small>
                                    {targetLabels[r.target]}
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
                <div className="journal">
                  <div className="mini-heading">
                    <span>
                      <BookOpen size={15} />
                      探索手记
                    </span>
                    <span>最新</span>
                  </div>
                  <div className="journal-entries">
                    {game.logs.slice(0, 16).map((l, i) => (
                      <div
                        className={'journal-entry ' + (i === 0 ? 'latest' : '')}
                        key={l.id}
                      >
                        <span className="journal-dot" />
                        <small>第{l.round}回合</small>
                        <p>{l.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="turn-controls">
                  <span>{remaining}名队员尚未结束行动</span>
                  <button
                    className="gold-button"
                    disabled={!!p || game.phase === 'over'}
                    onClick={() =>
                      remaining > 0
                        ? setConfirm('round')
                        : send({ type: 'endRound' })
                    }
                  >
                    结束整轮
                    <ArrowRight size={18} />
                  </button>
                  <small>
                    {game.phase === 'explore'
                      ? '所有队员按速度恢复移动力'
                      : '敌人行动，作祟倒计时推进'}
                  </small>
                </div>
              </aside>
            </div>
            <Prompt
              game={game}
              send={send}
              locked={waiting || net.busy}
              diceMotion={diceMotion}
              toggleDice={toggleDice}
              net={net}
              autoRoll={autoRoll}
              toggleAuto={toggleAuto}
            />
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
                  {game.result?.won ? '你们看见了黎明。' : '宅邸留下了你们。'}
                </DialogTitle>
                <DialogDescription>
                  {game.result?.won ? sc.ending : game.result?.reason}
                </DialogDescription>
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
                <button
                  className="gold-button"
                  onClick={() =>
                    net.session
                      ? (net.leave(), setView('network'))
                      : setGame(createGame(sc.id, Date.now(), game.count))
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
                  选择另一个故事
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
              的原创内容。保留三个原创剧本和单人模式；仍未覆盖原版全部特殊房间、卡牌交易、怪物规则；已加入局域网联机，异地联网将在后续扩展。
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
                  ? '离开此联机房间，房间在主机关闭前继续保留。'
                  : '当前进度已保存在本机。你可以随时从主菜单继续探索。'}
            </DialogDescription>
            <button
              className="gold-button"
              onClick={() => {
                if (confirm === 'round') send({ type: 'endRound' });
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
