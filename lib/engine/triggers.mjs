const stableOrder = (a, b) =>
  (b.priority || 0) - (a.priority || 0) ||
  a.sourceId.localeCompare(b.sourceId) ||
  a.id.localeCompare(b.id);

export function runTriggers(state, event, triggers, handlers, context = {}) {
  const matching = triggers
    .filter((trigger) => trigger.when === event.when)
    .map((trigger) => structuredClone(trigger))
    .sort(stableOrder);
  const usage = new Set(context.usage || []),
    executed = [];
  if (matching.length > 100) throw new Error('Trigger limit exceeded');
  for (const trigger of matching) {
    if (!trigger.id || !trigger.sourceId || !trigger.handler)
      throw new Error('Invalid trigger definition');
    const key = `${event.rootActionId || event.causeId || event.when}:${trigger.sourceId}:${trigger.id}`;
    if (trigger.oncePerRoot && usage.has(key)) continue;
    const handler = handlers[trigger.handler];
    if (!handler)
      throw new Error(`Unknown trigger handler: ${trigger.handler}`);
    const applied = handler(state, event, trigger.params || {}, context);
    if (applied === false) continue;
    if (trigger.oncePerRoot) usage.add(key);
    executed.push({
      id: trigger.id,
      sourceId: trigger.sourceId,
      sourceLabel: trigger.sourceLabel,
      when: trigger.when,
    });
  }
  return { executed, usage: [...usage] };
}
