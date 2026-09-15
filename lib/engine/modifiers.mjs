const STRATEGIES = new Set(['sum', 'max', 'unique', 'replace', 'cap']);

function normalized(entry, index) {
  if (
    !entry ||
    typeof entry.id !== 'string' ||
    !Number.isFinite(entry.value) ||
    !STRATEGIES.has(entry.strategy || 'sum')
  )
    throw new Error('Invalid modifier contribution');
  return {
    strategy: 'sum',
    priority: 0,
    stackGroup: entry.id,
    sourceId: entry.id,
    ...entry,
    order: index,
  };
}

const stableOrder = (a, b) =>
  b.priority - a.priority ||
  a.sourceId.localeCompare(b.sourceId) ||
  a.id.localeCompare(b.id) ||
  a.order - b.order;

export function resolveModifier(base, entries = []) {
  const groups = new Map();
  entries.map(normalized).forEach((entry) => {
    const key = entry.stackGroup;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  });
  const applied = [];
  for (const group of groups.values()) {
    group.sort(stableOrder);
    const strategy = group[0].strategy;
    if (group.some((entry) => entry.strategy !== strategy))
      throw new Error(
        `Conflicting modifier strategies: ${group[0].stackGroup}`,
      );
    if (strategy === 'sum') applied.push(...group);
    else if (strategy === 'max') {
      const maximum = Math.max(...group.map((entry) => entry.value));
      applied.push(group.find((entry) => entry.value === maximum));
    } else applied.push(group[0]);
  }
  const additions = applied.filter((entry) =>
    ['sum', 'max', 'unique'].includes(entry.strategy),
  );
  const replacements = applied
    .filter((entry) => entry.strategy === 'replace')
    .sort(stableOrder);
  const caps = applied.filter((entry) => entry.strategy === 'cap');
  let value = base + additions.reduce((sum, entry) => sum + entry.value, 0);
  if (replacements.length) value = replacements[0].value;
  if (caps.length) value = Math.min(value, ...caps.map((entry) => entry.value));
  return {
    base,
    value,
    delta: value - base,
    contributions: applied.map(({ order: _order, ...entry }) => entry),
  };
}
