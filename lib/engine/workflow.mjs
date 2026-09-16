const clone = (value) => structuredClone(value);

function workflowDefinition(flow, definitions) {
  const definition = definitions[flow.definitionId];
  if (!definition || definition.version !== flow.definitionVersion)
    throw new Error(
      `Unknown workflow definition: ${flow.definitionId}@${flow.definitionVersion}`,
    );
  return definition;
}

function assertStepTarget(steps, target) {
  if (!Number.isInteger(target) || target < 0 || target > steps.length)
    throw new Error(`Invalid workflow target: ${target}`);
}

export function createWorkflow({
  flowId,
  definitionId,
  definitionVersion = 1,
  locals = {},
}) {
  if (!flowId || !definitionId)
    throw new Error('A workflow needs an id and definition');
  return {
    flowId,
    definitionId,
    definitionVersion,
    step: 0,
    locals: clone(locals),
  };
}

export function supplyRolls(flow, rolls, definitions) {
  const definition = workflowDefinition(flow, definitions),
    current = definition.steps[flow.step],
    request = flow.locals[current?.requestKey];
  if (current?.op !== 'requestRoll')
    throw new Error('Workflow is not waiting for dice');
  if (
    !Array.isArray(rolls) ||
    rolls.length !== request.rolls.length ||
    rolls.some(
      (dice, index) =>
        !Array.isArray(dice) ||
        dice.length !== request.rolls[index].count ||
        dice.some((face) => !Number.isInteger(face) || face < 0 || face > 2),
    )
  )
    throw new Error('Dice do not match the workflow request');
  flow.locals.rolls ||= {};
  flow.locals.rolls[current.key] = clone(rolls);
  return flow;
}

export function supplyChoice(flow, choice, definitions) {
  const definition = workflowDefinition(flow, definitions),
    current = definition.steps[flow.step],
    request = flow.locals[current?.requestKey];
  if (current?.op !== 'requestChoice')
    throw new Error('Workflow is not waiting for a choice');
  const options = request?.options?.map((option) =>
    option && typeof option === 'object' && 'value' in option
      ? option.value
      : option,
  );
  if (
    !Array.isArray(options) ||
    !options.some((option) => Object.is(option, choice))
  )
    throw new Error('Choice does not match the workflow request');
  flow.locals.choices ||= {};
  flow.locals.choices[current.key] = clone(choice);
  return flow;
}

export function workflowRollTotal(flow, key) {
  const groups = flow.locals.rolls?.[key];
  if (!groups) throw new Error(`Missing workflow roll: ${key}`);
  return groups.flat().reduce((sum, face) => sum + face, 0);
}

function valueAt(source, path) {
  return path.split('.').reduce((value, key) => value?.[key], source);
}

export function advanceWorkflow(
  flow,
  { definitions = {}, handlers = {} } = {},
) {
  const steps = workflowDefinition(flow, definitions).steps;
  let guard = 0;
  while (flow.step < steps.length) {
    if (++guard > 100) throw new Error('Workflow exceeded its step limit');
    const current = steps[flow.step];
    if (current.op === 'requestRoll') {
      if (!flow.locals.rolls?.[current.key])
        return {
          status: 'waiting',
          request: clone(flow.locals[current.requestKey]),
          requestKey: current.requestKey,
          rollKey: current.key,
          flow,
        };
      flow.step++;
      continue;
    }
    if (current.op === 'requestChoice') {
      if (
        !Object.prototype.hasOwnProperty.call(
          flow.locals.choices || {},
          current.key,
        )
      )
        return {
          status: 'waiting',
          request: clone(flow.locals[current.requestKey]),
          requestKey: current.requestKey,
          choiceKey: current.key,
          flow,
        };
      flow.step++;
      continue;
    }
    if (current.op === 'branchRoll') {
      const total = workflowRollTotal(flow, current.key) + (current.bonus || 0),
        threshold = current.thresholdKey
          ? valueAt(flow.locals, current.thresholdKey)
          : current.threshold;
      flow.locals[current.totalKey || `${current.key}Total`] = total;
      const target = total >= threshold ? current.success : current.failure;
      assertStepTarget(steps, target);
      flow.step = target;
      continue;
    }
    if (current.op === 'branchValue') {
      const target = valueAt(flow.locals, current.path)
        ? current.truthy
        : current.falsy;
      assertStepTarget(steps, target);
      flow.step = target;
      continue;
    }
    if (current.op === 'branchChoice') {
      const choice = flow.locals.choices?.[current.key],
        target = Object.prototype.hasOwnProperty.call(
          current.cases || {},
          choice,
        )
          ? current.cases[choice]
          : current.default;
      assertStepTarget(steps, target);
      flow.step = target;
      continue;
    }
    if (current.op === 'effect') {
      const handler = handlers[current.handler];
      if (!handler)
        throw new Error(`Unknown workflow handler: ${current.handler}`);
      const result = handler(current.params || {}, flow);
      if (result?.nextStep !== undefined) {
        assertStepTarget(steps, result.nextStep);
        flow.step = result.nextStep;
      } else flow.step++;
      if (result?.suspend) return { status: 'suspended', flow };
      continue;
    }
    if (current.op === 'complete') {
      flow.step = steps.length;
      break;
    }
    throw new Error(`Unknown workflow operation: ${current.op}`);
  }
  return { status: 'complete', flow };
}
