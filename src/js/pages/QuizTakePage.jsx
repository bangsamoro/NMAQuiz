import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PALETTE, DISPLAY_FONT, BODY_FONT } from '../theme.js';
import { apiGetQuiz } from '../api.js';
import { GradientBanner, Footer } from '../components/atoms.jsx';
import { TakerFlow } from '../components/TakerFlow.jsx';
import { QuizClosedMessage } from '../components/QuizClosedMessage.jsx';

// ============================================================================
// Public: take a specific quiz by its unique slug
// ============================================================================
export function QuizTakePage({ slug }) {
  const [quiz, setQuiz] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGetQuiz(slug).then((q) => {
      if (q) setQuiz(q); else setNotFound(true);
      setLoading(false);
    });
  }, [slug]);

  return (
    <div className="w-full min-h-screen" style={{ background: PALETTE.cream, fontFamily: BODY_FONT, color: PALETTE.ink }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-5 py-6 sm:py-8" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
        <GradientBanner>
          <div className="text-xs uppercase tracking-[0.3em] mb-1" style={{ color: PALETTE.gold, fontWeight: 700 }}>NMA - Philippines #NewMuslimPH</div>
          <h1 className="text-2xl sm:text-3xl leading-tight" style={{ fontFamily: DISPLAY_FONT, color: PALETTE.paper, fontWeight: 800 }}>{quiz ? quiz.title : 'Quiz'}</h1>
        </GradientBanner>
        {loading ? (
          <div className="text-center py-16" style={{ color: PALETTE.inkSoft }}>Loading…</div>
        ) : notFound ? (
          <div className="rounded-2xl p-10 text-center" style={{ background: PALETTE.paper, border: `1.5px solid ${PALETTE.line}` }}>
            <p className="mb-4" style={{ color: PALETTE.inkSoft }}>This quiz link isn't valid or may have been removed.</p>
            <a href={import.meta.env.BASE_URL} className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm" style={{ border: `1.5px solid ${PALETTE.ink}`, fontWeight: 700 }}>
              <ArrowLeft size={14} /> Browse available quizzes
            </a>
          </div>
        ) : quiz.active === false ? (
          <QuizClosedMessage quiz={quiz} />
        ) : (
          <TakerFlow quiz={quiz} />
        )}
        <Footer />
      </div>
    </div>
  );
}
