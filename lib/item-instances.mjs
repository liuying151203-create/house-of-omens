function legacyInstanceId(hero, definitionId, index) {
  return `legacy-item:${hero.id}:${definitionId}:${index}`;
}

export function itemInstances(hero) {
  const stored = Array.isArray(hero.itemInstances) ? hero.itemInstances : [],
    claimed = new Set();
  return (hero.items || []).map((definitionId, index) => {
    const storedIndex = stored.findIndex(
      (instance, candidate) =>
        !claimed.has(candidate) && instance.definitionId === definitionId,
    );
    if (storedIndex >= 0) {
      claimed.add(storedIndex);
      return structuredClone(stored[storedIndex]);
    }
    return {
      instanceId: legacyInstanceId(hero, definitionId, index),
      definitionId,
      state: {},
    };
  });
}

export function materializeItemInstances(hero) {
  hero.itemInstances = itemInstances(hero);
  hero.usedItemInstances ||= [];
  return hero.itemInstances;
}

export function addItemInstance(hero, definitionId, instanceId) {
  hero.items ||= [];
  materializeItemInstances(hero);
  const instance = { instanceId, definitionId, state: {} };
  hero.items.push(definitionId);
  hero.itemInstances.push(instance);
  return instance;
}

export function itemInstanceUsed(hero, instance) {
  return (hero.usedItemInstances || []).includes(instance.instanceId);
}

export function markItemInstanceUsed(hero, instance) {
  hero.usedItemInstances ||= [];
  if (!hero.usedItemInstances.includes(instance.instanceId))
    hero.usedItemInstances.push(instance.instanceId);
  hero.used ||= [];
  if (!hero.used.includes(instance.definitionId))
    hero.used.push(instance.definitionId);
}

export function removeItemInstance(hero, instanceId) {
  const instances = materializeItemInstances(hero),
    index = instances.findIndex(
      (instance) => instance.instanceId === instanceId,
    );
  if (index < 0) return false;
  const [removed] = instances.splice(index, 1),
    itemIndex = hero.items.indexOf(removed.definitionId);
  if (itemIndex >= 0) hero.items.splice(itemIndex, 1);
  hero.usedItemInstances = (hero.usedItemInstances || []).filter(
    (id) => id !== instanceId,
  );
  return true;
}
