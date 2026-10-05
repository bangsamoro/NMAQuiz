import { Share2 } from 'lucide-react';
import { PALETTE } from '../theme.js';

const FB_PAGE_URL = 'https://www.facebook.com/newmuslimph';

// Facebook doesn't let sites verify "does this person follow our Page" via
// API for use cases like this — so this is a soft gate: an embedded official
// Follow button (no App ID required, pure iframe) plus an honor-system
// checkbox. It's the same pattern most small quiz/giveaway pages use.
export function FacebookFollowGate({ checked, onChange, error }) {
  return (
    <div className="rounded-2xl p-4 sm:p-5 mb-5 text-left" style={{ background: PALETTE.cream, border: `1.5px solid ${error ? PALETTE.red : PALETTE.line}` }}>
      {!checked && (
        <>
          <div className="text-xs uppercase tracking-widest mb-3" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>Step 1 · Sundan ang aming FB Page</div>
          <div className="flex justify-center mb-2" style={{ width: 280, height: 90, margin: '0 auto', overflow: 'hidden', borderRadius: 10 }}>
            <iframe
              title="New Muslim Academy - Philippines Facebook Page"
              src={`https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(FB_PAGE_URL)}&tabs=&width=280&height=90&small_header=true&adapt_container_width=false&hide_cover=true&show_facepile=false`}
              width="280" height="90" style={{ border: 'none', display: 'block' }}
              scrolling="no" frameBorder="0"
              allow="encrypted-media; picture-in-picture; web-share"
            />
          </div>
          <a href={FB_PAGE_URL} target="_blank" rel="noopener noreferrer"
            className="text-xs inline-flex items-center gap-1 mb-4" style={{ color: PALETTE.emerald, fontWeight: 700 }}>
            <Share2 size={12} /> Buksan ang FB Page sa bagong tab
          </a>
        </>
      )}
      <label className="flex items-start gap-2.5 cursor-pointer select-none">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 shrink-0" style={{ accentColor: PALETTE.emerald }} />
        <span className="text-sm" style={{ color: PALETTE.ink }}>
          Oo, sundan/follow ko na po ang <span style={{ fontWeight: 700, color: PALETTE.emerald }}>New Muslim Academy - Philippines</span> Facebook Page.
        </span>
      </label>
      {error && <div className="text-xs mt-1.5" style={{ color: PALETTE.red }}>{error}</div>}
    </div>
  );
}
