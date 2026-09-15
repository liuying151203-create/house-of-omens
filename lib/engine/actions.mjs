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

export function executeAction(
  state,
  command,
  availableActions,
  handlers,
  context = {},
) {
  const action = availableActions.find((entry) => entry.id === command.type);
  if (!action) return false;
  const handler = handlers[action.handler];
  if (!handler) throw new Error(`Unknown action handler: ${action.handler}`);
  handler(state, command, action, context);
  return true;
}
