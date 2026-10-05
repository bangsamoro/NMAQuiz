import { useState } from 'react';
import { Save, RotateCcw, Palette as PaletteIcon } from 'lucide-react';
import {
  PALETTE, DISPLAY_FONT, BODY_FONT, TEMPLATES, DEFAULT_PALETTE, DEFAULT_FONTS,
  DISPLAY_FONT_OPTIONS, BODY_FONT_OPTIONS, applyTheme, currentThemeSnapshot,
} from '../theme.js';
import { apiUpdateSettings } from '../api.js';

// Plain-language labels for each PALETTE key, shown in the custom-color grid.
const COLOR_FIELDS = [
  { key: 'cream', label: 'Page Background' },
  { key: 'paper', label: 'Card Background' },
  { key: 'ink', label: 'Primary Text' },
  { key: 'inkSoft', label: 'Secondary Text' },
  { key: 'emerald', label: 'Primary Brand Color' },
  { key: 'emeraldDark', label: 'Primary Brand Color (Dark)' },
  { key: 'gold', label: 'Accent / Highlight' },
  { key: 'line', label: 'Borders' },
  { key: 'red', label: 'Alert / Closed Status' },
];

function findMatchingTemplateId(palette, fonts) {
  const match = TEMPLATES.find((t) =>
    t.fonts.display === fonts.display && t.fonts.body === fonts.body &&
    Object.keys(t.palette).every((k) => t.palette[k] === palette[k])
  );
  return match ? match.id : 'custom';
}

// ============================================================================
// Admin: Branding tab — pick a template or fine-tune individual colors/fonts.
// Purely cosmetic (UI/UX only) — nothing here touches quiz content, scoring,
// or respondent data.
// ============================================================================
export function ThemeSettings({ token }) {
  const initial = currentThemeSnapshot();
  const [palette, setPalette] = useState(initial.palette);
  const [fonts, setFonts] = useState(initial.fonts);
  const [templateId, setTemplateId] = useState(findMatchingTemplateId(initial.palette, initial.fonts));
  const [status, setStatus] = useState(null);

  const setColor = (key, value) => {
    setPalette((p) => ({ ...p, [key]: value }));
    setTemplateId('custom');
  };
  const pickTemplate = (t) => {
    setPalette({ ...t.palette });
    setFonts({ ...t.fonts });
    setTemplateId(t.id);
  };
  const resetToDefault = () => {
    setPalette({ ...DEFAULT_PALETTE });
    setFonts({ ...DEFAULT_FONTS });
    setTemplateId('academic-navy');
  };

  const save = async () => {
    setStatus('saving');
    const result = await apiUpdateSettings({ palette, fonts }, token);
    if (result) {
      applyTheme({ palette, fonts }); // reflect live across the whole app immediately
      setStatus('saved');
    } else {
      setStatus('error');
    }
    setTimeout(() => setStatus(null), 2500);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl p-5" style={{ background: PALETTE.paper, border: `1.5px solid ${PALETTE.line}` }}>
        <div className="flex items-center gap-2 mb-1">
          <PaletteIcon size={16} color={PALETTE.emerald} />
          <span className="text-xs uppercase tracking-widest" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>Templates</span>
        </div>
        <p className="text-xs mb-4" style={{ color: PALETTE.inkSoft }}>Pick a starting point, then fine-tune individual colors and fonts below if you like. Changes only take effect on this site once you press Save.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {TEMPLATES.map((t) => {
            const selected = templateId === t.id;
            return (
              <button key={t.id} onClick={() => pickTemplate(t)} type="button"
                className="text-left rounded-lg p-4 transition-colors"
                style={{ border: `1.5px solid ${selected ? t.palette.emerald : PALETTE.line}`, background: selected ? `${t.palette.emerald}0D` : PALETTE.paper }}>
                <div className="flex items-center gap-1.5 mb-2.5">
                  {[t.palette.emerald, t.palette.emeraldDark, t.palette.gold, t.palette.red, t.palette.cream].map((c, i) => (
                    <span key={i} className="inline-block w-4 h-4 rounded-full" style={{ background: c, border: `1px solid ${PALETTE.line}` }} />
                  ))}
                </div>
                <div className="text-sm mb-1" style={{ fontFamily: t.fonts.display, fontWeight: 700, color: PALETTE.ink }}>{t.name}</div>
                <div className="text-xs" style={{ color: PALETTE.inkSoft }}>{t.blurb}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="flex flex-col gap-6">
          <div className="rounded-xl p-5" style={{ background: PALETTE.paper, border: `1.5px solid ${PALETTE.line}` }}>
            <span className="text-xs uppercase tracking-widest" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>Custom Colors</span>
            <div className="grid sm:grid-cols-2 gap-4 mt-3">
              {COLOR_FIELDS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-3">
                  <input type="color" value={palette[key]} onChange={(e) => setColor(key, e.target.value)}
                    className="w-10 h-10 rounded-lg cursor-pointer shrink-0" style={{ border: `1.5px solid ${PALETTE.line}`, padding: 2, background: PALETTE.paper }} />
                  <div className="min-w-0">
                    <div className="text-sm truncate" style={{ fontWeight: 600, color: PALETTE.ink }}>{label}</div>
                    <input value={palette[key]} onChange={(e) => setColor(key, e.target.value)}
                      className="text-xs w-24 px-1.5 py-0.5 rounded outline-none font-mono" style={{ border: `1px solid ${PALETTE.line}`, color: PALETTE.inkSoft }} />
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl p-5" style={{ background: PALETTE.paper, border: `1.5px solid ${PALETTE.line}` }}>
            <span className="text-xs uppercase tracking-widest" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>Fonts</span>
            <div className="grid sm:grid-cols-2 gap-4 mt-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs" style={{ color: PALETTE.inkSoft, fontWeight: 600 }}>Headings</span>
                <select value={fonts.display} onChange={(e) => { setFonts((f) => ({ ...f, display: e.target.value })); setTemplateId('custom'); }}
                  className="px-3 py-2.5 rounded-lg outline-none text-sm" style={{ border: `1.5px solid ${PALETTE.line}`, fontFamily: fonts.display }}>
                  {DISPLAY_FONT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs" style={{ color: PALETTE.inkSoft, fontWeight: 600 }}>Body Text</span>
                <select value={fonts.body} onChange={(e) => { setFonts((f) => ({ ...f, body: e.target.value })); setTemplateId('custom'); }}
                  className="px-3 py-2.5 rounded-lg outline-none text-sm" style={{ border: `1.5px solid ${PALETTE.line}`, fontFamily: fonts.body }}>
                  {BODY_FONT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={save} className="px-6 py-3 rounded-full text-white inline-flex items-center gap-2" style={{ background: `linear-gradient(135deg, ${palette.emerald}, ${palette.emeraldDark})`, fontWeight: 700 }}>
              <Save size={16} /> Save & Apply
            </button>
            <button onClick={resetToDefault} type="button" className="px-5 py-3 rounded-full text-sm inline-flex items-center gap-2" style={{ border: `1.5px solid ${PALETTE.ink}`, fontWeight: 700, color: PALETTE.ink }}>
              <RotateCcw size={14} /> Reset to Default
            </button>
            {status === 'saving' && <span className="text-sm" style={{ color: PALETTE.inkSoft }}>Saving…</span>}
            {status === 'saved' && <span className="text-sm" style={{ color: palette.emerald, fontWeight: 700 }}>Saved — applied site-wide.</span>}
            {status === 'error' && <span className="text-sm" style={{ color: palette.red, fontWeight: 700 }}>Could not save. Try again.</span>}
          </div>
        </div>

        {/* Live preview — driven entirely by local draft state, not the
            global PALETTE, so admins can compare before committing. */}
        <div className="lg:sticky lg:top-24">
          <span className="text-xs uppercase tracking-widest block mb-2" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>Live Preview</span>
          <div className="rounded-xl overflow-hidden" style={{ border: `1.5px solid ${PALETTE.line}`, background: palette.cream }}>
            <div className="px-5 py-6 relative overflow-hidden" style={{
              background: `linear-gradient(135deg, ${palette.emerald} 0%, ${palette.emeraldDark} 100%)`,
              borderTop: `3px solid ${palette.gold}`, borderBottom: `1px solid ${palette.gold}66`,
            }}>
              <div className="text-[10px] uppercase tracking-[0.25em] mb-1" style={{ color: palette.gold, fontWeight: 700 }}>New Muslim Academy - Philippines</div>
              <div className="text-lg" style={{ fontFamily: fonts.display, color: palette.paper, fontWeight: 800 }}>Quiz Challenge</div>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div className="rounded-lg p-3" style={{ background: palette.paper, border: `1.5px solid ${palette.line}` }}>
                <div className="text-sm mb-1" style={{ fontFamily: fonts.display, color: palette.ink, fontWeight: 700 }}>Sample Quiz Title</div>
                <div className="text-xs" style={{ fontFamily: fonts.body, color: palette.inkSoft }}>5 questions · Hadith</div>
              </div>
              <button type="button" className="px-4 py-2.5 rounded-full text-sm self-start" style={{ background: `linear-gradient(135deg, ${palette.emerald}, ${palette.emeraldDark})`, color: '#fff', fontFamily: fonts.body, fontWeight: 700 }}>
                Start Quiz
              </button>
              <span className="text-xs px-2.5 py-1 rounded-full self-start" style={{ background: `${palette.red}1A`, color: palette.red, fontFamily: fonts.body, fontWeight: 700 }}>Closed</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
