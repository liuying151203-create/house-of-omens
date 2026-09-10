// A viewport of free space on every edge lets even outer rooms move across the screen.
export function mapScrollTarget({ point, minX, minY, zoom, width, height }) {
  const gap = zoom / 11;
  return {
    left: width / 2 + (point.x - minX) * (zoom + gap) + zoom / 2,
    top: height / 2 + (point.y - minY) * (zoom + gap) + zoom / 2,
  };
}

// Expanding the grid must not move rooms already visible at a user-chosen position.
export function preserveMapScroll({ left, top, previous, minX, minY, zoom }) {
  const pitch = zoom + zoom / 11;
  return {
    left: left + (previous.minX - minX) * pitch,
    top: top + (previous.minY - minY) * pitch,
  };
}
