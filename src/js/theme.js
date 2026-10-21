// Shared design tokens used across every component/page. Keep this the
// single source of truth for colors/fonts/category metadata so nothing
// drifts out of sync between files.
//
// THEMING SYSTEM
// ----------------------------------------------------------------------
// PALETTE (and DISPLAY_FONT/BODY_FONT below) are intentionally mutable —
// components read PALETTE.xxx / DISPLAY_FONT directly inside their render
// functions rather than destructuring once at import time, so mutating
// these in place (via applyTheme()) reflows the *entire* app immediately,
// no prop drilling or React context needed. This is what lets the admin's
// Branding tab reskin every screen live after a save, and what lets
// App.jsx apply the saved theme from the server before the first paint.
//
// TEMPLATES are named starting points an admin can pick in the Branding
// tab; DEFAULT_PALETTE is what a brand-new install starts with before any
// admin customization has been saved.

export const DEFAULT_PALETTE = {
  cream: '#F6F4EE',        // page background — warm ivory, not cool-tinted
  paper: '#FFFFFF',        // card background
  ink: '#152238',          // primary text — deep academic navy-black
  inkSoft: '#5B6478',      // secondary text
  emerald: '#1F3A5F',      // primary brand color (kept this key name for
  emeraldDark: '#0F2036',  // compatibility with every component that
                            // already reads PALETTE.emerald/emeraldDark —
                            // it now means "primary", not literally green)
  gold: '#B98B33',         // accent — muted bronze-gold, not bright yellow
  line: '#E4E0D5',         // borders — warm neutral, not blue-tinted
  red: '#8C2F39',          // "closed / error / alert" accent — muted maroon
};

export const DEFAULT_FONTS = {
  display: "'Playfair Display', Georgia, 'Times New Roman', serif",
  body: "'Inter', 'Helvetica Neue', Arial, sans-serif",
};

export const CATEGORIES = ['Hadith', "Qur'an", 'Seerah', 'Aqeedah', 'Webinars', 'Unang Hakbang', 'Salaah at Wudhu', 'Pagsamba', 'Paniniwala', 'Tajweed/Tahseen'];

// Curated starting points shown as cards in the admin Branding tab. Each
// bundles a full palette + font pairing so picking one is a single click;
// admins can still fine-tune individual colors afterward (that's a
// "custom" edit layered on top, not a different mode).
export const TEMPLATES = [
  {
    id: 'academic-navy',
    name: 'Academic Navy',
    blurb: 'Deep navy & bronze-gold on ivory — formal, university-catalog feel.',
    palette: DEFAULT_PALETTE,
    fonts: DEFAULT_FONTS,
  },
  {
    id: 'scholarly-emerald',
    name: 'Scholarly Emerald',
    blurb: 'Deep green & antique gold — traditional, library/seal feel.',
    palette: {
      cream: '#F4F7F4', paper: '#FFFFFF', ink: '#122A22', inkSoft: '#546A61',
      emerald: '#1F5C4A', emeraldDark: '#123B2F', gold: '#C6A15B', line: '#DCE6DF', red: '#8C3B32',
    },
    fonts: { display: "'Merriweather', Georgia, serif", body: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
  },
  {
    id: 'heritage-maroon',
    name: 'Heritage Maroon',
    blurb: 'Maroon & gold on parchment — ceremonial, diploma-style feel.',
    palette: {
      cream: '#F8F4EF', paper: '#FFFFFF', ink: '#2A1620', inkSoft: '#6B5A61',
      emerald: '#6B1F2A', emeraldDark: '#450F17', gold: '#C9A227', line: '#EAE0D8', red: '#3C4A66',
    },
    fonts: { display: "'Playfair Display', Georgia, serif", body: "'Source Sans 3', 'Helvetica Neue', Arial, sans-serif" },
  },
  {
    id: 'modern-slate',
    name: 'Modern Slate',
    blurb: 'Slate blue & brass, sans-serif headings — contemporary institute feel.',
    palette: {
      cream: '#F5F6F8', paper: '#FFFFFF', ink: '#1C2530', inkSoft: '#5B6675',
      emerald: '#25405C', emeraldDark: '#152736', gold: '#9C7A3C', line: '#E2E5EA', red: '#7A3B3B',
    },
    fonts: { display: "'Poppins', 'Helvetica Neue', sans-serif", body: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
  },
];

// Fonts the Branding tab is allowed to offer in its dropdowns — kept in
// sync with the <link> tag in index.html; adding an option here without
// also loading it in index.html would silently fall back to the browser
// default serif/sans-serif.
export const DISPLAY_FONT_OPTIONS = [
  { label: 'Playfair Display (serif)', value: "'Playfair Display', Georgia, 'Times New Roman', serif" },
  { label: 'Merriweather (serif)', value: "'Merriweather', Georgia, serif" },
  { label: 'Poppins (sans-serif)', value: "'Poppins', 'Helvetica Neue', sans-serif" },
];
export const BODY_FONT_OPTIONS = [
  { label: 'Inter', value: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
  { label: 'Source Sans 3', value: "'Source Sans 3', 'Helvetica Neue', Arial, sans-serif" },
];

// Live, mutable design tokens — see the big comment at the top of this file.
export const PALETTE = { ...DEFAULT_PALETTE };
export let DISPLAY_FONT = DEFAULT_FONTS.display;
export let BODY_FONT = DEFAULT_FONTS.body;

export const CATEGORY_COLORS = {};
function recomputeCategoryColors() {
  CATEGORY_COLORS['Hadith'] = PALETTE.emerald;
  CATEGORY_COLORS["Qur'an"] = PALETTE.red;
  CATEGORY_COLORS['Seerah'] = PALETTE.emeraldDark;
  CATEGORY_COLORS['Aqeedah'] = PALETTE.gold;
  CATEGORY_COLORS['Webinars'] = PALETTE.inkSoft;
  CATEGORY_COLORS['Unang Hakbang'] = PALETTE.emerald;
  CATEGORY_COLORS['Salaah at Wudhu'] = PALETTE.emeraldDark;
  CATEGORY_COLORS['Pagsamba'] = PALETTE.gold;
  CATEGORY_COLORS['Paniniwala'] = PALETTE.red;
  CATEGORY_COLORS['Tajweed/Tahseen'] = PALETTE.emerald;
}
recomputeCategoryColors();

// Applies a saved/selected theme in place. `settings` is whatever shape
// came back from GET /api/settings (or a TEMPLATES[i] entry): an object
// with an optional `palette` sub-object (any subset of PALETTE's keys)
// and an optional `fonts` sub-object ({ display, body }). Unknown/missing
// keys are simply left as-is, so a partial custom-color save never wipes
// out the rest of the theme.
export function applyTheme(settings) {
  if (!settings || typeof settings !== 'object') return;
  if (settings.palette && typeof settings.palette === 'object') {
    for (const key of Object.keys(PALETTE)) {
      if (typeof settings.palette[key] === 'string' && settings.palette[key]) {
        PALETTE[key] = settings.palette[key];
      }
    }
  }
  if (settings.fonts && typeof settings.fonts === 'object') {
    if (settings.fonts.display) DISPLAY_FONT = settings.fonts.display;
    if (settings.fonts.body) BODY_FONT = settings.fonts.body;
  }
  recomputeCategoryColors();
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.style.setProperty('--color-cream', PALETTE.cream);
    document.documentElement.style.setProperty('--color-paper', PALETTE.paper);
    document.documentElement.style.setProperty('--color-ink', PALETTE.ink);
    document.documentElement.style.setProperty('--color-ink-soft', PALETTE.inkSoft);
    document.documentElement.style.setProperty('--color-emerald', PALETTE.emerald);
    document.documentElement.style.setProperty('--color-emerald-dark', PALETTE.emeraldDark);
    document.documentElement.style.setProperty('--color-gold', PALETTE.gold);
    document.documentElement.style.setProperty('--color-line', PALETTE.line);
    document.documentElement.style.setProperty('--color-red', PALETTE.red);
    document.documentElement.style.setProperty('--font-display', DISPLAY_FONT);
    document.documentElement.style.setProperty('--font-body', BODY_FONT);
  }
}

// Snapshot of the currently-applied theme, in the same shape GET/PUT
// /api/settings use — handy for the Branding tab's "here's what's live"
// starting draft, and for POSTing back after an admin edits it.
export function currentThemeSnapshot() {
  return { palette: { ...PALETTE }, fonts: { display: DISPLAY_FONT, body: BODY_FONT } };
}
