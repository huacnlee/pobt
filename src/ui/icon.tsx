// POBT's icons: Lucide's (nsh-icon-lucide), named as the app knows them and drawn in a theme token's colour, at one of
// a few sizes.
import { Icon as NshIcon } from "nsh-icon";
import {
  ArrowRight,
  Bell,
  ChartCandlestick,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Filter,
  FolderOpen,
  Info,
  Minus,
  Plus,
  RefreshCw,
  Repeat,
  RotateCcw,
  Search,
  Settings,
  Shield,
  Sparkles,
  Star,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Wallet,
  X,
} from "nsh-icon-lucide";

const ICONS = {
  "arrow-right": ArrowRight,
  bell: Bell,
  "chart-candlestick": ChartCandlestick,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  "circle-check": CircleCheck,
  clock: Clock,
  copy: Copy,
  download: Download,
  "external-link": ExternalLink,
  filter: Filter,
  "folder-open": FolderOpen,
  info: Info,
  minus: Minus,
  plus: Plus,
  "refresh-cw": RefreshCw,
  repeat: Repeat,
  "rotate-ccw": RotateCcw,
  search: Search,
  settings: Settings,
  shield: Shield,
  sparkles: Sparkles,
  star: Star,
  // Lucide's star, filled: a chosen star (the watchlist's)
  "star-filled": Star.replace("fill='none'", "fill='currentColor'"),
  trash: Trash2,
  "trending-down": TrendingDown,
  "trending-up": TrendingUp,
  "triangle-alert": TriangleAlert,
  wallet: Wallet,
  x: X,
};

export type IconName = keyof typeof ICONS;
export type Tone = "foreground" | "muted" | "primary" | "on-primary" | "banner" | "trim" | "up" | "down" | "warning" | "destructive";

const TONE: Record<Tone, string> = {
  foreground: "text-foreground",
  muted: "text-muted-foreground",
  primary: "text-primary",
  "on-primary": "text-primary-foreground",
  banner: "text-banner-foreground",
  trim: "text-trim-hi",
  up: "text-up",
  down: "text-down",
  warning: "text-warning",
  destructive: "text-destructive",
};

const SIZE = { xs: 12, sm: 14, md: 16, lg: 20, xl: 32 } as const;

/** An icon in a tone; `label` is what a screen reader says (without it the icon is decorative). */
export function Icon(props: { name: IconName; size?: keyof typeof SIZE; tone?: Tone; label?: string; strokeWidth?: number }) {
  return <NshIcon icon={ICONS[props.name]} size={SIZE[props.size ?? "md"]} strokeWidth={props.strokeWidth} label={props.label} class={TONE[props.tone ?? "foreground"]} />;
}
