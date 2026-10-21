import { useState } from 'react';
import { Check, X, ChevronRight, Share2, Link2, Video } from 'lucide-react';
import { PALETTE, DISPLAY_FONT } from '../theme.js';
import { quizUrl, formatDuration } from '../utils.js';
import { apiCheckAttempt, apiStartAttempt, apiAddSubmission } from '../api.js';
import { StarDivider, CategoryBadge } from './atoms.jsx';
import { Field } from './atoms.jsx';
import { FacebookFollowGate } from './FacebookFollowGate.jsx';

// ============================================================================
// Respondent-facing quiz flow
// ============================================================================
export function TakerFlow({ quiz }) {
  const [screen, setScreen] = useState('info');
  const [form, setForm] = useState({ name: '', email: '', mobile: '', facebookProfile: '' });
  const [followConfirmed, setFollowConfirmed] = useState(false);
  const [errors, setErrors] = useState({});
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [saveError, setSaveError] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [durationMs, setDurationMs] = useState(null);
  const [checkingAttempt, setCheckingAttempt] = useState(false);
  const [alreadyAttempted, setAlreadyAttempted] = useState(false);
  const [attemptToken, setAttemptToken] = useState(null);
  const [gradedResult, setGradedResult] = useState(null);
  const [quizQuestions, setQuizQuestions] = useState([]); // the randomized per-attempt subset handed out by /start

  const validate = () => {
    const e = {};
    if (!followConfirmed) e.follow = 'Paki-check muna na sumunod ka na sa aming FB Page.';
    if (!form.name.trim()) e.name = 'Paki-lagay ang iyong buong pangalan.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Paki-lagay ang tamang email.';
    if (!/^[0-9+\-\s]{7,15}$/.test(form.mobile.trim())) e.mobile = 'Paki-lagay ang tamang numero ng mobile/GCash.';
    if (!form.facebookProfile.trim()) e.facebookProfile = 'Paki-lagay ang iyong Facebook name o profile link.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const startQuiz = async () => {
    if (!validate()) return;
    setCheckingAttempt(true);
    setAlreadyAttempted(false);
    setSaveError(null);
    const { attempted } = await apiCheckAttempt(quiz.slug, form.email.trim(), form.mobile.trim());
    if (attempted) { setCheckingAttempt(false); setAlreadyAttempted(true); return; }
    const started = await apiStartAttempt(quiz.slug);
    setCheckingAttempt(false);
    if (!started || !started.questions.length) {
      setSaveError('Hindi ma-start ang quiz session ngayon — paki-try muli.');
      return;
    }
    setAttemptToken(started.token);
    setQuizQuestions(started.questions);
    setAnswers(new Array(started.questions.length).fill(null));
    setQIndex(0);
    setScreen('quiz');
  };

  const chooseAnswer = (optIndex) => {
    const next = [...answers];
    next[qIndex] = optIndex;
    setAnswers(next);
  };

  const setTextAnswer = (value) => {
    const next = [...answers];
    next[qIndex] = value;
    setAnswers(next);
  };

  const isTyped = (q) => q.type === 'text' || q.type === 'short';
  const currentAnswered = quizQuestions[qIndex]
    ? (isTyped(quizQuestions[qIndex]) ? !!(answers[qIndex] || '').trim() : answers[qIndex] != null)
    : false;

  const goNext = async () => {
    if (qIndex + 1 < quizQuestions.length) {
      setQIndex(qIndex + 1);
    } else {
      setScreen('submitting');
      const result = await apiAddSubmission({
        name: form.name.trim(), email: form.email.trim(), mobile: form.mobile.trim(),
        facebookProfile: form.facebookProfile.trim(),
        followConfirmed,
        answers,
        quizSlug: quiz.slug, quizTitle: quiz.title,
        attemptToken,
      });
      if (result.alreadyAttempted) {
        setSaveError("It looks like you've already completed this quiz — this attempt wasn't recorded again.");
      } else if (result.closed) {
        setSaveError('This quiz has been closed by the organizers — your answers were not recorded.');
      } else if (result.invalidSession) {
        setSaveError('Your quiz session expired or was invalid, so we could not save your response. Please try again.');
      } else if (!result.ok) {
        setSaveError('We could not save your response to the server.');
      } else {
        setDurationMs(result.durationMs);
        setGradedResult(result);
      }
      setScreen('result');
    }
  };

  const score = gradedResult ? gradedResult.score : 0;
  const total = gradedResult ? gradedResult.total : quizQuestions.length;
  const correctAnswers = gradedResult ? gradedResult.correctAnswers : null;
  const correctFlags = gradedResult ? gradedResult.correct : null;
  const pct = total ? Math.round((score / total) * 100) : 0;
  const verdict = pct >= 80 ? 'Masha Allah Tabarakallah' : pct >= 50 ? 'Subhanallah Pwede Na' : 'Aral pa more ;)';

  const shareToFacebook = () => {
    const shareUrl = quizUrl(quiz.slug);
    const quote = `Sali na po sa #NewMuslimPH  at sagutin ang quiz: \n${shareUrl}\nFollow lang po sa FB page ng New Muslim Academy - Philippines at Matuto na ay Manalo Pa !`;
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(quote)}`;
    window.open(fbUrl, 'facebook-share', 'width=580,height=520,noopener,noreferrer');
  };

  const shareLinkToFriends = async () => {
    const shareUrl = quizUrl(quiz.slug);
    const shareText = `Take the "${quiz.title}" quiz!`;
    if (navigator.share) {
      try { await navigator.share({ title: quiz.title, text: shareText, url: shareUrl }); return; } catch (e) { /* user cancelled, fall through */ }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch (e) {
      window.prompt('Copy this link to share:', shareUrl);
    }
  };

  return (
    <div className="rounded-2xl p-5 sm:p-8 md:p-10" style={{ background: PALETTE.paper, border: `1.5px solid ${PALETTE.line}`, boxShadow: `0 10px 40px -12px ${PALETTE.ink}22` }}>
      {screen === 'info' && (
        <div className="max-w-sm mx-auto text-center">
          <StarDivider />
          {quiz.webinarBannerUrl && (
            <img src={quiz.webinarBannerUrl} alt="Webinar banner" className="w-full h-auto rounded-xl mt-3 mb-1 object-cover" style={{ border: `1.5px solid ${PALETTE.line}` }} />
          )}
          <div className="flex justify-center mt-3 mb-1"><CategoryBadge category={quiz.category} /></div>
          <h2 className="text-xl sm:text-2xl mt-2 mb-2" style={{ fontFamily: DISPLAY_FONT, color: PALETTE.emeraldDark, fontWeight: 700 }}>{quiz.title}</h2>
          {quiz.sheikhName && (
            <p className="text-xs mb-2" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>Kasama si {quiz.sheikhName}</p>
          )}
          <p className={`text-sm ${quiz.webinarUrl ? 'mb-2' : 'mb-6'}`} style={{ color: PALETTE.inkSoft }}>Pakilagay ang mga detalye bago sumagot</p>
          {quiz.webinarUrl && (
            <a href={quiz.webinarUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs mb-6" style={{ color: PALETTE.emerald, fontWeight: 700 }}>
              <Video size={13} /> Panoorin ang Webinar
            </a>
          )}

          <FacebookFollowGate checked={followConfirmed} onChange={setFollowConfirmed} error={errors.follow} />

          <div className="text-xs uppercase tracking-widest mb-3 text-left" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>Step 2 · Iyong mga detalye</div>
          <div className="flex flex-col gap-4 mb-6">
            <Field label="Buong Pangalan" value={form.name} onChange={(v) => setForm({ ...form, name: v })} error={errors.name} placeholder="hal. Amina Yusuf" />
            <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} error={errors.email} placeholder="you@example.com" type="email" />
            <Field label="Numero ng Mobile o GCash" value={form.mobile} onChange={(v) => setForm({ ...form, mobile: v })} error={errors.mobile} placeholder="09XX XXX XXXX" type="tel" />
            <div>
              <Field label="Facebook Name o Profile Link" value={form.facebookProfile} onChange={(v) => setForm({ ...form, facebookProfile: v })} error={errors.facebookProfile} placeholder="hal. facebook.com/amina.yusuf" />
              <p className="text-xs mt-1.5 text-left" style={{ color: PALETTE.inkSoft }}>
                Paano makuha: pumunta sa iyong FB profile → i-copy ang link mula sa address bar, o i-type na lang ang pangalan mong ginagamit sa Facebook.
              </p>
            </div>
          </div>
          {alreadyAttempted && (
            <div className="mb-4 p-3 rounded-lg text-xs text-left" style={{ background: '#FCEEEE', color: PALETTE.red, border: `1px solid ${PALETTE.red}`, fontWeight: 700 }}>
              One shot lang ’to Kapatid —at mukhang nakasali na ’tong email o number 😉 so paki-pasa na lang yung link sa iba !
            </div>
          )}
          <button onClick={startQuiz} disabled={checkingAttempt} className="w-full px-6 py-4 rounded-full text-white inline-flex items-center justify-center gap-2 transition-transform active:scale-95 hover:-translate-y-0.5 disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${PALETTE.emerald}, ${PALETTE.emeraldDark})`, fontWeight: 700, fontSize: '1rem', boxShadow: `0 8px 20px -6px ${PALETTE.emerald}88` }}>
            {checkingAttempt ? 'Checking…' : 'Start Quiz'} {!checkingAttempt && <ChevronRight size={18} />}
          </button>
        </div>
      )}

      {screen === 'quiz' && (
        <div>
          <div className="flex items-center gap-2 mb-6">
            {quizQuestions.map((_, i) => (
              <div key={i} className="h-2 flex-1 rounded-full transition-colors" style={{ background: i <= qIndex ? PALETTE.gold : PALETTE.line }} />
            ))}
          </div>
          <div className="text-xs uppercase tracking-widest mb-2" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>
            Question {qIndex + 1} of {quizQuestions.length}
          </div>
          <h3 className="text-lg sm:text-xl md:text-2xl mb-6" style={{ fontFamily: DISPLAY_FONT, color: PALETTE.ink, fontWeight: 700 }}>{quizQuestions[qIndex].text}</h3>
          {isTyped(quizQuestions[qIndex]) ? (
            <div className="mb-6">
              <textarea value={answers[qIndex] || ''} onChange={(e) => setTextAnswer(e.target.value)} maxLength={1000} rows={quizQuestions[qIndex].type === 'short' ? 4 : 2}
                placeholder="I-type ang iyong sagot dito…" className="w-full px-4 py-3 rounded-xl outline-none"
                style={{ border: `1.5px solid ${answers[qIndex] ? PALETTE.emerald : PALETTE.line}`, fontSize: '1rem', resize: 'vertical' }} />
            </div>
          ) : (
          <div className="grid gap-3 mb-6">
            {quizQuestions[qIndex].options.map((opt, i) => {
              const selected = answers[qIndex] === i;
              return (
                <button key={i} onClick={() => chooseAnswer(i)} className="text-left px-5 py-4 rounded-xl transition-all active:scale-[0.98]"
                  style={{
                    border: `1.5px solid ${selected ? PALETTE.emerald : PALETTE.line}`,
                    background: selected ? `linear-gradient(135deg, ${PALETTE.emerald}12, ${PALETTE.emerald}05)` : PALETTE.paper,
                    fontWeight: 600, fontSize: '1rem', minHeight: 56,
                    boxShadow: selected ? `0 6px 16px -6px ${PALETTE.emerald}55` : 'none',
                  }}>
                  {opt}
                </button>
              );
            })}
          </div>
          )}
          <button onClick={goNext} disabled={!currentAnswered} className="w-full sm:w-auto px-6 py-4 sm:py-3 rounded-full text-white inline-flex items-center justify-center gap-2 disabled:opacity-40 transition-transform active:scale-95"
            style={{ background: `linear-gradient(135deg, ${PALETTE.emerald}, ${PALETTE.emeraldDark})`, fontWeight: 700, boxShadow: `0 8px 20px -6px ${PALETTE.emerald}88` }}>
            {qIndex + 1 < quizQuestions.length ? 'Next Question' : 'Submit'} <ChevronRight size={18} />
          </button>
        </div>
      )}

      {screen === 'submitting' && <div className="text-center py-12" style={{ color: PALETTE.inkSoft }}>Saving your result…</div>}

      {screen === 'result' && (
        <div className="text-center">
          <StarDivider />
          {gradedResult ? (
            <>
              {total > 0 ? (
                <>
                  <div className="text-xs uppercase tracking-widest mt-3 mb-1" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>Ang nakuha mong marka ay:</div>
                  <div className="text-5xl mb-1" style={{ fontFamily: DISPLAY_FONT, color: PALETTE.emerald, fontWeight: 800 }}>{score} / {total}</div>
                  <div className="inline-block text-sm mb-2 px-3 py-1 rounded-full" style={{ color: PALETTE.ink, background: PALETTE.gold, fontWeight: 700 }}>{verdict} ({pct}%)</div>
                </>
              ) : (
                <div className="text-2xl mt-3 mb-2" style={{ fontFamily: DISPLAY_FONT, color: PALETTE.emerald, fontWeight: 800 }}>Salamat sa iyong sagot!</div>
              )}
              <div className="text-xs mb-6" style={{ color: PALETTE.inkSoft }}>Ilang Minuto kang sumagot: {formatDuration(durationMs)}</div>
              {saveError && <div className="max-w-md mx-auto mb-6 p-3 rounded-lg text-xs text-left" style={{ background: '#FCEEEE', color: PALETTE.red, border: `1px solid ${PALETTE.red}` }}>{saveError}</div>}
              <div className="max-w-md mx-auto flex flex-col gap-3 text-left mb-8">
                {quizQuestions.map((q, i) => {
                  const yourAns = answers[i];
                  const typed = isTyped(q);
                  const graded = correctFlags ? correctFlags[i] : null; // true | false | null (ungraded)
                  const correctAns = correctAnswers ? correctAnswers[i] : null;
                  const color = graded === true ? PALETTE.emerald : graded === false ? PALETTE.red : PALETTE.line;
                  const yourText = typed ? (yourAns || '—') : (yourAns != null ? q.options[yourAns] : '—');
                  return (
                    <div key={i} className="p-4 rounded-xl" style={{ border: `1.5px solid ${color}`, background: graded === null ? PALETTE.cream : `${color}08` }}>
                      <div className="flex items-start gap-2 mb-2">
                        {graded === true && <Check size={16} color={PALETTE.emerald} className="mt-0.5 shrink-0" />}
                        {graded === false && <X size={16} color={PALETTE.red} className="mt-0.5 shrink-0" />}
                        <span style={{ fontWeight: 700 }}>{q.text}</span>
                      </div>
                      <div className="text-sm break-words" style={{ color: PALETTE.inkSoft }}>
                        Your answer: <span style={{ color: graded === null ? PALETTE.ink : color, fontWeight: 700 }}>{yourText}</span>
                      </div>
                      {graded === null && <div className="text-xs mt-1" style={{ color: PALETTE.inkSoft }}>Hindi ito kasama sa marka.</div>}
                      {graded === false && correctAns != null && (
                        <div className="text-sm" style={{ color: PALETTE.inkSoft }}>Correct answer: <span style={{ color: PALETTE.emerald, fontWeight: 700 }}>{Array.isArray(correctAns) ? correctAns.join(' / ') : q.options[correctAns]}</span></div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
                <button onClick={shareToFacebook} className="px-6 py-3 rounded-full text-sm text-white inline-flex items-center justify-center gap-2 transition-transform active:scale-95" style={{ background: '#1877F2', fontWeight: 700 }}>
                  <Share2 size={16} /> Paki-share po sa Facebook!
                </button>
                <button onClick={shareLinkToFriends} className="px-6 py-3 rounded-full text-sm text-white inline-flex items-center justify-center gap-2 transition-transform active:scale-95"
                  style={{ background: `linear-gradient(135deg, ${PALETTE.emerald}, ${PALETTE.emeraldDark})`, fontWeight: 700 }}>
                  <Link2 size={16} /> {linkCopied ? 'Link Copied!' : 'Paki send po ng Link!'}
                </button>
              </div>
            </>
          ) : (
            <div className="max-w-md mx-auto py-4">
              <div className="text-sm mb-4" style={{ color: PALETTE.inkSoft }}>Hindi na-save ang iyong sagot.</div>
              {saveError && <div className="p-3 rounded-lg text-xs text-left" style={{ background: '#FCEEEE', color: PALETTE.red, border: `1px solid ${PALETTE.red}` }}>{saveError}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
