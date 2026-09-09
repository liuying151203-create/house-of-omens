// A viewport of free space on every edge lets even outer rooms move across the screen.
export function mapScrollTarget({ point, minX, minY, zoom, width, height }) {
  const gap = zoom / 11;
  return {
    left: width / 2 + (point.x - minX) * (zoom + gap) + zoom / 2,
    top: height / 2 + (point.y - minY) * (zoom + gap) + zoom / 2,
  };
}
