export interface MummaApp {
  key: string;
  name: string;
  url: string;
  iconSrc: string;
  /** appAccess key that must be truthy for this entry to render; omit for always-visible */
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
  { key: 'admin', name: 'Mission Control', url: 'https://admin.mumma.co', iconSrc: icon('admin'), requiresAppAccess: 'platform-admin' },
];
