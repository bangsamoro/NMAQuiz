import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Link2, Plus, Trash2, Save } from 'lucide-react';
import { PALETTE, BODY_FONT, CATEGORIES } from '../theme.js';
import { quizUrl, parseCsv } from '../utils.js';
import { apiUpdateQuiz, apiUploadQuizImage, apiUploadWebinarBanner, apiGetSheikhNames, apiAddSheikhName } from '../api.js';
import { Field } from './atoms.jsx';

// ============================================================================
// Admin: question editor for one quiz
// ============================================================================
// Exposes `save` via ref so AdminPanel can trigger it from the Save Quiz
// button it renders in its own tab row, alongside Responses/Manage Quiz.
const QUESTION_TYPES = [
  { value: 'mcq', label: 'Multiple choice' },
  { value: 'truefalse', label: 'True or False' },
  { value: 'text', label: 'Text answer (auto-graded)' },
  { value: 'short', label: 'Short answer (not graded)' },
];

export const AdminQuestions = forwardRef(function AdminQuestions({ quiz, token, onSaved }, ref) {
  const [draft, setDraft] = useState(quiz);
  const [status, setStatus] = useState(null);
  const [imageStatus, setImageStatus] = useState(null);
  const [imageUrl, setImageUrl] = useState(quiz.imageUrl || null);
  const [webinarBannerStatus, setWebinarBannerStatus] = useState(null);
  const [webinarBannerUrl, setWebinarBannerUrl] = useState(quiz.webinarBannerUrl || null);
  const [csvError, setCsvError] = useState(null);
  const [sheikhNames, setSheikhNames] = useState([]);
  const [addingSheikh, setAddingSheikh] = useState(false);
  const [newSheikhName, setNewSheikhName] = useState('');
  useEffect(() => { setDraft(quiz); setImageUrl(quiz.imageUrl || null); setWebinarBannerUrl(quiz.webinarBannerUrl || null); }, [quiz]);
  useEffect(() => { apiGetSheikhNames(token).then(setSheikhNames); }, [token]);

  const updateQuestion = (i, patch) => {
    const qs = draft.questions.slice(); qs[i] = { ...qs[i], ...patch }; setDraft({ ...draft, questions: qs });
  };
  const updateOption = (qi, oi, value) => {
    const qs = draft.questions.slice(); const opts = qs[qi].options.slice(); opts[oi] = value;
    qs[qi] = { ...qs[qi], options: opts }; setDraft({ ...draft, questions: qs });
  };
  const addQuestion = () => setDraft({ ...draft, questions: [...draft.questions, { id: `q${Date.now()}`, type: 'mcq', text: '', options: ['', '', '', ''], correctIndex: 0 }] });
  // Switching type resets the options/answer shape to that type's defaults
  // (keeping existing MCQ options when staying within the choice types).
  const changeType = (i, type) => {
    const q = draft.questions[i];
    if (q.type === type) return;
    const patch = { type, correctIndex: 0 };
    if (type === 'mcq') patch.options = q.type === 'mcq' ? q.options : ['', '', '', ''];
    else if (type === 'truefalse') patch.options = ['True', 'False'];
    else if (type === 'text') patch.options = [''];
    else patch.options = [];
    updateQuestion(i, patch);
  };
  const removeQuestion = (i) => setDraft({ ...draft, questions: draft.questions.filter((_, idx) => idx !== i) });

  const save = async () => {
    setStatus('saving');
    const updated = await apiUpdateQuiz(quiz.slug, {
      title: draft.title, category: draft.category, questions: draft.questions, active: draft.active !== false,
      displayCount: Math.max(0, parseInt(draft.displayCount, 10) || 0),
      publishDate: draft.publishDate || null,
      webinarUrl: draft.webinarUrl || null,
      sheikhName: draft.sheikhName || null,
      webinarHidden: !!draft.webinarHidden,
    }, token);
    setStatus(updated ? 'saved' : 'error');
    if (updated) onSaved(updated);
    setTimeout(() => setStatus(null), 2500);
  };

  useImperativeHandle(ref, () => ({ save }));

  const isActive = draft.active !== false;

  const saveBar = (
    <div className="flex items-center gap-3">
      <button onClick={save} className="px-6 py-3 rounded-full text-white inline-flex items-center gap-2" style={{ background: `linear-gradient(135deg, ${PALETTE.emerald}, ${PALETTE.emeraldDark})`, fontWeight: 700 }}><Save size={16} /> Save Quiz</button>
      {status === 'saving' && <span className="text-sm" style={{ color: PALETTE.inkSoft }}>Saving…</span>}
      {status === 'saved' && <span className="text-sm" style={{ color: PALETTE.emerald, fontWeight: 700 }}>Saved.</span>}
      {status === 'error' && <span className="text-sm" style={{ color: PALETTE.red, fontWeight: 700 }}>Could not save. Try again.</span>}
    </div>
  );

  const handleImageSelect = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setImageStatus('uploading');
    const reader = new FileReader();
    reader.onload = async () => {
      const result = await apiUploadQuizImage(quiz.slug, reader.result, token);
      setImageStatus(result ? 'uploaded' : 'error');
      if (result) setImageUrl(`${result.image}?t=${Date.now()}`); // cache-bust: filename is reused across uploads
      setTimeout(() => setImageStatus(null), 2500);
    };
    reader.onerror = () => setImageStatus('error');
    reader.readAsDataURL(file);
    e.target.value = ''; // allow re-selecting the same file later
  };

  const handleWebinarBannerSelect = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setWebinarBannerStatus('uploading');
    const reader = new FileReader();
    reader.onload = async () => {
      const result = await apiUploadWebinarBanner(quiz.slug, reader.result, token);
      setWebinarBannerStatus(result ? 'uploaded' : 'error');
      if (result) setWebinarBannerUrl(`${result.image}?t=${Date.now()}`); // cache-bust: filename is reused across uploads
      setTimeout(() => setWebinarBannerStatus(null), 2500);
    };
    reader.onerror = () => setWebinarBannerStatus('error');
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const selectSheikh = (value) => {
    if (value === '__add_new__') { setAddingSheikh(true); setNewSheikhName(''); return; }
    setDraft({ ...draft, sheikhName: value || null });
  };

  const confirmNewSheikh = async () => {
    const name = newSheikhName.trim();
    if (!name) { setAddingSheikh(false); return; }
    const result = await apiAddSheikhName(name, token);
    if (result) {
      setSheikhNames((prev) => (prev.includes(result.name) ? prev : [...prev, result.name]));
      setDraft({ ...draft, sheikhName: result.name });
    }
    setAddingSheikh(false);
  };

  const handleCsvSelect = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setCsvError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCsv(String(reader.result));
        const startIdx = rows[0] && /question/i.test(rows[0][0] || '') ? 1 : 0; // skip header row if present
        const imported = rows.slice(startIdx).map((r, idx) => {
          const [text, o1, o2, o3, o4, correct] = r;
          const correctIndex = Math.max(0, Math.min(3, (parseInt(correct, 10) || 1) - 1));
          return { id: `csv${Date.now()}-${idx}`, type: 'mcq', text: (text || '').trim(), options: [o1, o2, o3, o4].map((o) => (o || '').trim()), correctIndex };
        }).filter((q) => q.text && q.options.every((o) => o));
        if (!imported.length) { setCsvError('No valid rows found. Expected columns: Question, Option1, Option2, Option3, Option4, CorrectOption(1-4).'); return; }
        setDraft({ ...draft, questions: [...draft.questions, ...imported] });
      } catch (err) {
        setCsvError('Could not read that file as CSV.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl p-5" style={{ background: PALETTE.paper, border: `1.5px solid ${PALETTE.line}` }}>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Quiz title" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} />
          <label className="flex flex-col gap-1.5 text-left">
            <span className="text-xs uppercase tracking-widest" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>Category</span>
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              className="px-4 py-3 rounded-lg outline-none" style={{ border: `1.5px solid ${PALETTE.line}`, fontFamily: BODY_FONT }}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <Field label="Publish date" type="date" value={draft.publishDate || ''} onChange={(v) => setDraft({ ...draft, publishDate: v })} />
          <Field label="Webinar URL" value={draft.webinarUrl || ''} onChange={(v) => setDraft({ ...draft, webinarUrl: v })} placeholder="https://..." />
          <label className="flex flex-col gap-1.5 text-left">
            <span className="text-xs uppercase tracking-widest" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>Name of Sheikh</span>
            {addingSheikh ? (
              <div className="flex items-center gap-2">
                <input autoFocus value={newSheikhName} onChange={(e) => setNewSheikhName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmNewSheikh(); } }}
                  placeholder="New name…" className="px-4 py-3 rounded-lg outline-none flex-1 min-w-0" style={{ border: `1.5px solid ${PALETTE.line}`, fontFamily: BODY_FONT }} />
                <button type="button" onClick={confirmNewSheikh} className="px-3 py-3 rounded-lg text-sm shrink-0" style={{ background: PALETTE.emerald, color: '#fff', fontWeight: 700 }}>Add</button>
                <button type="button" onClick={() => setAddingSheikh(false)} className="px-3 py-3 rounded-lg text-sm shrink-0" style={{ border: `1.5px solid ${PALETTE.line}`, color: PALETTE.inkSoft }}>Cancel</button>
              </div>
            ) : (
              <select value={draft.sheikhName || ''} onChange={(e) => selectSheikh(e.target.value)}
                className="px-4 py-3 rounded-lg outline-none" style={{ border: `1.5px solid ${PALETTE.line}`, fontFamily: BODY_FONT }}>
                <option value="">— None —</option>
                {[...new Set([...sheikhNames, ...(draft.sheikhName ? [draft.sheikhName] : [])])].map((n) => <option key={n} value={n}>{n}</option>)}
                <option value="__add_new__">+ Add new name…</option>
              </select>
            )}
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 cursor-pointer select-none text-sm" style={{ color: PALETTE.ink }}>
          <input type="checkbox" checked={!!draft.webinarHidden} onChange={(e) => setDraft({ ...draft, webinarHidden: e.target.checked })}
            className="w-4 h-4" style={{ accentColor: PALETTE.emerald }} />
          <span style={{ fontWeight: 700 }}>Hide webinar from takers</span>
          <span className="text-xs" style={{ color: PALETTE.inkSoft }}>— the webinar link, Sheikh name and banner stay saved but aren't shown publicly.</span>
        </label>
        <div className="mt-3 text-xs flex items-center gap-2" style={{ color: PALETTE.inkSoft }}>
          <Link2 size={13} /> Shareable link: <span style={{ fontWeight: 700, color: PALETTE.emerald }}>{quizUrl(quiz.slug)}</span>
        </div>
        <label className="mt-4 flex items-center gap-3 cursor-pointer select-none p-3 rounded-xl"
          style={{ background: isActive ? `${PALETTE.emerald}0D` : `${PALETTE.red}0D`, border: `1.5px dashed ${isActive ? PALETTE.emerald : PALETTE.red}55` }}>
          <input type="checkbox" checked={isActive} onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            className="w-4 h-4" style={{ accentColor: PALETTE.emerald }} />
          <span className="text-sm" style={{ fontWeight: 700, color: isActive ? PALETTE.emerald : PALETTE.red }}>
            {isActive ? 'Quiz is Active — open for responses' : 'Quiz is Closed — respondents will see the closed message'}
          </span>
        </label>
        {!isActive && (
          <div className="mt-2 text-xs p-3 rounded-lg" style={{ background: PALETTE.cream, color: PALETTE.inkSoft }}>
            Respondents will see: “Sarado na po ang {draft.title || 'Quiz'} — Pero pwede po kayo sumagot sa iba pang Quiz na OPEN pa...” with links to sulutions.cloud/NMAWebinar/ and the #NewMuslimPH FB page.
          </div>
        )}

        <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${PALETTE.line}` }}>
          <span className="text-xs uppercase tracking-widest" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>Questions per attempt</span>
          <div className="flex items-center gap-3 mt-2">
            <input type="number" min={0} max={draft.questions.length}
              value={draft.displayCount ?? 0}
              onChange={(e) => setDraft({ ...draft, displayCount: e.target.value })}
              className="w-24 px-3 py-2 rounded-lg outline-none text-sm" style={{ border: `1.5px solid ${PALETTE.line}`, fontFamily: BODY_FONT }} />
            <span className="text-xs" style={{ color: PALETTE.inkSoft }}>
              out of {draft.questions.length} in the pool. 0 = show all. Each taker gets a random subset in a random order, with each question's options also shuffled — this is what keeps a shared "answer key" from being useful.
            </span>
          </div>
        </div>

        <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${PALETTE.line}` }}>
          <span className="text-xs uppercase tracking-widest" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>Banner image (used for Facebook share previews)</span>
          <div className="flex items-center gap-3 mt-2">
            {imageUrl && (
              <img src={imageUrl} alt="Current banner" className="w-16 h-16 rounded-lg object-cover shrink-0" style={{ border: `1.5px solid ${PALETTE.line}` }} />
            )}
            <label className="px-4 py-2 rounded-full text-sm inline-flex items-center gap-2 cursor-pointer" style={{ border: `1.5px solid ${PALETTE.ink}`, fontWeight: 700 }}>
              {imageUrl ? 'Replace Image' : 'Upload Image'}
              <input type="file" accept="image/jpeg,image/png" onChange={handleImageSelect} className="hidden" />
            </label>
            {imageStatus === 'uploading' && <span className="text-sm" style={{ color: PALETTE.inkSoft }}>Uploading…</span>}
            {imageStatus === 'uploaded' && <span className="text-sm" style={{ color: PALETTE.emerald, fontWeight: 700 }}>Uploaded.</span>}
            {imageStatus === 'error' && <span className="text-sm" style={{ color: PALETTE.red, fontWeight: 700 }}>Upload failed. Try a smaller JPG/PNG.</span>}
          </div>
        </div>

        <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${PALETTE.line}` }}>
          <span className="text-xs uppercase tracking-widest" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>Webinar banner (shown to takers alongside the webinar link)</span>
          <div className="flex items-center gap-3 mt-2">
            {webinarBannerUrl && (
              <img src={webinarBannerUrl} alt="Current webinar banner" className="w-16 h-16 rounded-lg object-cover shrink-0" style={{ border: `1.5px solid ${PALETTE.line}` }} />
            )}
            <label className="px-4 py-2 rounded-full text-sm inline-flex items-center gap-2 cursor-pointer" style={{ border: `1.5px solid ${PALETTE.ink}`, fontWeight: 700 }}>
              {webinarBannerUrl ? 'Replace Image' : 'Upload Image'}
              <input type="file" accept="image/jpeg,image/png" onChange={handleWebinarBannerSelect} className="hidden" />
            </label>
            {webinarBannerStatus === 'uploading' && <span className="text-sm" style={{ color: PALETTE.inkSoft }}>Uploading…</span>}
            {webinarBannerStatus === 'uploaded' && <span className="text-sm" style={{ color: PALETTE.emerald, fontWeight: 700 }}>Uploaded.</span>}
            {webinarBannerStatus === 'error' && <span className="text-sm" style={{ color: PALETTE.red, fontWeight: 700 }}>Upload failed. Try a smaller JPG/PNG.</span>}
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-5" style={{ background: PALETTE.paper, border: `1.5px solid ${PALETTE.line}` }}>
        <span className="text-xs uppercase tracking-widest" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>Bulk import questions from CSV</span>
        <p className="text-xs mt-1 mb-2" style={{ color: PALETTE.inkSoft }}>Columns: Question, Option1, Option2, Option3, Option4, CorrectOption (1-4). A header row is fine.</p>
        <label className="px-4 py-2 rounded-full text-sm inline-flex items-center gap-2 cursor-pointer" style={{ border: `1.5px solid ${PALETTE.ink}`, fontWeight: 700 }}>
          Import CSV
          <input type="file" accept=".csv,text/csv" onChange={handleCsvSelect} className="hidden" />
        </label>
        {csvError && <p className="text-xs mt-2" style={{ color: PALETTE.red }}>{csvError}</p>}
      </div>

      {draft.questions.map((q, qi) => (
        <div key={q.id} className="rounded-2xl p-5" style={{ background: PALETTE.paper, border: `1.5px solid ${PALETTE.line}` }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-widest" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>Question {qi + 1}</span>
            <button onClick={() => removeQuestion(qi)} className="text-xs inline-flex items-center gap-1" style={{ color: PALETTE.red, fontWeight: 700 }}><Trash2 size={14} /> Remove</button>
          </div>
          <select value={q.type || 'mcq'} onChange={(e) => changeType(qi, e.target.value)}
            className="px-3 py-2 rounded-lg outline-none text-sm mb-3" style={{ border: `1.5px solid ${PALETTE.line}`, fontFamily: BODY_FONT }}>
            {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input value={q.text} onChange={(e) => updateQuestion(qi, { text: e.target.value })} placeholder="Question text"
            className="w-full px-4 py-3 rounded-lg mb-3 outline-none" style={{ border: `1.5px solid ${PALETTE.line}`, fontFamily: BODY_FONT }} />
          {(q.type || 'mcq') === 'mcq' && (
            <>
              <div className="grid gap-2">
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input type="radio" name={`correct-${q.id}`} checked={q.correctIndex === oi} onChange={() => updateQuestion(qi, { correctIndex: oi })} />
                    <input value={opt} onChange={(e) => updateOption(qi, oi, e.target.value)} placeholder={`Option ${oi + 1}`}
                      className="flex-1 px-3 py-2 rounded-lg outline-none text-sm" style={{ border: `1.5px solid ${q.correctIndex === oi ? PALETTE.emerald : PALETTE.line}`, fontFamily: BODY_FONT }} />
                  </div>
                ))}
              </div>
              <p className="text-xs mt-2" style={{ color: PALETTE.inkSoft }}>Select the radio button next to the correct option.</p>
            </>
          )}
          {q.type === 'truefalse' && (
            <div className="flex items-center gap-5">
              {['True', 'False'].map((label, oi) => (
                <label key={label} className="inline-flex items-center gap-2 text-sm cursor-pointer" style={{ fontWeight: 600 }}>
                  <input type="radio" name={`correct-${q.id}`} checked={q.correctIndex === oi} onChange={() => updateQuestion(qi, { correctIndex: oi })} />
                  {label} {q.correctIndex === oi && <span className="text-xs" style={{ color: PALETTE.emerald }}>(correct)</span>}
                </label>
              ))}
            </div>
          )}
          {q.type === 'text' && (
            <>
              <div className="grid gap-2">
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input value={opt} onChange={(e) => updateOption(qi, oi, e.target.value)} placeholder={`Accepted answer ${oi + 1}`}
                      className="flex-1 px-3 py-2 rounded-lg outline-none text-sm" style={{ border: `1.5px solid ${PALETTE.emerald}`, fontFamily: BODY_FONT }} />
                    {q.options.length > 1 && (
                      <button type="button" onClick={() => updateQuestion(qi, { options: q.options.filter((_, idx) => idx !== oi) })} title="Remove this accepted answer">
                        <Trash2 size={14} color={PALETTE.red} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => updateQuestion(qi, { options: [...q.options, ''] })} className="mt-2 text-xs inline-flex items-center gap-1" style={{ color: PALETTE.emerald, fontWeight: 700 }}>
                <Plus size={12} /> Add another accepted answer
              </button>
              <p className="text-xs mt-2" style={{ color: PALETTE.inkSoft }}>Takers type their answer; any one of these counts as correct. Capitals, extra spaces and end punctuation are ignored. With no accepted answers filled in, the question isn't graded.</p>
            </>
          )}
          {q.type === 'short' && (
            <p className="text-xs" style={{ color: PALETTE.inkSoft }}>Takers type any text. There's no correct answer, so it isn't graded and doesn't count toward the score — read the answers in the Responses tab.</p>
          )}
        </div>
      ))}

      <button onClick={addQuestion} className="self-start px-4 py-2 rounded-full text-sm inline-flex items-center gap-2" style={{ border: `1.5px solid ${PALETTE.ink}`, fontWeight: 700 }}><Plus size={14} /> Add Question</button>

      {saveBar}
    </div>
  );
});
