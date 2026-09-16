export const CURRENT_GAME_VERSION = 4;

function migrateHeroInstances(hero) {
  hero.items ||= [];
  hero.itemInstances ||= [];
  const claimed = new Set();
  hero.itemInstances = hero.items.map((definitionId, index) => {
    const existingIndex = hero.itemInstances.findIndex(
      (instance, candidate) =>
        !claimed.has(candidate) && instance.definitionId === definitionId,
    );
    if (existingIndex >= 0) {
      claimed.add(existingIndex);
      const instance = hero.itemInstances[existingIndex];
      return { ...instance, state: instance.state || {} };
    }
    return {
      instanceId: `legacy-item:${hero.id}:${definitionId}:${index}`,
      definitionId,
      state: {},
    };
  });
  hero.usedItemInstances ||= hero.itemInstances
    .filter((instance) => (hero.used || []).includes(instance.definitionId))
    .map((instance) => instance.instanceId);
}

function migrateVersionTwo(game) {
  game.events ||= [];
  game.events = game.events.slice(-200);
  game.eventSerial = Math.max(
    Number.isInteger(game.eventSerial) ? game.eventSerial : 0,
    ...game.events.map((event) => (Number.isInteger(event?.id) ? event.id : 0)),
  );
  game.roomRules ||= [];
  game.traitRules ||= [];
  game.itemSerial ||= 0;
  game.statusSerial ||= 0;
  for (const hero of game.heroes || []) {
    hero.faction ||= hero.traitor ? 'wolves' : 'heroes';
    hero.statuses ||= [];
    hero.omens ||= [];
    migrateHeroInstances(hero);
    hero.statuses = hero.statuses.map((status, index) => ({
      ...status,
      instanceId:
        status.instanceId || `legacy-status:${hero.id}:${status.id}:${index}`,
    }));
  }
  for (const room of game.rooms || []) {
    room.states ||= {};
    room.tokens ||= [];
    room.droppedItems ||= [];
  }
  game.version = 3;
  return game;
}

function migrateVersionThree(game) {
  // Browser and LAN saves from v3 used this marker for the production
  // Workflow resolver. Missing markers came from older local fixtures; a
  // restored user save must prefer the resumable production path.
  game.executionMode = 'workflow';
  delete game.rollMode;
  game.version = CURRENT_GAME_VERSION;
  return game;
}

function recoverLegacyDiceRequest(game) {
  const request = game.queue?.[0];
  if (request?.kind !== 'diceRequest' || request.workflow) return true;
  if (!request.resumeAction || !Array.isArray(request.resumeQueue))
    return false;
  const notice =
    '旧版未结算的投骰已安全回退到动作开始前；请重新执行该动作。原存档仍保留在浏览器中。';
  game.queue = structuredClone(request.resumeQueue);
  game.compatibilityNotices ||= [];
  game.compatibilityNotices.push({
    kind: 'legacyDiceRollback',
    requestId: request.uid,
    actionType: request.resumeAction.type,
    text: notice,
  });
  game.feedback = notice;
  game.feedbackId = (game.feedbackId || 0) + 1;
  game.serial = (game.serial || 0) + 1;
  game.logs ||= [];
  game.logs.unshift({ id: game.serial, round: game.round, text: notice });
  game.logs = game.logs.slice(0, 100);
  return true;
}

export function migrateGameSave(input) {
  if (!input || typeof input !== 'object') return null;
  const game = structuredClone(input);
  if (game.version === 2) migrateVersionTwo(game);
  if (game.version === 3) migrateVersionThree(game);
  else if (game.version !== CURRENT_GAME_VERSION) return null;
  return recoverLegacyDiceRequest(game) ? game : null;
}
