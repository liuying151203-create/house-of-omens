import {
  ArrowUpDown,
  Swords,
  Flag,
  HeartPulse,
  PanelTopClose,
  Tent,
} from 'lucide-react';
import {
  actions,
  roomAt,
  ENTRANCE,
  FLOORS,
  TRAITS,
  TRAIT_KEYS,
} from '../lib/game-engine.mjs';
import { moonlit, statusOf } from '../lib/werewolf.mjs';
import { cardCureBonus } from '../lib/card-rules.mjs';
import { publicEnemies } from '../lib/game-view.mjs';

const targets = {
  moonSeal: '净化月印',
  moonRitual: '入口解咒',
  seal: '封印祭坛',
  mirror: '调查古镜',
  fuse: '拾取保险丝',
  generator: '修复发电机',
};
export default function ExplorerActions({ game, send, net, waiting, moving }) {
  const hero = game.heroes[game.active],
    room = roomAt(game, hero.pos),
    legal = actions(game);
  const busy =
    !!game.queue.length || net.busy || moving || game.phase === 'over';
  const disabled = busy || waiting || hero.dead || hero.traitor || hero.ended;
  const buttons = [];
  for (const id of legal.stairs)
    buttons.push({
      id: 'stairs-' + id,
      Icon: ArrowUpDown,
      label: '前往' + FLOORS.find((f) => f.id === roomAt(game, id).floor).name,
      detail: legal.moveCost + ' 移动',
      action: { type: 'move', pos: id },
    });
  if (legal.interact)
    buttons.push({
      id: 'interact',
      Icon: Flag,
      label:
        room.id === ENTRANCE && game.powered
          ? '一起逃生'
          : targets[room.target] || '房间互动',
      detail: '消耗本轮互动',
      action: { type: 'interact' },
    });
  for (const id of legal.attack) {
    const enemy = game.enemies.find((e) => e.id === id);
    buttons.push({
      id: 'attack-' + id,
      Icon: Swords,
      label: '攻击' + enemy.name,
      detail: `${enemy.hp}/${enemy.maxHp} 生命`,
      action: { type: 'attack', id },
    });
  }
  if (
    game.scenario === 'werewolf' &&
    game.phase === 'haunt' &&
    !hero.interacted &&
    !hero.ended &&
    !hero.dead &&
    !hero.traitor
  ) {
    if (moonlit(game, room))
      buttons.push({
        id: 'board',
        Icon: PanelTopClose,
        label: '封住窗户',
        detail: '消耗本轮互动',
        action: { type: 'boardWindow' },
      });
    for (const target of game.heroes.filter(
      (h) =>
        !h.dead && !h.traitor && h.pos === hero.pos && statusOf(h, 'infection'),
    )) {
      const bonus = cardCureBonus(game, hero, target);
      buttons.push({
        id: 'cure-' + target.id,
        Icon: HeartPulse,
        label: '治疗' + target.name,
        detail: `知识 3+${bonus ? ' · 加值 +' + bonus : ''} · 消耗互动`,
        action: { type: 'cure', heroId: target.id },
      });
    }
  }
  if (legal.rest)
    for (const trait of TRAIT_KEYS.filter((k) => hero.stats[k] < hero.start[k]))
      buttons.push({
        id: 'rest-' + trait,
        Icon: Tent,
        label: TRAITS[trait] + ' +1',
        detail: '随后停止移动',
        action: { type: 'rest', trait },
      });
  const wolves =
    net.session && game.scenario === 'werewolf'
      ? publicEnemies(game).filter(
          (e) =>
            e.heroId !== undefined &&
            (net.room?.seats[e.heroId] || net.room?.hostId) === net.room?.you,
        )
      : [];
  if (!buttons.length && !wolves.length) return null;
  return (
    <section className="explorer-command-strip" aria-label="人物可用行动">
      {!wolves.length &&
        buttons
          .filter((b) => !b.id.startsWith('rest-'))
          .map(({ id, Icon, label, detail, action }) => (
            <button
              key={id}
              disabled={disabled}
              title={detail}
              onClick={() => send(action)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
      {!wolves.length && buttons.some((b) => b.id.startsWith('rest-')) && (
        <details className="rest-menu">
          <summary title="休整一次，恢复一项属性1格并停止移动">
            <Tent size={16} />
            休整
          </summary>
          <div>
            {buttons
              .filter((b) => b.id.startsWith('rest-'))
              .map((b) => (
                <button
                  key={b.id}
                  disabled={disabled}
                  title={b.detail}
                  onClick={(event) => {
                    event.currentTarget.closest('details').open = false;
                    send(b.action);
                  }}
                >
                  {b.label}
                </button>
              ))}
          </div>
        </details>
      )}
      {wolves.map((wolf) => (
        <label className="wolf-command" key={wolf.id}>
          <Swords size={16} />
          {wolf.name}
          <select
            aria-label={wolf.name + '的追猎目标'}
            value={wolf.huntTarget ?? ''}
            disabled={busy}
            onChange={(e) =>
              send({
                type: 'wolfOrder',
                heroId: wolf.heroId,
                targetId: Number(e.target.value),
              })
            }
          >
            <option value="" disabled>
              自动追猎最近好人
            </option>
            {game.heroes
              .filter((h) => !h.dead && !h.traitor)
              .map((h) => (
                <option value={h.id} key={h.id}>
                  {h.name}
                </option>
              ))}
          </select>
        </label>
      ))}
    </section>
  );
}
