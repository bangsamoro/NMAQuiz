import { useState, useEffect, useCallback, Fragment } from 'react';
import { Check, Trash2, RefreshCw, Download, Trophy, ChevronDown, ChevronRight } from 'lucide-react';
import { PALETTE } from '../theme.js';
import { formatDuration, normalizeAnswer } from '../utils.js';
import { apiGetSubmissions, apiDeleteSubmission, apiGetQuiz } from '../api.js';
import { WinnersCardModal } from './WinnersCard.jsx';

// ============================================================================
// Admin: responses table for one quiz
// ============================================================================
export function AdminResponses({ token, slug, quizTitle }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [winnersOnly, setWinnersOnly] = useState(false);
  const [showWinnersCard, setShowWinnersCard] = useState(false);
  const [questionsById, setQuestionsById] = useState({});
  const [expandedId, setExpandedId] = useState(null);

  // Question text/type lookup, so typed answers can be shown next to the
  // question they answered (submissions only store ids + raw answers).
  useEffect(() => {
    apiGetQuiz(slug, token).then((q) => {
      setQuestionsById(Object.fromEntries(((q && q.questions) || []).map((x) => [x.id, x])));
    });
  }, [slug, token]);

  const writtenAnswers = (s) => {
    const ids = s.questionIds || [];
    return ids.flatMap((id, i) => {
      const q = questionsById[id];
      const a = s.answers ? s.answers[i] : null;
      if (!q || (q.type !== 'text' && q.type !== 'short') || typeof a !== 'string') return [];
      const accepted = q.type === 'text' ? q.options.map(normalizeAnswer).filter(Boolean) : [];
      return [{ question: q.text, answer: a, correct: accepted.length ? accepted.includes(normalizeAnswer(a)) : null }];
    });
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await apiGetSubmissions(token, slug);
    setSubmissions(data ? data.slice().reverse() : []);
    setLoading(false);
  }, [token, slug]);

  useEffect(() => { refresh(); }, [refresh]);

  const removeOne = async (id) => {
    const ok = await apiDeleteSubmission(id, token);
    if (ok) setSubmissions(submissions.filter((s) => s.id !== id));
  };

  let filtered = submissions.filter((s) => {
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || (s.facebookProfile || '').toLowerCase().includes(q);
  });

  if (winnersOnly) {
    filtered = filtered
      .filter((s) => s.total > 0 && s.score === s.total)
      .slice()
      .sort((a, b) => (a.durationMs ?? Infinity) - (b.durationMs ?? Infinity));
  }

  // Top 3 perfect scores, fastest first — independent of the winnersOnly
  // toggle above, so the announcement card works regardless of table filter.
  const top3 = submissions
    .filter((s) => s.total > 0 && s.score === s.total)
    .slice()
    .sort((a, b) => (a.durationMs ?? Infinity) - (b.durationMs ?? Infinity))
    .slice(0, 3);

  const exportCsv = () => {
    const header = ['Name', 'Email', 'Mobile/GCash', 'Facebook Profile', 'IP Address', 'Followed FB', 'Score', 'Total', 'Percent', 'Time Taken', 'Submitted At', 'Written Answers'];
    const rows = filtered.map((s) => [s.name, s.email, s.mobile, s.facebookProfile || '', s.ip || '', s.followConfirmed ? 'Yes' : 'No', s.score, s.total, s.total > 0 ? `${Math.round((s.score / s.total) * 100)}%` : '', formatDuration(s.durationMs), s.timestamp, writtenAnswers(s).map((w) => `${w.question}: ${w.answer}`).join(' | ')]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = winnersOnly ? 'quiz-winners.csv' : 'quiz-responses.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, or Facebook…"
          className="px-4 py-2 rounded-lg outline-none text-sm flex-1 min-w-[200px]" style={{ border: `1.5px solid ${PALETTE.line}` }} />
        <button onClick={() => setWinnersOnly((w) => !w)} className="px-4 py-2 rounded-full text-sm inline-flex items-center gap-2"
          style={{ border: `1.5px solid ${PALETTE.gold}`, fontWeight: 700, background: winnersOnly ? PALETTE.gold : 'transparent', color: PALETTE.ink }}>
          🏆 {winnersOnly ? 'Showing Winners' : 'Winners Only'}
        </button>
        <button onClick={refresh} className="px-4 py-2 rounded-full text-sm inline-flex items-center gap-2" style={{ border: `1.5px solid ${PALETTE.ink}`, fontWeight: 700 }}><RefreshCw size={14} /> Refresh</button>
        <button onClick={exportCsv} disabled={!filtered.length} className="px-4 py-2 rounded-full text-sm inline-flex items-center gap-2 disabled:opacity-40" style={{ background: PALETTE.emerald, color: '#fff', fontWeight: 700 }}><Download size={14} /> Export CSV</button>
        <button onClick={() => setShowWinnersCard(true)} disabled={!top3.length} title={top3.length ? 'Open winners announcement card' : 'No perfect scores yet'}
          className="px-4 py-2 rounded-full text-sm inline-flex items-center gap-2 disabled:opacity-40"
          style={{ background: `linear-gradient(135deg, ${PALETTE.gold}, #E8B800)`, color: PALETTE.ink, fontWeight: 700 }}>
          <Trophy size={14} /> Winners Card
        </button>
      </div>
      {winnersOnly && <div className="text-xs" style={{ color: PALETTE.inkSoft }}>Perfect scores only, ranked fastest first.</div>}
      <div className="text-xs" style={{ color: PALETTE.inkSoft }}>{loading ? 'Loading responses…' : `${filtered.length} response${filtered.length === 1 ? '' : 's'}`}</div>
      {!loading && filtered.length === 0 && (
        <div className="rounded-2xl p-10 text-center" style={{ background: PALETTE.paper, border: `1.5px solid ${PALETTE.line}`, color: PALETTE.inkSoft }}>{winnersOnly ? 'No perfect scores yet.' : 'No responses yet.'}</div>
      )}
      {filtered.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${PALETTE.line}` }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: PALETTE.emeraldDark, color: '#fff' }}>
                  {[winnersOnly ? 'Rank' : null, 'Name', 'Email', 'Mobile/GCash', 'Facebook', 'IP Address', 'FB', 'Score', 'Answers', 'Time', 'Submitted', ''].filter(Boolean).map((h) => <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-widest whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const written = writtenAnswers(s);
                  const expanded = expandedId === s.id;
                  return (
                  <Fragment key={s.id}>
                  <tr style={{ background: i % 2 ? PALETTE.cream : PALETTE.paper, borderTop: `1px solid ${PALETTE.line}` }}>
                    {winnersOnly && <td className="px-4 py-3" style={{ fontWeight: 800 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</td>}
                    <td className="px-4 py-3" style={{ fontWeight: 700 }}>{s.name}</td>
                    <td className="px-4 py-3">{s.email}</td>
                    <td className="px-4 py-3">{s.mobile}</td>
                    <td className="px-4 py-3 max-w-[180px] truncate">
                      {s.facebookProfile ? (
                        /^https?:\/\//i.test(s.facebookProfile)
                          ? <a href={s.facebookProfile} target="_blank" rel="noopener noreferrer" style={{ color: PALETTE.emerald, fontWeight: 600 }}>{s.facebookProfile}</a>
                          : s.facebookProfile
                      ) : <span style={{ color: PALETTE.inkSoft }}>—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap" style={{ color: PALETTE.inkSoft }}>{s.ip || '—'}</td>
                    <td className="px-4 py-3 text-center">{s.followConfirmed ? <Check size={14} color={PALETTE.emerald} /> : <span style={{ color: PALETTE.inkSoft }}>—</span>}</td>
                    <td className="px-4 py-3">{s.total > 0
                      ? <span style={{ color: s.score / s.total >= 0.5 ? PALETTE.emerald : PALETTE.red, fontWeight: 700 }}>{s.score}/{s.total}</span>
                      : <span style={{ color: PALETTE.inkSoft }}>—</span>}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {written.length ? (
                        <button onClick={() => setExpandedId(expanded ? null : s.id)} className="inline-flex items-center gap-1 text-xs" style={{ color: PALETTE.emerald, fontWeight: 700 }}>
                          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {written.length} written
                        </button>
                      ) : <span style={{ color: PALETTE.inkSoft }}>—</span>}
                    </td>
                    <td className="px-4 py-3" style={{ color: PALETTE.inkSoft }}>{formatDuration(s.durationMs)}</td>
                    <td className="px-4 py-3" style={{ color: PALETTE.inkSoft }}>{new Date(s.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-3"><button onClick={() => removeOne(s.id)} title="Delete response"><Trash2 size={14} color={PALETTE.red} /></button></td>
                  </tr>
                  {expanded && (
                    <tr style={{ background: PALETTE.cream }}>
                      <td colSpan={20} className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          {written.map((w, wi) => (
                            <div key={wi} className="text-sm">
                              <div style={{ color: PALETTE.inkSoft, fontWeight: 600 }}>{w.question}</div>
                              <div style={{ fontWeight: 700, color: w.correct === true ? PALETTE.emerald : w.correct === false ? PALETTE.red : PALETTE.ink }}>
                                {w.correct === true && '✓ '}{w.correct === false && '✗ '}{w.answer}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>

            </table>
          </div>
        </div>
      )}
      {showWinnersCard && (
        <WinnersCardModal quizTitle={quizTitle} winners={top3} onClose={() => setShowWinnersCard(false)} />
      )}
    </div>
  );
}
