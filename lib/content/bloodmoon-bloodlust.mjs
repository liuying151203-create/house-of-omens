import { isAlpha, moonPhase } from './bloodmoon-actors.mjs';
import { traitPositionBounds, BODY_TRAITS } from './bloodmoon-health.mjs';

export function bloodlustTriggers(game, event) {
  const alpha = game.heroes[event.sourceHeroId];
  if (
    event.when !== 'AfterDamage' ||
    event.causeTag !== 'actorAttack' ||
    event.damageType !== 'physical' ||
    event.actualAmount <= 0 ||
    !isAlpha(game, alpha) ||
    alpha.dead ||
    moonPhase(game.elapsed) === 'awakening'
  )
    return [];
  return [
    {
      id: 'bloodmoon.bloodlust',
      sourceId: `bloodmoon:bloodlust:${alpha.id}`,
      sourceLabel: '嗜血',
      when: event.when,
      oncePerRoot: true,
      priority: -10,
      effects: [
        {
          op: 'bloodmoon.flow',
          params: {
            kind: 'bloodlust',
            heroId: alpha.id,
            amount: event.actualAmount,
          },
        },
      ],
    },
  ];
}

export function prepareBloodlust(game, flow, context) {
  const l = flow.locals,
    hero = game.heroes[l.heroId];
  if (!isAlpha(game, hero) || hero.dead) return;
  l.remaining ??= l.amount;
  l.restored ||= { might: 0, speed: 0 };
  const options = BODY_TRAITS.flatMap((trait) => {
    const maximum = traitPositionBounds(game, hero, trait, {
      causeTag: 'bloodlust',
    }).maximum;
    return hero.stats[trait] < maximum
      ? [
          {
            value: trait,
            label: `${trait === 'might' ? '力量' : '速度'}右移1格`,
            detail: `当前第${hero.stats[trait]}格 → 第${hero.stats[trait] + 1}格，本次最高第${maximum}格。`,
          },
        ]
      : [];
  });
  if (l.remaining > 0 && options.length) {
    l.needsChoice = true;
    l.choiceRequest = {
      kind: 'choiceRequest',
      heroId: hero.id,
      title: '嗜血 · 分配身体恢复',
      text: `本次主动撕咬实际造成${l.amount}点身体伤害，可恢复相同格数；还剩${l.remaining}格，逐格自由分配到力量或速度。满月最高第4格，血月最高第7格；银弹永久削弱后最高第4格。恢复速度不额外赠送当前回合移动点。`,
      options,
      timeoutChoice: options[0].value,
      visibility: { heroIds: [hero.id] },
    };
    return;
  }
  if (l.reported) return;
  l.reported = true;
  const text = `${hero.name}完成嗜血恢复：力量右移${l.restored.might}格、速度右移${l.restored.speed}格${l.remaining ? `；因恢复上限，剩余${l.remaining}格未恢复` : ''}。`;
  context.record('BloodlustRestored', {
    heroId: hero.id,
    amount: l.amount,
    allocation: l.restored,
    unused: l.remaining,
    text,
  });
  context.log(text);
}

export function chooseBloodlust(game, flow, context) {
  const l = flow.locals,
    hero = game.heroes[l.heroId],
    trait = l.choices.choice;
  if (
    !isAlpha(game, hero) ||
    hero.dead ||
    l.remaining <= 0 ||
    !BODY_TRAITS.includes(trait)
  )
    return;
  const before = hero.stats[trait];
  context.changeTrait(hero, trait, 1, { causeTag: 'bloodlust' });
  const actual = hero.stats[trait] - before;
  l.restored[trait] += actual;
  l.remaining -= actual;
  delete l.choices.choice;
  return { nextStep: 0 };
}
