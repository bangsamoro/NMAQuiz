// ---------------- Small UI atoms shared across pages/components ----------------
import { PALETTE, BODY_FONT, CATEGORY_COLORS } from '../theme.js';

export function StarDivider() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" className="mx-auto">
      <circle cx="24" cy="24" r="7" fill={PALETTE.gold} />
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i * 45 * Math.PI) / 180;
        const x1 = 24 + Math.cos(angle) * 12;
        const y1 = 24 + Math.sin(angle) * 12;
        const x2 = 24 + Math.cos(angle) * 22;
        const y2 = 24 + Math.sin(angle) * 22;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={PALETTE.gold} strokeWidth="3" strokeLinecap="round" />;
      })}
    </svg>
  );
}

export function GradientBanner({ children }) {
  return (
    <div
      className="rounded-xl px-6 sm:px-8 py-7 sm:py-8 mb-6 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${PALETTE.emerald} 0%, ${PALETTE.emeraldDark} 100%)`,
        boxShadow: `0 10px 28px -10px ${PALETTE.ink}55`,
        borderTop: `3px solid ${PALETTE.gold}`,
        borderBottom: `1px solid ${PALETTE.gold}66`,
      }}
    >
      {/* A single restrained watermark rather than the multi-color blobs a
          playful/promotional banner would use — reads closer to an emblem
          or seal than a decoration. */}
      <div className="absolute -right-10 -top-16 w-48 h-48 rounded-full pointer-events-none" style={{ background: PALETTE.gold, opacity: 0.07 }} />
      <div className="relative">{children}</div>
    </div>
  );
}

export function CategoryBadge({ category }) {
  const color = CATEGORY_COLORS[category] || PALETTE.inkSoft;
  return (
    <span className="inline-block text-xs px-2.5 py-1 rounded-full" style={{ background: `${color}1A`, color, fontWeight: 700 }}>
      {category}
    </span>
  );
}

export function Footer() {
  return (
    <div className="text-center pt-8 pb-2 text-xs" style={{ color: PALETTE.inkSoft }}>
      Powered by : <span style={{ fontWeight: 700, color: PALETTE.emerald }}>SULUTIONS.CLOUD</span>
    </div>
  );
}

export function Field({ label, value, onChange, error, placeholder, type = 'text' }) {
  return (
    <label className="flex flex-col gap-1.5 text-left">
      <span className="text-xs uppercase tracking-widest" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="px-4 py-3 rounded-lg outline-none"
        style={{ border: `1.5px solid ${error ? PALETTE.red : PALETTE.line}`, fontFamily: BODY_FONT }}
      />
      {error && <span className="text-xs" style={{ color: PALETTE.red }}>{error}</span>}
    </label>
  );
}
