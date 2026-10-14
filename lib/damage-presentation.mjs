import { ITEMS } from './game-data.mjs';
import { damageSource } from './event-journal.mjs';
import { roomRuleView } from './rule-views.mjs';
import { BOILER_STEAM_CHECK } from './content/bloodmoon-rooms.mjs';

export function damageExplanation(game, request) {
  const source = damageSource(game, request);
  if (request.causeTag === 'trapHit') {
    const room =
      game.rooms.find((entry) => entry.id === request.sourceRoomId) ||
      game.rooms.find((entry) => entry.id === game.heroes[request.heroId]?.pos);
    return {
      title: `触发原因 · ${source}`,
      text: `${game.heroes[request.heroId]?.name}进入「${room?.name || '当前房间'}」时踩中敌方捕兽夹。夹子已销毁，本回合移动已停止。`,
      rule: ITEMS.find((item) => item.id === 'bear-trap')?.effect,
    };
  }
  if (!source) return null;
  if (request.causeTag === 'steam')
    return {
      title: `伤害来源 · ${source}`,
      text: `速度检定未通过。${BOILER_STEAM_CHECK.failure}`,
      rule: BOILER_STEAM_CHECK.description,
    };
  const room = game.rooms.find((entry) => entry.id === request.sourceRoomId);
  return {
    title: `伤害来源 · ${source}`,
    rule: room ? roomRuleView(game, room, request.heroId).description : null,
  };
}
