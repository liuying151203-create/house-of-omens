// 怪物属性与受伤模型：固定属性使用击晕，属性轨怪物由调用方提供分配。
export const MONSTER_TRAITS = ['might', 'speed', 'sanity', 'knowledge'];
const DAMAGE_TRAITS = {
  physical: ['might', 'speed'],
  mental: ['sanity', 'knowledge'],
};

export function monsterTraitValue(monster, trait) {
  if (!MONSTER_TRAITS.includes(trait)) throw new Error('未知的怪物属性');
  if (monster.traitModel === 'fixed') {
    const value = monster.traits?.[trait];
    if (!Number.isInteger(value) || value < 0)
      throw new Error('怪物固定属性无效');
    return value;
  }
  if (monster.traitModel === 'tracks') {
    const track = monster.tracks?.[trait],
      position = monster.positions?.[trait];
    if (
      !Array.isArray(track) ||
      !Number.isInteger(position) ||
      position < 0 ||
      position >= track.length ||
      !Number.isInteger(track[position])
    )
      throw new Error('怪物属性轨无效');
    return track[position];
  }
  throw new Error('未知的怪物属性模型');
}

// 旧测试敌人暂时保留原数值；新怪物始终从其四项属性读取。
export function enemyTraitValue(enemy, trait) {
  return enemy.traitModel ? monsterTraitValue(enemy, trait) : enemy[trait];
}

export function changeMonsterTrait(
  monster,
  trait,
  delta,
  { mentalEffect = false } = {},
) {
  if (monster.traitModel !== 'tracks' || !Number.isInteger(delta))
    throw new Error('怪物属性不可调整');
  const beforeValue = monsterTraitValue(monster, trait);
  if (
    mentalEffect &&
    monster.mentalImmune
  )
    return {
      before: monster.positions[trait],
      after: monster.positions[trait],
      beforeValue,
      afterValue: beforeValue,
      immune: true,
    };
  const before = monster.positions[trait];
  const minimum = monster.elimination === 'traitZero' ? 0 : 1;
  monster.positions[trait] = Math.max(
    minimum,
    Math.min(monster.tracks[trait].length - 1, before + delta),
  );
  return {
    before,
    after: monster.positions[trait],
    beforeValue,
    afterValue: monsterTraitValue(monster, trait),
    immune: false,
    defeated:
      monster.elimination === 'traitZero' && monster.positions[trait] === 0,
  };
}

// 自动怪物没有玩家分配伤害。依次选择剩余空间最多的轨道，保证可重放。
export function automaticMonsterDamage(monster, type, amount, allowedTraits) {
  if (monster.traitModel !== 'tracks')
    return { ...monsterDamage(monster, type, amount), ignored: 0 };
  const permitted = DAMAGE_TRAITS[type];
  if (
    !permitted ||
    !Number.isInteger(amount) ||
    amount < 0 ||
    (allowedTraits &&
      (!allowedTraits.length ||
        allowedTraits.some((trait) => !permitted.includes(trait))))
  )
    throw new Error('无效的怪物伤害');
  const traits = allowedTraits || permitted;
  if (type === 'mental' && monster.mentalImmune)
    return {
      applied: 0,
      ignored: amount,
      immune: true,
      stunned: false,
      allocation: {},
    };
  for (const trait of traits) monsterTraitValue(monster, trait);
  const minimum = monster.elimination === 'traitZero' ? 0 : 1;
  const allocation = Object.fromEntries(traits.map((trait) => [trait, 0]));
  for (let i = 0; i < amount; i++) {
    const available = traits
      .map((trait) => ({
        trait,
        remaining: monster.positions[trait] - allocation[trait] - minimum,
      }))
      .filter((entry) => entry.remaining > 0)
      .sort((a, b) => b.remaining - a.remaining);
    if (!available.length) break;
    allocation[available[0].trait]++;
  }
  const applied = Object.values(allocation).reduce(
    (sum, value) => sum + value,
    0,
  );
  const result = monsterDamage(monster, type, applied, allocation);
  return {
    ...result,
    allocation,
    ignored: amount - applied,
    defeated:
      monster.elimination === 'traitZero' &&
      traits.some((trait) => monster.positions[trait] === 0),
  };
}

export function monsterDamage(monster, type, amount, allocation) {
  const traits = DAMAGE_TRAITS[type];
  if (!traits || !Number.isInteger(amount) || amount < 0)
    throw new Error('无效的怪物伤害');
  if (type === 'mental' && monster.mentalImmune)
    return { applied: 0, immune: true, stunned: false };
  if (!amount) return { applied: 0, immune: false, stunned: false };
  if (monster.traitModel === 'fixed') {
    for (const trait of MONSTER_TRAITS) monsterTraitValue(monster, trait);
    monster.stunned = true;
    return { applied: amount, immune: false, stunned: true };
  }
  if (monster.traitModel !== 'tracks') throw new Error('未知的怪物属性模型');
  const entries = traits.map((trait) => [trait, allocation?.[trait] ?? 0]);
  const minimum = monster.elimination === 'traitZero' ? 0 : 1;
  if (
    entries.some(
      ([trait, count]) =>
        !Number.isInteger(count) ||
        count < 0 ||
        count > monster.positions[trait] - minimum,
    ) ||
    entries.reduce((sum, [, count]) => sum + count, 0) !== amount
  )
    throw new Error('无效的怪物伤害分配');
  for (const [trait] of entries) monsterTraitValue(monster, trait);
  for (const [trait, count] of entries) monster.positions[trait] -= count;
  return { applied: amount, immune: false, stunned: false };
}

export function consumeMonsterStun(monster) {
  if (!monster.stunned) return false;
  monster.stunned = false;
  return true;
}
