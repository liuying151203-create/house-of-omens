import art from '../lib/item-art.json';
import {
  Coffee,
  BriefcaseMedical,
  Pill,
  Wrench,
  Flashlight,
  Footprints,
  Coins,
  Bandage,
  CupSoda,
  Bell,
  BookOpen,
  Drama,
  Compass,
  Gem,
  Bone,
  KeyRound,
  Eye,
  Package,
} from 'lucide-react';
const glyphs = {
  coffee: Coffee,
  medkit: BriefcaseMedical,
  tonic: Pill,
  crowbar: Wrench,
  flashlight: Flashlight,
  boots: Footprints,
  tools: Wrench,
  lucky: Coins,
  bandage: Bandage,
  tea: CupSoda,
  bell: Bell,
  book: BookOpen,
  mask: Drama,
  compass: Compass,
  locket: Gem,
  bone: Bone,
  key: KeyRound,
  eye: Eye,
};
export default function ItemGlyph({ id, omen = false, size = 26 }) {
  if (art[id])
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        fill="currentColor"
        stroke="none"
        aria-hidden="true"
        className="item-art"
      >
        {art[id].paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
    );
  const Icon = glyphs[id] || (omen ? Eye : Package);
  return <Icon size={size} aria-hidden="true" />;
}
