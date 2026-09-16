function valueAt(source, path) {
  return path.split('.').reduce((value, key) => value?.[key], source);
}

function resolveValue(value, context) {
  if (typeof value === 'string' && value.startsWith('$event.'))
    return valueAt(context.event, value.slice('$event.'.length));
  if (Array.isArray(value))
    return value.map((entry) => resolveValue(entry, context));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        key === 'effects' && Array.isArray(entry)
          ? structuredClone(entry)
          : resolveValue(entry, context),
      ]),
    );
  return value;
}

export function executeEffects(state, effects, handlers, context = {}) {
  if (!Array.isArray(effects)) throw new Error('Effects must be an array');
  if (effects.length > 100) throw new Error('Effect limit exceeded');
  const executed = [];
  let paused = null;
  for (const [index, definition] of effects.entries()) {
    if (!definition?.op) throw new Error('Invalid effect definition');
    const handler = handlers[definition.op];
    if (!handler) throw new Error(`Unknown effect operation: ${definition.op}`);
    const effect = structuredClone(definition),
      params = resolveValue(effect.params || {}, context),
      result = handler(state, params, {
        ...context,
        effect,
        effectIndex: index,
        remainingEffects: cloneEffects(effects.slice(index + 1)),
      });
    if (result === false) continue;
    executed.push({
      id: effect.id || `${effect.op}:${index}`,
      op: effect.op,
      ...(result !== undefined && result !== true ? { result } : {}),
    });
    if (result?.pause) {
      paused = result;
      break;
    }
  }
  return { executed, ...(paused ? { paused } : {}) };
}

function cloneEffects(effects) {
  return structuredClone(effects);
}
