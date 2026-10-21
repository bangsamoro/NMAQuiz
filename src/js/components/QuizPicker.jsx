import { useState, useMemo } from 'react';
import { Plus, Trash2, Copy, X, Search, ArrowDownAZ, Calendar, Download, Users } from 'lucide-react';
import { PALETTE, CATEGORIES } from '../theme.js';
import { apiCreateQuiz, apiDeleteQuiz, apiDuplicateQuiz } from '../api.js';
import { Field, CategoryBadge } from './atoms.jsx';

// ============================================================================
// Admin: quiz sidebar (picker + create-new-quiz)
// ============================================================================
export function QuizPicker({ quizzes, selectedSlug, onSelect, onCreated, onDeleted, token }) {
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState(CATEGORIES[0]);
  const [newPublishDate, setNewPublishDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [duplicatingSlug, setDuplicatingSlug] = useState(null);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [titleQuery, setTitleQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [sortMode, setSortMode] = useState('none'); // 'none' | 'alpha' | 'date'

  const create = async () => {
    setBusy(true);
    const quiz = await apiCreateQuiz({
      title: newTitle.trim() || 'Untitled Quiz',
      category: newCategory,
      publishDate: newPublishDate || null,
      questions: [
        { id: `q${Date.now()}-1`, text: '', options: ['', '', '', ''], correctIndex: 0 },
        { id: `q${Date.now()}-2`, text: '', options: ['', '', '', ''], correctIndex: 0 },
        { id: `q${Date.now()}-3`, text: '', options: ['', '', '', ''], correctIndex: 0 },
      ],
    }, token);
    setBusy(false);
    if (quiz) {
      onCreated(quiz);
      setCreating(false);
      setNewTitle('');
      setNewCategory(CATEGORIES[0]);
      setNewPublishDate('');
    }
  };

  const remove = async (slug) => {
    if (!window.confirm('Delete this quiz? Past responses for it will be kept.')) return;
    const ok = await apiDeleteQuiz(slug, token);
    if (ok) onDeleted(slug);
  };

  const duplicate = async (slug) => {
    setDuplicatingSlug(slug);
    const quiz = await apiDuplicateQuiz(slug, token);
    setDuplicatingSlug(null);
    if (quiz) onCreated(quiz);
  };

  const visibleQuizzes = useMemo(() => {
    let list = quizzes;
    if (filterCategory) list = list.filter((q) => q.category === filterCategory);
    if (filterFrom || filterTo) {
      list = list.filter((q) => {
        if (!q.publishDate) return false;
        if (filterFrom && q.publishDate < filterFrom) return false;
        if (filterTo && q.publishDate > filterTo) return false;
        return true;
      });
    }
    if (titleQuery.trim()) {
      const needle = titleQuery.trim().toLowerCase();
      list = list.filter((q) => q.title.toLowerCase().includes(needle));
    }
    if (sortMode === 'alpha') {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortMode === 'date') {
      // Quizzes with no publish date sort last — nothing meaningful to rank them by.
      list = [...list].sort((a, b) => {
        if (!a.publishDate && !b.publishDate) return 0;
        if (!a.publishDate) return 1;
        if (!b.publishDate) return -1;
        return a.publishDate.localeCompare(b.publishDate);
      });
    }
    return list;
  }, [quizzes, filterFrom, filterTo, titleQuery, filterCategory, sortMode]);

  const clearFilter = () => { setFilterFrom(''); setFilterTo(''); };

  const exportCsv = () => {
    const header = ['Slug', 'Title', 'Category', 'Status', 'Publish Date', 'Webinar URL', 'Questions', 'Participants'];
    const rows = visibleQuizzes.map((q) => [
      q.slug, q.title, q.category, q.active === false ? 'Closed' : 'Active',
      q.publishDate || '', q.webinarUrl || '', q.questionCount ?? '', q.participantCount ?? '',
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'quizzes.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3 lg:sticky lg:top-24" style={{ background: PALETTE.paper, border: `1.5px solid ${PALETTE.line}` }}>
      <div className="flex items-center justify-between px-1">
        <span className="text-xs uppercase tracking-widest" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>Quizzes ({quizzes.length})</span>
        <div className="flex items-center gap-1.5">
          <button onClick={exportCsv} disabled={!visibleQuizzes.length} className="p-2 rounded-full transition-colors disabled:opacity-40" style={{ border: `1.5px solid ${PALETTE.ink}` }} title="Export CSV">
            <Download size={14} />
          </button>
          <button onClick={() => setCreating((c) => !c)} className="p-2 rounded-full transition-colors" style={{ border: `1.5px solid ${PALETTE.ink}` }} title="New Quiz">
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" color={PALETTE.inkSoft} />
          <input value={titleQuery} onChange={(e) => setTitleQuery(e.target.value)} placeholder="Search by title…"
            className="w-full pl-8 pr-2.5 py-2 rounded-lg outline-none text-sm" style={{ border: `1.5px solid ${PALETTE.line}` }} />
        </div>
        <button onClick={() => setSortMode((m) => m === 'alpha' ? 'none' : 'alpha')} title="Sort alphabetically (A-Z)"
          className="shrink-0 px-2.5 py-2 rounded-lg text-xs inline-flex items-center gap-1"
          style={{ border: `1.5px solid ${sortMode === 'alpha' ? PALETTE.emerald : PALETTE.ink}`, fontWeight: 700, background: sortMode === 'alpha' ? `${PALETTE.emerald}12` : 'transparent', color: sortMode === 'alpha' ? PALETTE.emeraldDark : PALETTE.ink }}>
          <ArrowDownAZ size={14} />
        </button>
        <button onClick={() => setSortMode((m) => m === 'date' ? 'none' : 'date')} title="Sort by publish date"
          className="shrink-0 px-2.5 py-2 rounded-lg text-xs inline-flex items-center gap-1"
          style={{ border: `1.5px solid ${sortMode === 'date' ? PALETTE.emerald : PALETTE.ink}`, fontWeight: 700, background: sortMode === 'date' ? `${PALETTE.emerald}12` : 'transparent', color: sortMode === 'date' ? PALETTE.emeraldDark : PALETTE.ink }}>
          <Calendar size={14} />
        </button>
      </div>

      {creating && (
        <div className="flex flex-col gap-3 p-3 rounded-xl" style={{ background: PALETTE.cream }}>
          <Field label="New quiz title" value={newTitle} onChange={setNewTitle} placeholder="e.g. Ramadan Fiqh Basics" />
          <label className="flex flex-col gap-1.5 text-left">
            <span className="text-xs uppercase tracking-widest" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>Category</span>
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="px-3 py-2 rounded-lg outline-none text-sm" style={{ border: `1.5px solid ${PALETTE.line}` }}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <Field label="Publish date" type="date" value={newPublishDate} onChange={setNewPublishDate} />
          <button onClick={create} disabled={busy} className="px-4 py-2.5 rounded-full text-white text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${PALETTE.emerald}, ${PALETTE.emeraldDark})`, fontWeight: 700 }}>
            {busy ? 'Creating…' : 'Create Quiz'}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2 p-3 rounded-xl" style={{ background: PALETTE.cream }}>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>Filter by category</span>
          {filterCategory && (
            <button onClick={() => setFilterCategory('')} className="text-[11px] inline-flex items-center gap-1" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>
              <X size={11} /> Clear
            </button>
          )}
        </div>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
          className="px-2.5 py-2 rounded-lg outline-none text-xs" style={{ border: `1.5px solid ${PALETTE.line}` }}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs uppercase tracking-widest" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>Filter by publish date</span>
          {(filterFrom || filterTo) && (
            <button onClick={clearFilter} className="text-[11px] inline-flex items-center gap-1" style={{ color: PALETTE.inkSoft, fontWeight: 700 }}>
              <X size={11} /> Clear
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
            className="flex-1 min-w-0 px-2.5 py-2 rounded-lg outline-none text-xs" style={{ border: `1.5px solid ${PALETTE.line}` }} />
          <span className="text-xs" style={{ color: PALETTE.inkSoft }}>to</span>
          <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
            className="flex-1 min-w-0 px-2.5 py-2 rounded-lg outline-none text-xs" style={{ border: `1.5px solid ${PALETTE.line}` }} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5 max-h-[70vh] overflow-y-auto pr-0.5">
        {visibleQuizzes.map((q) => {
          const selected = q.slug === selectedSlug;
          const closed = q.active === false;
          return (
            <div key={q.slug} onClick={() => onSelect(q.slug)}
              className="group cursor-pointer rounded-xl px-3 py-2.5 flex items-start justify-between gap-2 transition-colors"
              style={{ background: selected ? `${PALETTE.emerald}12` : 'transparent', border: `1.5px solid ${selected ? PALETTE.emerald : 'transparent'}` }}>
              <div className="min-w-0">
                <div className="text-sm break-words" style={{ fontWeight: 700, color: selected ? PALETTE.emeraldDark : PALETTE.ink }}>{q.title}</div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <CategoryBadge category={q.category} />
                  {closed && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wide" style={{ background: `${PALETTE.red}1A`, color: PALETTE.red, fontWeight: 700 }}>Closed</span>
                  )}
                  {q.publishDate && (
                    <span className="text-[10px]" style={{ color: PALETTE.inkSoft, fontWeight: 600 }}>{q.publishDate}</span>
                  )}
                  {q.participantCount != null && (
                    <span className="text-[10px] inline-flex items-center gap-0.5" style={{ color: PALETTE.inkSoft, fontWeight: 600 }} title="Participants">
                      <Users size={10} /> {q.participantCount}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); duplicate(q.slug); }} disabled={duplicatingSlug === q.slug} title="Duplicate quiz">
                  <Copy size={14} color={PALETTE.inkSoft} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); remove(q.slug); }} title="Delete quiz">
                  <Trash2 size={14} color={PALETTE.red} />
                </button>
              </div>
            </div>
          );
        })}
        {!quizzes.length && <div className="text-xs text-center py-6" style={{ color: PALETTE.inkSoft }}>No quizzes yet. Create one above.</div>}
        {!!quizzes.length && !visibleQuizzes.length && <div className="text-xs text-center py-6" style={{ color: PALETTE.inkSoft }}>No quizzes match the current search/filter.</div>}
      </div>
    </div>
  );
}
