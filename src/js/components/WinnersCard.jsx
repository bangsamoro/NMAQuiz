import { useState, useEffect, useRef } from 'react';
import { X, Download } from 'lucide-react';
import { PALETTE, DISPLAY_FONT, BODY_FONT } from '../theme.js';
import { formatTimeMMSS } from '../utils.js';

// ============================================================================
// Admin: winners announcement card (for posting on social media)
// ============================================================================
const WINNERS_CARD_W = 1200;
const WINNERS_CARD_H = 630; // matches Facebook's recommended share-image size
const WINNER_PRIZES = [300, 200, 100]; // 1st, 2nd, 3rd place

export function WinnersCardContent({ quizTitle, winners }) {
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div style={{
      width: WINNERS_CARD_W, height: WINNERS_CARD_H, position: 'relative', overflow: 'hidden',
      background: `linear-gradient(135deg, ${PALETTE.emerald} 0%, ${PALETTE.emeraldDark} 60%, ${PALETTE.ink} 100%)`,
      fontFamily: DISPLAY_FONT, color: '#fff',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '48px 72px', boxSizing: 'border-box',
    }}>
      <div style={{ position: 'absolute', top: -90, right: -90, width: 320, height: 320, borderRadius: '50%', background: PALETTE.gold, opacity: 0.16 }} />
      <div style={{ position: 'absolute', bottom: -110, left: -70, width: 300, height: 300, borderRadius: '50%', background: PALETTE.red, opacity: 0.2 }} />
      <div style={{ position: 'absolute', top: 24, left: 0, right: 0, textAlign: 'center', fontSize: 13, letterSpacing: 7, textTransform: 'uppercase', color: PALETTE.gold, fontWeight: 700 }}>
        New Muslim Academy - Philippines
      </div>

      <div style={{ fontSize: 42, fontWeight: 800, marginBottom: 8, textAlign: 'center', lineHeight: 1.15 }}>
        🎉 Congratulations to Our Winners! 🎉
      </div>
      <div style={{ fontSize: 19, color: '#E7ECFA', marginBottom: 34, textAlign: 'center', fontFamily: BODY_FONT, fontWeight: 500 }}>
        {quizTitle}
      </div>

      <div style={{ display: 'flex', gap: 26, justifyContent: 'center', width: '100%' }}>
        {winners.map((w, i) => (
          <div key={w.id} style={{
            flex: '1 1 0', maxWidth: 300, background: 'rgba(255,255,255,0.10)',
            border: `1.5px solid ${[PALETTE.gold, PALETTE.red, '#FFFFFF'][i] ?? 'rgba(255,255,255,0.3)'}`,
            borderRadius: 20, padding: '26px 18px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 46, marginBottom: 10, lineHeight: 1 }}>{medals[i]}</div>
            <div style={{ fontSize: 21, fontWeight: 800, marginBottom: 10, wordBreak: 'break-word' }}>{w.name}</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              {[
                { label: 'Score', value: `${Math.round((w.score / w.total) * 100)}%`, bg: PALETTE.emerald, color: '#fff' },
                { label: 'Time', value: formatTimeMMSS(w.durationMs), bg: PALETTE.red, color: '#fff' },
                { label: 'Prize', value: WINNER_PRIZES[i] ?? 0, bg: PALETTE.gold, color: PALETTE.ink },
              ].map((stat) => (
                <span key={stat.label} style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                  fontSize: 11, fontWeight: 700, color: stat.color, background: stat.bg,
                  paddingTop: 3, paddingBottom: 7, paddingLeft: 10, paddingRight: 10,
                  borderRadius: 999, fontFamily: BODY_FONT, whiteSpace: 'nowrap', lineHeight: 1,
                }}>
                  {stat.label} [ {stat.value} ]
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 30, fontSize: 15, color: '#E7ECFA', fontFamily: BODY_FONT, fontWeight: 600, textAlign: 'center', lineHeight: 1.5 }}>
        <div>#NewMuslimPH #NMAph - I-follow lang ang aming FB Page para sa mga bagong quizzes !</div>
        <div>Abangan ang susunod na Quiz Challenge dito lang sa New Muslim Academy - Philippines</div>
      </div>
    </div>
  );
}

export function WinnersCardModal({ quizTitle, winners, onClose }) {
  const previewWrapRef = useRef(null);
  const captureRef = useRef(null);
  const [scale, setScale] = useState(0.4);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);

  useEffect(() => {
    const computeScale = () => {
      if (previewWrapRef.current) {
        setScale(Math.min(1, previewWrapRef.current.clientWidth / WINNERS_CARD_W));
      }
    };
    computeScale();
    window.addEventListener('resize', computeScale);
    return () => window.removeEventListener('resize', computeScale);
  }, []);

  const download = async () => {
    if (!captureRef.current || !window.html2canvas) { setDownloadError(true); return; }
    setDownloading(true);
    setDownloadError(false);
    try {
      // JPEG at high quality instead of PNG — the card has no transparency,
      // so lossless PNG was just wasting file size (~1.5MB) for no visual
      // benefit. This cuts it dramatically while staying crisp for posting.
      const canvas = await window.html2canvas(captureRef.current, { scale: 2, backgroundColor: PALETTE.emeraldDark });
      const url = canvas.toDataURL('image/jpeg', 0.9);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(quizTitle || 'quiz').replace(/\s+/g, '-').toLowerCase()}-winners.jpg`;
      a.click();
    } catch (e) {
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,31,68,0.82)' }} onClick={onClose}>
      <div className="w-full max-w-3xl flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="text-sm" style={{ color: '#fff', fontWeight: 700 }}>Winners Card · 1200×630 (Facebook post size)</div>
          <button onClick={onClose} style={{ color: '#fff' }} title="Close"><X size={22} /></button>
        </div>

        <div ref={previewWrapRef} style={{ width: '100%', height: WINNERS_CARD_H * scale, overflow: 'hidden', borderRadius: 20, boxShadow: '0 24px 60px -18px rgba(0,0,0,0.6)' }}>
          <div style={{ width: WINNERS_CARD_W, height: WINNERS_CARD_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <WinnersCardContent quizTitle={quizTitle} winners={winners} />
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button onClick={download} disabled={downloading} className="px-6 py-3 rounded-full text-sm inline-flex items-center gap-2 disabled:opacity-50"
            style={{ background: PALETTE.gold, color: PALETTE.ink, fontWeight: 700 }}>
            <Download size={16} /> {downloading ? 'Preparing…' : 'Download PNG'}
          </button>
          {downloadError && <div className="text-xs" style={{ color: PALETTE.red }}>Couldn't generate the image — try again, or right-click the card above and save it manually.</div>}
        </div>
      </div>

      {/* Off-screen, full-resolution copy used purely for html2canvas capture — never scaled/transformed. */}
      <div style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }} aria-hidden="true">
        <div ref={captureRef}>
          <WinnersCardContent quizTitle={quizTitle} winners={winners} />
        </div>
      </div>
    </div>
  );
}
