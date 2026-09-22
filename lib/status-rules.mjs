const CLEANSEABLE_STATUSES = {
  infection: '狼毒感染',
  'bloodmoon-infection': '血月感染',
  poison: '中毒',
  bleeding: '流血',
  fear: '恐惧',
  slow: '减速',
};

export function canCleanseStatus(status) {
  if (!status || status.removable === false) return false;
  return (
    Object.hasOwn(CLEANSEABLE_STATUSES, status.id) ||
    (status.removable === true && status.negative === true)
  );
}

export function cleanseableStatuses(hero) {
  return (hero?.statuses || []).flatMap((status, index) =>
    canCleanseStatus(status)
      ? [
          {
            key: `status:${index}`,
            index,
            id: status.id,
            ...(status.instanceId ? { instanceId: status.instanceId } : {}),
            label: status.label || CLEANSEABLE_STATUSES[status.id] || status.id,
          },
        ]
      : [],
  );
}
