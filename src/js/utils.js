// ---------------- Small pure helpers shared across components ----------------

export function quizUrl(slug) {
  return window.location.origin + import.meta.env.BASE_URL + slug;
}

export function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export function formatTimeMMSS(ms) {
  if (ms == null || Number.isNaN(ms)) return '00:00';
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Minimal CSV parser (handles quoted fields with embedded commas, no external
// dependency needed). Expected columns: Question, Option1..Option4, CorrectOption(1-4)
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Same rule the server uses to grade typed answers: case, repeated spaces and
// end punctuation don't matter.
export function normalizeAnswer(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').replace(/^[\s.,!?'"]+|[\s.,!?'"]+$/g, '').toLowerCase();
}
