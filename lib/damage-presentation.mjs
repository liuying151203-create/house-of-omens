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
      title: source,
      text: `在「${room?.name || '当前房间'}」踩中敌方捕兽夹，本回合停止移动。`,
    };
  }
  if (!source) return null;
  if (request.causeTag === 'steam')
    return {
      title: source,
      text: `速度检定未通过。${BOILER_STEAM_CHECK.failure}`,
    };
  const room = game.rooms.find((entry) => entry.id === request.sourceRoomId);
  return {
    title: source,
    rule: room ? roomRuleView(game, room, request.heroId).description : null,
  };
}
