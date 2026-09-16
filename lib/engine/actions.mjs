export function collectActions(definitions, context) {
  return definitions
    .filter((definition) => definition.available(context))
    .map(({ available: _available, describe, ...definition }) =>
      structuredClone({
        ...definition,
        ...(describe ? describe(context) : {}),
      }),
    );
}

export function findAction(command, availableActions) {
  return availableActions.find(
    (entry) =>
      entry.id === command.type ||
      [entry.command, ...(entry.commandAliases || [])]
        .filter(Boolean)
        .some((candidate) =>
          Object.entries(candidate).every(
            ([key, value]) => command[key] === value,
          ),
        ),
  );
}

export function executeAction(
  state,
  command,
  availableActions,
  handlers,
  context = {},
) {
  const action = findAction(command, availableActions);
  if (!action) return false;
  const handler = handlers[action.handler];
  if (!handler) throw new Error(`Unknown action handler: ${action.handler}`);
  handler(state, command, action, context);
  return true;
}
