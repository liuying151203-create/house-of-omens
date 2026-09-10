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
const roleIcons = [PenLine, Compass, BookOpen, Cross, Camera, Wrench];

export default function ExplorerEmblem({ hero, small = false }) {
  const Icon = hero.dead
    ? Skull
    : hero.traitor
      ? Ghost
      : roleIcons[hero.id % roleIcons.length] || Compass;
  return (
    <span
      className={'explorer-emblem ' + (small ? 'emblem-small' : '')}
      style={{ '--explorer-color': hero.color }}
      aria-hidden="true"
    >
      <Icon />
      <b>{hero.mark}</b>
    </span>
  );
}
