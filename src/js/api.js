// ---------------- API helpers ----------------
// Every fetch call the frontend makes to server.js lives here. Nothing else
// in the app should call fetch() directly against /api/* — this is the one
// place request shapes and response handling are defined, so a backend
// contract change only needs updating in one file.
const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, '/');

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

export async function apiAdminLogin(username, password) {
  const r = await fetch(`${API_BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return r.ok ? r.json() : null; // null signals bad credentials
}

export async function apiAdminLogout(token) {
  const r = await fetch(`${API_BASE}/admin/logout`, { method: 'POST', headers: authHeaders(token) });
  return r.ok;
}

// Validates a stored token (e.g. after a page refresh) without re-sending credentials.
export async function apiAdminMe(token) {
  const r = await fetch(`${API_BASE}/admin/me`, { headers: authHeaders(token) });
  return r.ok ? r.json() : null;
}

export async function apiListQuizzes(token) {
  const r = await fetch(`${API_BASE}/quizzes`, { headers: authHeaders(token) });
  return r.ok ? r.json() : [];
}

export async function apiGetQuiz(slug, token) {
  const r = await fetch(`${API_BASE}/quizzes/${slug}`, { headers: authHeaders(token) });
  return r.ok ? r.json() : null;
}

export async function apiStartAttempt(slug) {
  const r = await fetch(`${API_BASE}/quizzes/${slug}/start`, { method: 'POST' });
  if (!r.ok) return null;
  const data = await r.json();
  return data && data.token && Array.isArray(data.questions) ? data : null;
}

export async function apiCreateQuiz(data, token) {
  const r = await fetch(`${API_BASE}/quizzes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(data),
  });
  return r.ok ? r.json() : null;
}

export async function apiUpdateQuiz(slug, data, token) {
  const r = await fetch(`${API_BASE}/quizzes/${slug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(data),
  });
  return r.ok ? r.json() : null;
}

export async function apiDeleteQuiz(slug, token) {
  const r = await fetch(`${API_BASE}/quizzes/${slug}`, { method: 'DELETE', headers: authHeaders(token) });
  return r.ok;
}

export async function apiDuplicateQuiz(slug, token) {
  const r = await fetch(`${API_BASE}/quizzes/${slug}/duplicate`, { method: 'POST', headers: authHeaders(token) });
  return r.ok ? r.json() : null;
}

export async function apiGetSubmissions(token, slug) {
  const qs = slug ? `?slug=${encodeURIComponent(slug)}` : '';
  const r = await fetch(`${API_BASE}/submissions${qs}`, { headers: authHeaders(token) });
  return r.ok ? r.json() : null; // null signals auth failure
}

export async function apiCheckAttempt(slug, email, mobile) {
  const qs = new URLSearchParams({ email: email || '', mobile: mobile || '' }).toString();
  const r = await fetch(`${API_BASE}/quizzes/${slug}/attempt?${qs}`);
  if (!r.ok) return { attempted: false }; // fail open — don't block someone due to a network hiccup
  return r.json();
}

export async function apiUploadQuizImage(slug, dataUrl, token) {
  const r = await fetch(`${API_BASE}/quizzes/${slug}/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ dataUrl }),
  });
  return r.ok ? r.json() : null;
}

export async function apiUploadWebinarBanner(slug, dataUrl, token) {
  const r = await fetch(`${API_BASE}/quizzes/${slug}/webinar-banner`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ dataUrl }),
  });
  return r.ok ? r.json() : null;
}

export async function apiGetSheikhNames(token) {
  const r = await fetch(`${API_BASE}/sheikh-names`, { headers: authHeaders(token) });
  return r.ok ? r.json() : [];
}

export async function apiAddSheikhName(name, token) {
  const r = await fetch(`${API_BASE}/sheikh-names`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ name }),
  });
  return r.ok ? r.json() : null;
}

export async function apiAddSubmission(record) {
  const r = await fetch(`${API_BASE}/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  if (r.status === 409) return { ok: false, alreadyAttempted: true };
  if (r.status === 403) return { ok: false, closed: true };
  if (r.status === 400) return { ok: false, invalidSession: true };
  if (!r.ok) return { ok: false, alreadyAttempted: false, closed: false };
  const data = await r.json();
  return { ok: true, alreadyAttempted: false, closed: false, ...data };
}

export async function apiDeleteSubmission(id, token) {
  const r = await fetch(`${API_BASE}/submissions/${id}`, { method: 'DELETE', headers: authHeaders(token) });
  return r.ok;
}

export async function apiGetSettings() {
  const r = await fetch(`${API_BASE}/settings`);
  return r.ok ? r.json() : null;
}

export async function apiUpdateSettings(settings, token) {
  const r = await fetch(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(settings),
  });
  return r.ok ? r.json() : null;
}
