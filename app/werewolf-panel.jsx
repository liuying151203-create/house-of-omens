import { cardCureBonus } from '../lib/card-rules.mjs';
import { moonlit, statusOf, wolfMight } from '../lib/werewolf.mjs';
export default function WerewolfPanel({ game, send, net, waiting }) {
  if (game.scenario !== 'werewolf' || game.phase !== 'haunt') return null;
  const h = game.heroes[game.active],
    room = game.rooms.find((r) => r.id === h.pos);
  const disabled =
    !!game.queue.length ||
    h.ended ||
    h.dead ||
    h.traitor ||
    h.interacted ||
    waiting ||
    net.busy;
  const infected = game.heroes.filter(
    (x) => !x.dead && !x.traitor && statusOf(x, 'infection'),
  );
  return (
    <section className="wolf-panel" aria-label="血月与狼毒">
      <div className="wolf-heading">
        <strong>☾ 血月围猎</strong>
        <span>{Math.max(0, game.limit - game.elapsed)} 轮后狼群获胜</span>
      </div>
      <p>好人：击败全部狼人，或净化两处月印后回入口解咒。</p>
      <div className="wolf-progress">
        月印 {game.progress}/2 · 狼人 {game.enemies.length} · 感染{' '}
        {infected.length}
      </div>
      {room.target === 'moonSeal' && (
        <div>
          本室净化 {room.charges || 0}/{room.requiredCharges} · 知识 4+
        </div>
      )}
      <div className="wolf-actions">
        {moonlit(game, room) && (
          <button
            disabled={disabled}
            onClick={() => send({ type: 'boardWindow' })}
          >
            封住本室窗户 · 消耗互动
          </button>
        )}
        {room.states?.boarded && <span>本室已封窗，狼人无月光加成</span>}
        {infected
          .filter((x) => x.pos === h.pos)
          .map((x) => (
            <button
              key={x.id}
              disabled={disabled}
              onClick={() => send({ type: 'cure', heroId: x.id })}
            >
              治疗{x.name} · 知识 3+
              {cardCureBonus(game, h, x)
                ? ' · 卡牌 +' + cardCureBonus(game, h, x)
                : ''}
            </button>
          ))}
      </div>
      {infected.map((x) => (
        <div className="infection-row" key={x.id}>
          <b>{x.name}</b>
          <span>狼毒 · {statusOf(x, 'infection').turns} 轮后转化</span>
        </div>
      ))}
      <details>
        <summary>狼群状态与追猎</summary>
        {game.enemies.map((e) => (
          <div className="wolf-enemy" key={e.id}>
            <strong>🐺 {e.name}</strong>
            <span>
              {e.hp}/{e.maxHp} 生命 · 力量 {wolfMight(game, e)} · 移动 {e.speed}
            </span>
            <small>
              {game.rooms.find((r) => r.id === e.pos)?.name}
              {moonlit(
                game,
                game.rooms.find((r) => r.id === e.pos),
              )
                ? ' · 月光 +1'
                : ''}
            </small>
            {net.session &&
              (net.room?.seats[e.heroId] || net.room?.hostId) ===
                net.room?.you && (
                <label>
                  你的狼方目标
                  <select
                    aria-label={e.name + '的追猎目标'}
                    value={e.huntTarget ?? ''}
                    disabled={!!game.queue.length || net.busy}
                    onChange={(ev) =>
                      send({
                        type: 'wolfOrder',
                        heroId: e.heroId,
                        targetId: Number(ev.target.value),
                      })
                    }
                  >
                    <option value="" disabled>
                      自动追猎最近好人
                    </option>
                    {game.heroes
                      .filter((x) => !x.dead && !x.traitor)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
          </div>
        ))}
        <p>
          单人由电脑指挥狼群。联机狼方可指定追猎对象，轮末自动移动、攻击，由所属玩家投骰。
        </p>
      </details>
      <details>
        <summary>感染与胜负规则</summary>
        <p>
          狼群主动攻击造成伤害后感染；反击不感染。感染有三个完整行动轮，治疗可以对自己或同室队友使用，和封窗、月印共用每轮一次互动。失败累积
          +1；治愈后有两轮保护。
        </p>
        <p>
          转化后归狼方，不能再按普通人物行动；新生狼人下一轮才追猎。击败狼王不会清除其他狼人与感染。解咒解除全部狼毒，已死亡者不会复活。
        </p>
        <p>
          净化月印：知识 4+，尝试累积 +1。每处需要{Math.ceil(game.count / 2)}
          次成功。两处完成后，任一好人在入口花一次互动完成解咒，不必全员集合。倒计时耗尽或没有好人时狼方获胜。
        </p>
        <p>
          狼王在月光房间力量
          +1，并在追猎开始前恢复2点生命。5–6人局可分别攻击同室的两个不同好人；单个好人每轮只被狼王攻击一次。
        </p>
        <p>
          狼王厚皮：每次攻击最多损失3生命，月光下最多2。封窗能同时解除月光强化、回血和额外防护。
        </p>
      </details>
    </section>
  );
}
