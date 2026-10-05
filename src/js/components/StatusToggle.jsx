import { useState } from 'react';
import { PALETTE } from '../theme.js';
import { apiUpdateQuiz } from '../api.js';

// Quick open/close toggle shown in the main panel header, so status can be
// flipped without opening the full question editor.
export function StatusToggle({ quiz, token, onChanged }) {
  const [busy, setBusy] = useState(false);
  const isActive = quiz.active !== false;

  const toggle = async () => {
    setBusy(true);
    const updated = await apiUpdateQuiz(quiz.slug, {
      title: quiz.title, category: quiz.category, questions: quiz.questions, active: !isActive,
    }, token);
    setBusy(false);
    if (updated) onChanged(updated);
  };

  return (
    <button onClick={toggle} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm disabled:opacity-50 transition-colors"
      style={{
        border: `1.5px solid ${isActive ? PALETTE.emerald : PALETTE.red}`,
        background: isActive ? `${PALETTE.emerald}12` : `${PALETTE.red}12`,
        color: isActive ? PALETTE.emerald : PALETTE.red, fontWeight: 700,
      }}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: isActive ? PALETTE.emerald : PALETTE.red }} />
      {busy ? 'Updating…' : isActive ? 'Live — Taking Responses' : 'Closed to Respondents'}
    </button>
  );
}
