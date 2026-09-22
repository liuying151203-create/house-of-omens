// 注册表只保存代码定义；对局与存档仅保存剧本 ID 和运行状态。
export function createScenarioRegistry(definitions) {
  const entries = new Map();
  for (const definition of definitions) {
    if (!definition || typeof definition.id !== 'string' || !definition.id)
      throw new Error('Scenario definition needs an id');
    if (entries.has(definition.id))
      throw new Error(`Duplicate scenario: ${definition.id}`);
    if (typeof definition.setup !== 'function')
      throw new Error(`Scenario ${definition.id} needs a setup handler`);
    if (
      typeof definition.timeoutReason !== 'string' ||
      !definition.timeoutReason
    )
      throw new Error(`Scenario ${definition.id} needs a timeout reason`);
    for (const hook of [
      'victory',
      'afterEnemies',
      'winnerFaction',
      'enemyDefeated',
    ])
      if (
        definition[hook] !== undefined &&
        typeof definition[hook] !== 'function'
      )
        throw new Error(`Invalid scenario hook: ${definition.id}.${hook}`);
    if (
      definition.hauntRules !== undefined &&
      !Array.isArray(definition.hauntRules)
    )
      throw new Error(`Invalid haunt rules: ${definition.id}`);
    const hauntRules = (definition.hauntRules || []).map((rule) => {
      if (
        !rule ||
        !Number.isFinite(rule.priority) ||
        typeof rule.matches !== 'function'
      )
        throw new Error(`Invalid haunt rule: ${definition.id}`);
      return Object.freeze({ ...rule });
    });
    entries.set(
      definition.id,
      Object.freeze({ ...definition, hauntRules: Object.freeze(hauntRules) }),
    );
  }
  const hauntRules = [...entries.values()]
    .flatMap((definition) =>
      definition.hauntRules.map((rule) => ({ ...rule, id: definition.id })),
    )
    .sort((a, b) => b.priority - a.priority);
  return Object.freeze({
    ids: Object.freeze([...entries.keys()]),
    find: (id) => entries.get(id),
    select(omenId, room) {
      const rule = hauntRules.find((entry) => entry.matches(omenId, room));
      if (!rule) throw new Error('No matching haunt rule');
      return rule.id;
    },
    get(id) {
      const definition = entries.get(id);
      if (!definition) throw new Error(`Unknown scenario rules: ${id}`);
      return definition;
    },
  });
}
