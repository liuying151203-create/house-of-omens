import {
  Camera,
  Compass,
  BookOpen,
  Cross,
  PenLine,
  Wrench,
  Skull,
  Ghost,
} from 'lucide-react';
import portraits from '../lib/portrait-art.json';
import ItemGlyph from './item-glyph';
const roleIcons = [PenLine, Compass, BookOpen, Cross, Camera, Wrench];

export default function ExplorerEmblem({ hero, small = false, token = false }) {
  const wolf =
    !hero.dead &&
    (hero.faction === 'wolves' || ['alpha', 'wolf'].includes(hero.combatRole));
  const portrait = !hero.dead && !hero.traitor && !wolf && portraits[hero.id];
  const Icon = hero.dead
    ? Skull
    : hero.traitor
      ? Ghost
      : roleIcons[hero.id % roleIcons.length] || Compass;
  return (
    <span
      className={
        'explorer-emblem ' +
        (small ? 'emblem-small ' : '') +
        (token ? 'emblem-token ' : '') +
        (wolf ? 'emblem-wolf ' : '') +
        (portrait ? 'emblem-portrait' : '')
      }
      style={{ '--explorer-color': hero.color }}
      aria-hidden="true"
    >
      {wolf ? (
        <ItemGlyph id="wolf" />
      ) : portrait ? (
        // oxlint-disable-next-line nextjs/no-img-element -- 离线构建将肖像内嵌为 data URL，沿用原生 img。
        <img src={portrait.src} alt="" draggable={false} />
      ) : (
        <Icon />
      )}
      <b>{hero.mark}</b>
    </span>
  );
}
