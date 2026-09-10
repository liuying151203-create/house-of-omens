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
  const Icon = glyphs[id] || (omen ? Eye : Package);
  return <Icon size={size} aria-hidden="true" />;
}
