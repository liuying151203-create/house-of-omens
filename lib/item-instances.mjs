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

export function itemInstanceCharges(instance, definition) {
  if (Number.isInteger(instance?.state?.charges)) return instance.state.charges;
  return Number.isInteger(definition?.charges) ? definition.charges : null;
}

export function spendItemCharge(hero, instanceId, amount, initialCharges) {
  if (!Number.isInteger(amount) || amount <= 0) return false;
  const instance = materializeItemInstances(hero).find(
    (entry) => entry.instanceId === instanceId,
  );
  if (!instance) return false;
  const current = Number.isInteger(instance.state?.charges)
    ? instance.state.charges
    : initialCharges;
  if (!Number.isInteger(current) || current < amount) return false;
  instance.state ||= {};
  instance.state.charges = current - amount;
  return instance.state.charges;
}

function detachItemInstance(hero, instanceId) {
  const instances = materializeItemInstances(hero),
    index = instances.findIndex(
      (instance) => instance.instanceId === instanceId,
    );
  if (index < 0) return null;
  const [instance] = instances.splice(index, 1),
    itemIndex = hero.items.indexOf(instance.definitionId),
    used = itemInstanceUsed(hero, instance);
  if (itemIndex >= 0) hero.items.splice(itemIndex, 1);
  hero.usedItemInstances = (hero.usedItemInstances || []).filter(
    (id) => id !== instanceId,
  );
  return { ...instance, state: structuredClone(instance.state || {}), used };
}

function attachItemInstance(hero, carried) {
  if (!carried?.instanceId || !carried.definitionId) return false;
  materializeItemInstances(hero);
  if (
    hero.itemInstances.some((entry) => entry.instanceId === carried.instanceId)
  )
    return false;
  const instance = {
    instanceId: carried.instanceId,
    definitionId: carried.definitionId,
    state: structuredClone(carried.state || {}),
  };
  hero.items.push(instance.definitionId);
  hero.itemInstances.push(instance);
  if (carried.used) {
    hero.usedItemInstances ||= [];
    hero.usedItemInstances.push(instance.instanceId);
  }
  return instance;
}

export function transferItemInstance(fromHero, toHero, instanceId) {
  if (!fromHero || !toHero || fromHero === toHero) return false;
  const carried = detachItemInstance(fromHero, instanceId);
  if (!carried) return false;
  const attached = attachItemInstance(toHero, carried);
  if (!attached) attachItemInstance(fromHero, carried);
  return attached;
}

export function dropItemInstance(hero, room, instanceId) {
  if (!hero || !room) return false;
  const carried = detachItemInstance(hero, instanceId);
  if (!carried) return false;
  room.droppedItems ||= [];
  room.droppedItems.push(carried);
  return carried;
}

export function pickupItemInstance(hero, room, instanceId) {
  const index = room?.droppedItems?.findIndex(
    (entry) => entry.instanceId === instanceId,
  );
  if (index === undefined || index < 0) return false;
  const [carried] = room.droppedItems.splice(index, 1),
    attached = attachItemInstance(hero, carried);
  if (!attached) room.droppedItems.splice(index, 0, carried);
  return attached;
}
