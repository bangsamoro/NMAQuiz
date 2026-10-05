import { useState, useEffect } from 'react';
import { PALETTE, DISPLAY_FONT, BODY_FONT, CATEGORIES } from '../theme.js';
import { apiListQuizzes } from '../api.js';
import { GradientBanner, CategoryBadge, Footer } from '../components/atoms.jsx';

// ============================================================================
// Public: landing page listing all quizzes by category
// ============================================================================
export function QuizListPage() {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { apiListQuizzes().then((list) => { setQuizzes(list); setLoading(false); }); }, []);

  // Closed quizzes are hidden from the public landing page entirely — admins
  // can still reach/manage them from the admin panel, which lists everything.
  const activeQuizzes = quizzes.filter((q) => q.active !== false);
  const byCategory = CATEGORIES.map((cat) => ({ cat, items: activeQuizzes.filter((q) => q.category === cat) })).filter((g) => g.items.length);

  return (
    <div className="w-full min-h-screen" style={{ background: PALETTE.cream, fontFamily: BODY_FONT, color: PALETTE.ink }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-5 py-6 sm:py-8">
        <GradientBanner>
          <div className="text-xs uppercase tracking-[0.3em] mb-1" style={{ color: PALETTE.gold, fontWeight: 700 }}>NMA - Philippines #NewMuslimPH</div>
          <h1 className="text-2xl sm:text-3xl leading-tight" style={{ fontFamily: DISPLAY_FONT, color: PALETTE.paper, fontWeight: 800 }}>New Muslim Academy Webinar & Quiz Page</h1>
        </GradientBanner>

        {loading ? (
          <div className="text-center py-16" style={{ color: PALETTE.inkSoft }}>Loading…</div>
        ) : activeQuizzes.length === 0 ? (
          <div className="rounded-2xl p-10 text-center" style={{ background: PALETTE.paper, border: `1.5px solid ${PALETTE.line}`, color: PALETTE.inkSoft }}>No quizzes available yet.</div>
        ) : (
          <div className="flex flex-col gap-8">
            {byCategory.map(({ cat, items }) => (
              <div key={cat}>
                <div className="mb-3"><CategoryBadge category={cat} /></div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {items.map((q) => (
                    <a key={q.slug} href={`${import.meta.env.BASE_URL}${q.slug}`}
                      className="block rounded-2xl p-5 transition-all hover:-translate-y-0.5"
                      style={{ background: PALETTE.paper, border: `1.5px solid ${PALETTE.line}`, boxShadow: `0 6px 20px -10px ${PALETTE.ink}33`, opacity: q.active === false ? 0.6 : 1 }}>
                      <div className="flex items-center gap-2">
                        <div style={{ fontWeight: 700, fontFamily: DISPLAY_FONT }}>{q.title}</div>
                        {q.active === false && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: PALETTE.red, color: '#fff', fontWeight: 700 }}>Closed</span>}
                      </div>
                      <div className="text-xs mt-1" style={{ color: PALETTE.inkSoft }}>{q.questionCount} questions</div>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <Footer />
      </div>
    </div>
  );
}
