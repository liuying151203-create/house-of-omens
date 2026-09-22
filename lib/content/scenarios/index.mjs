import { createScenarioRegistry } from '../../engine/scenarios.mjs';
import { bells } from './bells.mjs';
import { mirror } from './mirror.mjs';
import { flood } from './flood.mjs';
import { werewolf } from './werewolf.mjs';

export const scenarioRegistry = createScenarioRegistry([
  bells,
  mirror,
  flood,
  werewolf,
]);
export const scenarioRules = (id) => scenarioRegistry.get(id);
export const findScenarioRules = (id) => scenarioRegistry.find(id);

export const chooseHaunt = (omenId, room) =>
  scenarioRegistry.select(omenId, room);
