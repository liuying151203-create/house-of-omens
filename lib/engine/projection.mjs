function controlledHeroIds(game, room, playerId) {
  return new Set(
    game.heroes
      .filter((hero) => (room.seats[hero.id] || room.hostId) === playerId)
      .map((hero) => hero.id),
  );
}

function hideDeckOrder(decks) {
  return Object.fromEntries(
    Object.entries(decks || {}).map(([name, cards]) => [
      name,
      Array(cards.length).fill(null),
    ]),
  );
}

function canSeeVisibility(visibility, playerId, hostId, controlled, factions) {
  if (!visibility || visibility === 'public') return true;
  if (visibility === 'internal') return false;
  if (visibility === 'host') return playerId === hostId;
  if (Array.isArray(visibility.heroIds))
    return visibility.heroIds.some((heroId) => controlled.has(heroId));
  if (visibility.faction) return factions.has(visibility.faction);
  return false;
}

// Network clients receive enough public state to render and propose commands.
// The room service retains the complete authoritative game for validation.
export function projectGameForPlayer(game, room, playerId) {
  if (!game) return null;
  const projected = structuredClone(game),
    controlled = controlledHeroIds(game, room, playerId),
    factions = new Set(
      game.heroes
        .filter((hero) => controlled.has(hero.id))
        .map((hero) => hero.faction || (hero.traitor ? 'traitors' : 'heroes')),
    );
  projected.seed = null;
  if (projected.playtest) projected.playtest.seed = null;
  projected.decks = hideDeckOrder(game.decks);
  for (const collection of [
    'cardRules',
    'roomRules',
    'traitRules',
    'ruleModifiers',
    'ruleTriggers',
  ])
    if (Array.isArray(projected[collection]))
      projected[collection] = projected[collection].filter((rule) =>
        canSeeVisibility(
          rule.visibility,
          playerId,
          room.hostId,
          controlled,
          factions,
        ),
      );
  if (!game.mirrorFound) projected.trueMirror = null;
  projected.enemies = projected.enemies.filter(
    (enemy) => !enemy.hidden && enemy.revealed !== false,
  );
  projected.queue = (projected.queue || []).map((entry) => {
    if (entry.workflow)
      entry.workflow = {
        flowId: entry.workflow.flowId,
        definitionId: entry.workflow.definitionId,
        definitionVersion: entry.workflow.definitionVersion,
        step: entry.workflow.step,
      };
    if (
      !canSeeVisibility(
        entry.visibility,
        playerId,
        room.hostId,
        controlled,
        factions,
      )
    )
      return {
        uid: entry.uid,
        kind: 'privateRequest',
        heroId: entry.heroId,
        title: '等待其他阵营处理',
        text: '',
        private: true,
      };
    if (entry.kind === 'damage' && !controlled.has(entry.heroId))
      return {
        uid: entry.uid,
        kind: 'privateRequest',
        heroId: entry.heroId,
        title: '等待其他玩家分配伤害',
        text: '',
        private: true,
      };
    if (entry.kind === 'choiceRequest' && !controlled.has(entry.heroId)) {
      entry.title = '等待玩家选择';
      entry.text = '';
      entry.options = [];
      entry.choiceHidden = true;
    }
    const hero = game.heroes[entry.heroId],
      faction = hero?.faction || (hero?.traitor ? 'traitors' : 'heroes'),
      privateCard =
        game.phase !== 'explore' &&
        ['item', 'omen'].includes(entry.cardType) &&
        !controlled.has(entry.heroId) &&
        !factions.has(faction);
    if (privateCard)
      return {
        uid: entry.uid,
        kind: 'privateRequest',
        heroId: entry.heroId,
        title: '等待其他阵营处理卡牌',
        text: '',
        private: true,
      };
    return entry;
  });
  projected.events = (projected.events || []).filter((event) => {
    return canSeeVisibility(
      event.visibility,
      playerId,
      room.hostId,
      controlled,
      factions,
    );
  });
  projected.logs = (projected.logs || []).filter((entry) =>
    canSeeVisibility(
      entry.visibility,
      playerId,
      room.hostId,
      controlled,
      factions,
    ),
  );
  if (
    !canSeeVisibility(
      projected.feedbackVisibility,
      playerId,
      room.hostId,
      controlled,
      factions,
    )
  )
    projected.feedback = '';
  if (game.phase !== 'explore')
    for (const hero of projected.heroes) {
      const faction = hero.faction || (hero.traitor ? 'traitors' : 'heroes');
      if (controlled.has(hero.id) || factions.has(faction)) continue;
      hero.items = [];
      hero.itemInstances = [];
      hero.omens = [];
      hero.stats = null;
      hero.tracks = null;
      hero.start = null;
      hero.statuses = [];
      hero.moves = null;
      hero.used = [];
      hero.usedItemInstances = [];
      hero.inventoryHidden = true;
      hero.privateStats = true;
    }
  return projected;
}
