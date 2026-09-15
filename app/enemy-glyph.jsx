import ItemGlyph from './item-glyph';
import { enemyMark } from '../lib/game-view.mjs';
export default function EnemyGlyph({ enemy, size = 24 }) {
  return ['alpha', 'wolf'].includes(enemy.kind) ? (
    <ItemGlyph id="wolf" size={size} />
  ) : (
    <span aria-hidden="true">{enemyMark(enemy)}</span>
  );
}
