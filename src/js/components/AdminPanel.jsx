import { useState, useEffect, useCallback, useRef } from 'react';
import { Lock, LayoutGrid, Palette as PaletteIcon, Save, LogOut } from 'lucide-react';
import { PALETTE, DISPLAY_FONT } from '../theme.js';
import { apiListQuizzes, apiGetQuiz, apiAdminLogin, apiAdminLogout, apiAdminMe } from '../api.js';
import { QuizPicker } from './QuizPicker.jsx';
import { StatusToggle } from './StatusToggle.jsx';
import { AdminResponses } from './AdminResponses.jsx';
import { AdminQuestions } from './AdminQuestions.jsx';
import { ThemeSettings } from './ThemeSettings.jsx';

const SESSION_STORAGE_KEY = 'nma_admin_session';

// ============================================================================
// Admin panel (behind a real login — username/password, roles: admin sees
// only active quizzes, super_admin sees everything)
// ============================================================================
export function AdminPanel() {
  const [session, setSession] = useState(null); // { token, username, role } | null
  const [restoring, setRestoring] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [mainTab, setMainTab] = useState('quizzes');
  const [subTab, setSubTab] = useState('responses');
  const [quizzes, setQuizzes] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState(null);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const questionsRef = useRef(null);
  const token = session?.token;

  // Restore a stored session on load, but validate it first — an
  // expired/invalid token gets cleared rather than trusted at face value.
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    let parsed = null;
    try { parsed = stored ? JSON.parse(stored) : null; } catch { /* corrupted — treat as absent */ }
    if (!parsed?.token) { localStorage.removeItem(SESSION_STORAGE_KEY); setRestoring(false); return; }
    apiAdminMe(parsed.token).then((me) => {
      if (me) setSession(parsed);
      else localStorage.removeItem(SESSION_STORAGE_KEY);
      setRestoring(false);
    });
  }, []);

  const loadQuizzes = useCallback(async () => {
    const list = await apiListQuizzes(token);
    setQuizzes(list);
    if (list.length && !selectedSlug) setSelectedSlug(list[0].slug);
  }, [selectedSlug, token]);

  useEffect(() => { if (session) loadQuizzes(); }, [session, loadQuizzes]);

  useEffect(() => {
    if (!selectedSlug) { setSelectedQuiz(null); return; }
    setLoadingQuiz(true);
    apiGetQuiz(selectedSlug, token).then((q) => { setSelectedQuiz(q); setLoadingQuiz(false); });
  }, [selectedSlug, token]);

  const tryEnter = async () => {
    const data = await apiAdminLogin(username.trim(), password);
    if (data) {
      setSession(data);
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
      setError('');
      setPassword('');
    } else {
      setError('Incorrect username or password.');
    }
  };

  const logout = async () => {
    await apiAdminLogout(token);
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setSession(null);
    setQuizzes([]);
    setSelectedSlug(null);
    setSelectedQuiz(null);
  };

  const handleCreated = (quiz) => {
    setQuizzes((prev) => [...prev, { id: quiz.id, slug: quiz.slug, category: quiz.category, title: quiz.title, active: quiz.active !== false, publishDate: quiz.publishDate ?? null, webinarUrl: quiz.webinarUrl ?? null, participantCount: quiz.participantCount ?? 0, questionCount: quiz.questions.length }]);
    setSelectedSlug(quiz.slug);
    setSubTab('questions');
  };
  const handleDeleted = (slug) => {
    const remaining = quizzes.filter((q) => q.slug !== slug);
    setQuizzes(remaining);
    setSelectedSlug(remaining.length ? remaining[0].slug : null);
  };
  const handleSaved = (updated) => {
    setSelectedQuiz(updated);
    setQuizzes((prev) => prev.map((q) => q.slug === updated.slug ? { ...q, title: updated.title, category: updated.category, active: updated.active !== false, publishDate: updated.publishDate ?? null, webinarUrl: updated.webinarUrl ?? null, questionCount: updated.questions.length } : q));
  };

  if (restoring) return null;

  if (!session) {
    return (
      <div className="rounded-2xl p-10 max-w-sm mx-auto text-center" style={{ background: PALETTE.paper, border: `1.5px solid ${PALETTE.line}`, boxShadow: `0 10px 40px -12px ${PALETTE.ink}22` }}>
        <Lock size={24} color={PALETTE.emeraldDark} className="mx-auto mb-3" />
        <h2 className="text-xl mb-4" style={{ fontFamily: DISPLAY_FONT, color: PALETTE.emeraldDark, fontWeight: 700 }}>Admin Access</h2>
        <input value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && tryEnter()}
          placeholder="Username" autoCapitalize="off" autoCorrect="off"
          className="w-full px-4 py-3 rounded-lg outline-none mb-3 text-center" style={{ border: `1.5px solid ${error ? PALETTE.red : PALETTE.line}` }} />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && tryEnter()}
          placeholder="Password" className="w-full px-4 py-3 rounded-lg outline-none mb-3 text-center" style={{ border: `1.5px solid ${error ? PALETTE.red : PALETTE.line}` }} />
        {error && <div className="text-xs mb-3" style={{ color: PALETTE.red }}>{error}</div>}
        <button onClick={tryEnter} className="w-full px-6 py-3 rounded-full text-white" style={{ background: `linear-gradient(135deg, ${PALETTE.emerald}, ${PALETTE.emeraldDark})`, fontWeight: 700 }}>Enter</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button onClick={() => setMainTab('quizzes')} className="px-4 py-2.5 rounded-full text-sm inline-flex items-center gap-2"
            style={{ border: `1.5px solid ${PALETTE.ink}`, fontWeight: 700, background: mainTab === 'quizzes' ? PALETTE.ink : 'transparent', color: mainTab === 'quizzes' ? '#fff' : PALETTE.ink }}>
            <LayoutGrid size={14} /> Quizzes
          </button>
          <button onClick={() => setMainTab('branding')} className="px-4 py-2.5 rounded-full text-sm inline-flex items-center gap-2"
            style={{ border: `1.5px solid ${PALETTE.ink}`, fontWeight: 700, background: mainTab === 'branding' ? PALETTE.ink : 'transparent', color: mainTab === 'branding' ? '#fff' : PALETTE.ink }}>
            <PaletteIcon size={14} /> Branding
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs" style={{ color: PALETTE.inkSoft }}>
          <span>
            <span style={{ fontWeight: 700, color: PALETTE.ink }}>{session.username}</span>{' '}
            ({session.role === 'super_admin' ? 'Super Admin' : 'Admin'})
          </span>
          <button onClick={logout} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full" style={{ border: `1.5px solid ${PALETTE.line}`, fontWeight: 700 }}>
            <LogOut size={12} /> Logout
          </button>
        </div>
      </div>

      {mainTab === 'branding' ? (
        <ThemeSettings token={token} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[400px_1fr] items-start">
          <QuizPicker quizzes={quizzes} selectedSlug={selectedSlug} onSelect={setSelectedSlug} onCreated={handleCreated} onDeleted={handleDeleted} token={token} />

          <div className="min-w-0">
            {!selectedQuiz ? (
              <div className="rounded-2xl p-10 text-center" style={{ background: PALETTE.paper, border: `1.5px solid ${PALETTE.line}`, color: PALETTE.inkSoft }}>
                {loadingQuiz ? 'Loading…' : 'No quiz selected. Create one to get started.'}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                  <div className="flex gap-2">
                    <button onClick={() => setSubTab('responses')} className="px-4 py-2 rounded-full text-sm" style={{ border: `1.5px solid ${PALETTE.ink}`, fontWeight: 700, background: subTab === 'responses' ? PALETTE.ink : 'transparent', color: subTab === 'responses' ? '#fff' : PALETTE.ink }}>Responses</button>
                    <button onClick={() => setSubTab('questions')} className="px-4 py-2 rounded-full text-sm" style={{ border: `1.5px solid ${PALETTE.ink}`, fontWeight: 700, background: subTab === 'questions' ? PALETTE.ink : 'transparent', color: subTab === 'questions' ? '#fff' : PALETTE.ink }}>Manage Quiz</button>
                    {subTab === 'questions' && (
                      <button onClick={() => questionsRef.current?.save()} className="px-4 py-2 rounded-full text-sm inline-flex items-center gap-1.5"
                        style={{ background: `linear-gradient(135deg, ${PALETTE.emerald}, ${PALETTE.emeraldDark})`, color: '#fff', fontWeight: 700 }}>
                        <Save size={14} /> Save Quiz
                      </button>
                    )}
                  </div>
                  <StatusToggle quiz={selectedQuiz} token={token} onChanged={handleSaved} />
                </div>
                {subTab === 'responses' ? <AdminResponses token={token} slug={selectedQuiz.slug} quizTitle={selectedQuiz.title} /> : <AdminQuestions ref={questionsRef} quiz={selectedQuiz} token={token} onSaved={handleSaved} />}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
