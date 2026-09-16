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
  for (const [index, trigger] of matching.entries()) {
    if (
      !trigger.id ||
      !trigger.sourceId ||
      (!trigger.handler && !Array.isArray(trigger.effects))
    )
      throw new Error('Invalid trigger definition');
    const key = `${event.rootActionId || event.causeId || event.when}:${trigger.sourceId}:${trigger.id}`;
    if (trigger.oncePerRoot && usage.has(key)) continue;
    if (trigger.oncePerRoot) usage.add(key);
    const triggerContext = { ...context, event, trigger, usage },
      handler = trigger.handler && handlers[trigger.handler];
    if (trigger.handler && !handler)
      throw new Error(`Unknown trigger handler: ${trigger.handler}`);
    if (trigger.effects && !context.executeEffects)
      throw new Error('Trigger effects require an effect executor');
    const applied = trigger.effects
      ? context.executeEffects(state, trigger.effects, triggerContext)
      : handler(state, event, trigger.params || {}, triggerContext);
    if (applied === false) {
      if (trigger.oncePerRoot) usage.delete(key);
      continue;
    }
    executed.push({
      id: trigger.id,
      sourceId: trigger.sourceId,
      sourceLabel: trigger.sourceLabel,
      when: trigger.when,
      ...(applied?.executed ? { effects: applied.executed } : {}),
    });
    if (applied?.paused)
      return {
        executed,
        usage: [...usage],
        paused: applied.paused,
        remainingTriggers: matching.slice(index + 1),
      };
  }
  return { executed, usage: [...usage] };
}
