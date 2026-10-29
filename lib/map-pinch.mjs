// 保持双指中点对应的地图位置不变，同时允许双指平移。
export function pinchFrame({
  startDistance,
  distance,
  startZoom,
  anchor,
  midpoint,
  padding,
}) {
  const zoom = Math.max(
    4,
    Math.min(155, Math.round((startZoom * distance) / startDistance)),
  );
  return {
    zoom,
    left: padding.x + anchor.x * zoom - midpoint.x,
    top: padding.y + anchor.y * zoom - midpoint.y,
  };
}
