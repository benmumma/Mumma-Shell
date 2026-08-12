export interface MummaApp {
  key: string;
  name: string;
  url: string;
  iconSrc: string;
  /**
   * Access-gated entry: HIDDEN from the switcher (not locked/greyed) unless
   * `appAccess[requiresAppAccess]` is truthy. Non-gated entries always render.
   * When appAccess is unavailable (standalone header), gated entries are
   * omitted — fail-closed.
   */
  gated?: boolean;
  /** appAccess key that must be truthy for a gated entry to render. Setting this implies `gated`. */
  requiresAppAccess?: string;
}

export const MUMMA_LABS_ICON = 'https://www.mumma.co/new_logos/mumma_labs_live.png';

const icon = (file: string) => `https://www.mumma.co/new_logos/${file}_live.png`;

// Icons follow the [app_name]_live.png scheme on www.mumma.co. Any not yet
// uploaded still get their URL listed so they light up once the PNGs exist;
// the header falls back to MUMMA_LABS_ICON on load error in the meantime.
export const MUMMA_APPS: MummaApp[] = [
  { key: 'dekko', name: 'Dekko', url: 'https://dekko.mumma.co', iconSrc: icon('dekko') },
  { key: 'forward', name: 'Forward', url: 'https://forward.mumma.co', iconSrc: icon('forward') },
  { key: 'intellect', name: 'Intellect', url: 'https://intellect.mumma.co', iconSrc: icon('intellect') },
  { key: 'mealmate', name: 'MealMate', url: 'https://mealmate.mumma.co', iconSrc: icon('mealmate') },
  { key: 'library', name: 'Library', url: 'https://library.mumma.co', iconSrc: icon('library') },
  { key: 'arcade', name: 'Arcade', url: 'https://arcade.mumma.co', iconSrc: icon('arcade') },
  { key: 'rem', name: 'REM', url: 'https://rem.mumma.co', iconSrc: icon('rem') },
  { key: 'scholarquest', name: 'ScholarQuest', url: 'https://scholar.mumma.co', iconSrc: icon('scholarquest') },
  { key: 'fitter', name: 'Fitter', url: 'https://fitter.mumma.co', iconSrc: icon('fitter') },
  // Pick'em lives inside Mumapps-Client, served under www.mumma.co/pickem
  { key: 'pickem', name: "Pick'em", url: 'https://www.mumma.co/pickem', iconSrc: icon('pickem') },
  { key: 'stonk', name: 'Stonk Master', url: 'https://stonk.mumma.co', iconSrc: icon('stonk'), gated: true, requiresAppAccess: 'stonk' },
  { key: 'admin', name: 'Mission Control', url: 'https://admin.mumma.co', iconSrc: icon('admin'), gated: true, requiresAppAccess: 'platform-admin' },
];
