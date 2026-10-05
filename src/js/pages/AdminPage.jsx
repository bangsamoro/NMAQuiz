import { Lock, ArrowLeft } from 'lucide-react';
import { PALETTE, DISPLAY_FONT, BODY_FONT } from '../theme.js';
import { Footer } from '../components/atoms.jsx';
import { AdminPanel } from '../components/AdminPanel.jsx';

export function AdminPage() {
  return (
    <div className="w-full min-h-screen" style={{ background: PALETTE.cream, fontFamily: BODY_FONT, color: PALETTE.ink }}>
      <div className="sticky top-0 z-20" style={{ background: `linear-gradient(135deg, ${PALETTE.emerald} 0%, ${PALETTE.emeraldDark} 100%)`, boxShadow: `0 4px 20px -8px ${PALETTE.emerald}88` }}>
        <div className="w-full px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Lock size={20} color={PALETTE.gold} className="shrink-0" />
            <h1 className="text-lg sm:text-2xl leading-tight truncate" style={{ fontFamily: DISPLAY_FONT, color: PALETTE.paper, fontWeight: 800 }}>Webinar Registration and Quizzes Admin</h1>
          </div>
          <a href={import.meta.env.BASE_URL} className="shrink-0 text-xs sm:text-sm inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full transition-colors"
            style={{ color: PALETTE.paper, border: `1.5px solid ${PALETTE.paper}55`, fontWeight: 600 }}>
            <ArrowLeft size={14} /> <span className="hidden sm:inline">Back to Quizzes</span>
          </a>
        </div>
      </div>
      <div className="w-full px-4 sm:px-8 py-6 sm:py-8" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
        <AdminPanel />
        <Footer />
      </div>
    </div>
  );
}
