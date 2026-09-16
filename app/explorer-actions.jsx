import {
  ArrowUpDown,
  Swords,
  Flag,
  HeartPulse,
  PanelTopClose,
  Package,
  Tent,
} from 'lucide-react';
import {
  actions,
  factionActions,
  roomAt,
  FLOORS,
} from '../lib/game-engine.mjs';
import { publicEnemies } from '../lib/game-view.mjs';

export default function ExplorerActions({ game, send, net, waiting, moving }) {
  const hero = game.heroes[game.active];
  const busy =
    !!game.queue.length || net.busy || moving || game.phase === 'over';
  const disabled = busy || waiting || hero.dead || hero.traitor || hero.ended;
  const legal =
    hero.privateStats || !hero.stats || !hero.tracks
      ? { abilities: [], stairs: [], rest: false }
      : actions(game);
  const buttons = [];
  const actionIcons = {
    vertical: ArrowUpDown,
    board: PanelTopClose,
    heal: HeartPulse,
    attack: Swords,
    goal: Flag,
    item: Package,
    rest: Tent,
  };
  for (const ability of legal.abilities.filter(
    (entry) => entry.handler !== 'hero.rest',
  ))
    buttons.push({
      id: 'ability-' + ability.id,
      Icon: actionIcons[ability.icon] || Flag,
      label: ability.label,
      detail: ability.detail,
      action: ability.command || { type: ability.id },
    });
  for (const id of legal.stairs)
    buttons.push({
      id: 'stairs-' + id,
      Icon: ArrowUpDown,
      label: '前往' + FLOORS.find((f) => f.id === roomAt(game, id).floor).name,
      detail: legal.moveCost + ' 移动',
      action: { type: 'move', pos: id },
    });
  if (legal.rest)
    for (const ability of legal.abilities.filter(
      (entry) => entry.handler === 'hero.rest',
    ))
      buttons.push({
        id: 'rest-' + ability.trait,
        Icon: Tent,
        label: ability.label,
        detail: ability.detail,
        action: ability.command,
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
            {factionActions(game, wolf.heroId).map((order) => (
              <option value={order.targetId} key={order.id}>
                {order.targetLabel}
              </option>
            ))}
          </select>
        </label>
      ))}
    </section>
  );
}
