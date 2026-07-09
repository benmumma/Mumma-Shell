export interface MummaApp {
  key: string;
  name: string;
  url: string;
  iconSrc: string;
}

export const MUMMA_LABS_ICON = 'https://www.mumma.co/new_logos/mumma_labs_2026.png';

const icon = (file: string) => `https://www.mumma.co/new_logos/${file}_2026.png`;

// Some icons (family, gallery, games) aren't uploaded to www.mumma.co yet;
// their URLs are listed anyway so they light up once the PNGs exist, and the
// header falls back to MUMMA_LABS_ICON on load error in the meantime.
export const MUMMA_APPS: MummaApp[] = [
  { key: 'family', name: 'Family Dashboard', url: 'https://family.mumma.co', iconSrc: icon('family') },
  { key: 'forward', name: 'Forward', url: 'https://forward.mumma.co', iconSrc: icon('forward') },
  { key: 'intellect', name: 'Intellect', url: 'https://intellect.mumma.co', iconSrc: icon('ii') },
  { key: 'mealmate', name: 'MealMate', url: 'https://mealmate.mumma.co', iconSrc: icon('mm') },
  { key: 'gallery', name: 'Gallery', url: 'https://gallery.mumma.co', iconSrc: icon('gallery') },
  { key: 'games', name: 'Games', url: 'https://games.mumma.co', iconSrc: icon('games') },
  { key: 'rem', name: 'REM', url: 'https://rem.mumma.co', iconSrc: icon('rem') },
  { key: 'scholarquest', name: 'ScholarQuest', url: 'https://scholar.mumma.co', iconSrc: icon('scholar') },
  { key: 'fitter', name: 'Fitter', url: 'https://fitter.mumma.co', iconSrc: icon('fitter') },
];
