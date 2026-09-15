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
const roleIcons = [PenLine, Compass, BookOpen, Cross, Camera, Wrench];

export default function ExplorerEmblem({ hero, small = false, token = false }) {
  const portrait = !hero.dead && !hero.traitor && portraits[hero.id];
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
        (portrait ? 'emblem-portrait' : '')
      }
      style={{ '--explorer-color': hero.color }}
      aria-hidden="true"
    >
      {portrait ? (
        <img src={portrait.src} alt="" draggable={false} />
      ) : (
        <Icon />
      )}
      <b>{hero.mark}</b>
    </span>
  );
}
