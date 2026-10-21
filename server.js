import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import pool from './db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_IMG_DIR = path.join(__dirname, 'public', 'img');

const PORT = process.env.PORT || 3000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Must match `base` in vite.config.js.
const BASE_URL = '/NMAWebinar/';

const SLUG_PREFIX = 'NMAPH';
const COUNTER_NAME = 'quiz_number';

const CATEGORIES = ['Hadith', "Qur'an", 'Seerah', 'Aqeedah', 'Webinars', 'Unang Hakbang', 'Salaah at Wudhu', 'Pagsamba', 'Paniniwala', 'Tajweed/Tahseen'];

// Fisher-Yates shuffle — returns a new shuffled array, doesn't mutate the input.
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Replaces the old single shared ADMIN_PASSCODE. Looks up a bearer token
// against admin_sessions (opaque tokens, not JWT — a row is trivially
// revocable and survives a deploy's app restart, unlike an in-memory
// store). Returns null rather than throwing so callers that need to serve
// both public and admin traffic from the same route (the quiz list/detail
// endpoints) can use it as a soft check.
async function getAdminFromRequest(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const [[row]] = await pool.query(
    `SELECT u.id, u.username, u.role FROM admin_sessions s
     JOIN admin_users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > NOW()`,
    [token]
  );
  return row || null;
}

async function requireAdminAuth(req, res, next) {
  try {
    const adminUser = await getAdminFromRequest(req);
    if (!adminUser) return res.status(401).json({ error: 'Unauthorized' });
    req.adminUser = adminUser;
    next();
  } catch (err) { next(err); }
}

// 'admin' can manage everything but a closed quiz simply doesn't exist for
// them — 'super_admin' has no restriction. Used both to filter listings and
// to gate direct access to a specific quiz (404, not 403, so a closed quiz
// looks the same as one that was never there).
function canAccessQuiz(adminUser, quizRow) {
  return adminUser.role === 'super_admin' || !!quizRow.active;
}

// Resolves an uploaded image's filename for a given base name (a quiz slug
// for the Facebook-share banner, or `<slug>-webinar` for the webinar
// banner): <base>.jpg/.jpeg/.png, optionally falling back to
// default.jpg/.jpeg/.png. Returns null if nothing exists.
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png'];
function resolveImageFile(baseName, { fallbackDefault = false } = {}) {
  for (const ext of IMAGE_EXTS) {
    if (fs.existsSync(path.join(PUBLIC_IMG_DIR, `${baseName}${ext}`))) return `${baseName}${ext}`;
  }
  if (fallbackDefault) {
    for (const ext of IMAGE_EXTS) {
      if (fs.existsSync(path.join(PUBLIC_IMG_DIR, `default${ext}`))) return `default${ext}`;
    }
  }
  return null;
}
const webinarBannerBase = (slug) => `${slug}-webinar`;

// Both banner URLs for a quiz, resolved against the request's own
// proto/host so links work behind the reverse proxy. Shared by every route
// that returns a quiz object with these fields, so a save/create response
// is never missing them relative to what GET would return for the same quiz.
function resolveBannerUrls(slug, req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const imageFile = resolveImageFile(slug, { fallbackDefault: true });
  const webinarBannerFile = resolveImageFile(webinarBannerBase(slug));
  return {
    imageUrl: imageFile ? `${proto}://${host}${BASE_URL}img/${imageFile}` : null,
    webinarBannerUrl: webinarBannerFile ? `${proto}://${host}${BASE_URL}img/${webinarBannerFile}` : null,
  };
}

// Facebook's crawler (and other social-media link-preview bots) don't run
// JavaScript, so per-quiz Open Graph tags have to be baked into the HTML
// response server-side rather than set client-side in React.
function renderIndexWithMeta(baseHtml, { title, description, url, imageUrl }) {
  const esc = (s) => String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let html = baseHtml;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${esc(title)}" />`);
  html = html.replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${esc(description)}" />`);

  // Strip the static fallback og:image/og:url/twitter:* tags baked into
  // index.html — they get replaced below with quiz-specific ones.
  html = html.replace(/\s*<meta (property="og:(url|image(:width|:height)?)"|name="twitter:[^"]*") content="[^"]*"\s*\/>/g, '');

  const extraTags = [
    `<meta property="og:url" content="${esc(url)}" />`,
    imageUrl && `<meta property="og:image" content="${esc(imageUrl)}" />`,
    imageUrl && `<meta property="og:image:width" content="1200" />`,
    imageUrl && `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    imageUrl && `<meta name="twitter:image" content="${esc(imageUrl)}" />`,
  ].filter(Boolean).join('\n    ');

  html = html.replace(
    '<meta property="og:type" content="website" />',
    `<meta property="og:type" content="website" />\n    ${extraTags}`
  );
  return html;
}

// --- DB helpers -------------------------------------------------------
// mysql2 returns BOOLEAN/TINYINT(1) columns as JS 0/1, not true/false —
// every row read from `quizzes`/`submissions` must have its boolean
// columns coerced with !! before any `=== false` / `!== false` comparison
// runs, or an inactive quiz would silently evaluate as active.

// mysql2 (with dateStrings: false) returns DATE columns as JS Date objects
// at UTC midnight — normalize to a plain 'YYYY-MM-DD' string so the frontend
// never has to deal with timezones for a value that's just a calendar date.
function toDateStr(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

async function fetchQuizRow(slug) {
  const [rows] = await pool.query('SELECT * FROM quizzes WHERE slug = ?', [slug]);
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.slug,
    slug: r.slug,
    category: r.category,
    title: r.title,
    active: !!r.active,
    displayCount: r.display_count,
    publishDate: toDateStr(r.publish_date),
    webinarUrl: r.webinar_url,
    sheikhName: r.sheikh_name,
    webinarHidden: !!r.webinar_hidden,
  };
}

async function fetchQuestions(slug) {
  const [rows] = await pool.query(
    'SELECT legacy_id AS id, text, options, correct_index AS correctIndex FROM questions WHERE quiz_slug = ? ORDER BY position ASC',
    [slug]
  );
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    options: typeof r.options === 'string' ? JSON.parse(r.options) : r.options,
    correctIndex: r.correctIndex,
  }));
}

function effectiveQuestionCount(displayCount, poolSize) {
  return displayCount && displayCount > 0 ? Math.min(displayCount, poolSize) : poolSize;
}

// Accepts a 'YYYY-MM-DD' string (what a <input type="date"> sends) — anything
// else (missing, empty, malformed) normalizes to null rather than being stored.
function normalizePublishDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

// Trims whitespace; empty/missing becomes null. No stricter validation
// (e.g. requiring http(s)://) — admin-only free text, same trust level as
// title/category.
function normalizeWebinarUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

// Trims whitespace; empty/missing becomes null. Same trust level as title —
// picked from a dropdown of known names, but free text is accepted too
// (see POST /api/sheikh-names).
function normalizeSheikhName(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

async function hasAttempted(slug, email, mobile) {
  const normEmail = (email || '').trim().toLowerCase();
  const normMobile = (mobile || '').trim();
  if (!normEmail && !normMobile) return false;
  const [rows] = await pool.query(
    'SELECT 1 FROM submissions WHERE quiz_slug = ? AND (LOWER(email) = ? OR mobile = ?) LIMIT 1',
    [slug, normEmail, normMobile]
  );
  return rows.length > 0;
}

function mapSubmissionRow(r) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    mobile: r.mobile,
    facebookProfile: r.facebook_profile,
    followConfirmed: !!r.follow_confirmed,
    answers: typeof r.answers === 'string' ? JSON.parse(r.answers) : r.answers,
    score: r.score,
    total: r.total,
    questionIds: r.question_ids == null ? null : (typeof r.question_ids === 'string' ? JSON.parse(r.question_ids) : r.question_ids),
    quizSlug: r.quiz_slug,
    quizTitle: r.quiz_title,
    durationMs: r.duration_ms,
    timestamp: r.timestamp,
    ip: r.ip,
  };
}

// Claims the next slug number under a row lock — shared by create and
// duplicate so two near-simultaneous requests (even against this single
// Node process, which can interleave concurrent requests) can't race and
// hand out the same slug twice.
async function nextQuizSlug(conn) {
  const [[counterRow]] = await conn.query('SELECT next_value FROM app_counters WHERE name = ? FOR UPDATE', [COUNTER_NAME]);
  const number = counterRow.next_value;
  await conn.query('UPDATE app_counters SET next_value = next_value + 1 WHERE name = ?', [COUNTER_NAME]);
  return `${SLUG_PREFIX}${number}`;
}

// Replaces a quiz's whole question set in one transaction — mirrors how
// PUT/POST already always send the full array, never a partial diff.
async function replaceQuestions(conn, slug, questions) {
  await conn.query('DELETE FROM questions WHERE quiz_slug = ?', [slug]);
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    await conn.query(
      'INSERT INTO questions (quiz_slug, legacy_id, position, text, options, correct_index) VALUES (?, ?, ?, ?, ?, ?)',
      [slug, q.id ?? `q${Date.now()}-${i}`, i, q.text ?? '', JSON.stringify(q.options ?? ['', '', '', '']), q.correctIndex ?? 0]
    );
  }
}

// In-memory store for in-progress quiz attempts: token -> { slug, startedAt }.
// A token is minted when someone clicks Start Quiz and is required to submit
// — this is what makes durationMs trustworthy (the server's own clock, not
// whatever the browser reports) instead of a value the client could forge.
// Ephemeral by design: losing these on a restart just means an in-progress
// attempt has to restart, which is an acceptable trade-off for simplicity.
const activeAttempts = new Map();
const MAX_ATTEMPT_AGE_MS = 3 * 60 * 60 * 1000; // 3 hours — generous ceiling before we consider it abandoned
setInterval(() => {
  const now = Date.now();
  for (const [token, a] of activeAttempts) {
    if (now - a.startedAt > MAX_ATTEMPT_AGE_MS) activeAttempts.delete(token);
  }
}, 30 * 60 * 1000);

const app = express();
// Needed so req.ip / X-Forwarded-For resolve to the real visitor IP when
// running behind a reverse proxy (Nginx, load balancer, etc.) in production.
app.set('trust proxy', true);
app.use(cors());
// Higher limit than the default 100kb — banner images are uploaded as base64
// JSON payloads (see the /image upload route below).
app.use(express.json({ limit: '8mb' }));

// Public: lightweight list of quizzes for the landing page. Admin callers
// (a valid bearer token) additionally get webinarUrl and participantCount
// — participation numbers stay out of the public response since they're
// only really useful for the admin's own tracking/export, not visitors.
// An 'admin'-role caller (as opposed to 'super_admin') only ever gets
// active quizzes back — closed ones simply aren't in the list for them.
app.get('/api/quizzes', async (req, res, next) => {
  try {
    const adminUser = await getAdminFromRequest(req);
    // Two separate LEFT JOINs (questions, submissions) in one query would
    // fan out — each question row multiplied by each submission row per
    // quiz — so both counts use COUNT(DISTINCT ...) to stay correct.
    const [rows] = await pool.query(
      `SELECT q.slug, q.category, q.title, q.active, q.display_count, q.publish_date, q.webinar_url,
              COUNT(DISTINCT qs.id) AS question_count,
              COUNT(DISTINCT s.id) AS participant_count
       FROM quizzes q
       LEFT JOIN questions qs ON qs.quiz_slug = q.slug
       LEFT JOIN submissions s ON s.quiz_slug = q.slug
       GROUP BY q.slug, q.category, q.title, q.active, q.display_count, q.publish_date, q.webinar_url, q.created_at
       ORDER BY q.created_at ASC, q.slug ASC`
    );
    const visibleRows = adminUser && adminUser.role === 'admin' ? rows.filter((r) => !!r.active) : rows;
    res.json(visibleRows.map((r) => ({
      id: r.slug,
      slug: r.slug,
      category: r.category,
      title: r.title,
      active: !!r.active,
      publishDate: toDateStr(r.publish_date),
      questionCount: effectiveQuestionCount(r.display_count, r.question_count),
      ...(adminUser ? { webinarUrl: r.webinar_url, participantCount: r.participant_count } : {}),
    })));
  } catch (err) { next(err); }
});

// Public: quiz content for taking it. Strips each question's correctIndex
// unless the caller is an authenticated admin (editing needs it) — otherwise
// the answer key would sit right there in the network tab before anyone
// even starts the quiz. An 'admin'-role caller gets a 404 for a closed
// quiz, same as if it didn't exist — only 'super_admin' can reach it here.
// Non-admin (public) callers are unaffected: they can still fetch a closed
// quiz's metadata, since that's what powers the "this quiz is closed"
// message on the taker-facing page.
app.get('/api/quizzes/:slug', async (req, res, next) => {
  try {
    const quiz = await fetchQuizRow(req.params.slug);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const { imageUrl, webinarBannerUrl } = resolveBannerUrls(quiz.slug, req);

    const adminUser = await getAdminFromRequest(req);
    if (adminUser) {
      if (!canAccessQuiz(adminUser, quiz)) return res.status(404).json({ error: 'Quiz not found' });
      const questions = await fetchQuestions(quiz.slug);
      return res.json({ ...quiz, questions, imageUrl, webinarBannerUrl });
    }

    // Public callers only get quiz metadata here — no question content at all.
    // The actual questions (a randomized subset, randomized order, shuffled
    // options) are only ever handed out by POST /start, once someone actually
    // begins the quiz. This stops repeated page loads from being used to
    // quietly scrape the whole question bank without ever starting an attempt.
    // sheikhName/webinarBannerUrl ARE included here (unlike the Facebook-share
    // imageUrl above) — they're meant to be shown to takers alongside the
    // webinar link, not just used for social-preview meta tags.
    const [[{ c: poolSize }]] = await pool.query('SELECT COUNT(*) AS c FROM questions WHERE quiz_slug = ?', [quiz.slug]);
    // "Hide webinar" withholds the webinar link, Sheikh name and banner from
    // takers entirely (not just in the UI) — they stay saved for the admin.
    const webinarFields = quiz.webinarHidden
      ? { webinarUrl: null, sheikhName: null, webinarBannerUrl: null }
      : { webinarBannerUrl };
    res.json({ ...quiz, ...webinarFields, questionCount: effectiveQuestionCount(quiz.displayCount, poolSize) });
  } catch (err) { next(err); }
});

// Public: mint a one-time attempt token right when someone clicks Start Quiz.
// The server records its own startedAt here; the client only ever sees the
// opaque token, never the timestamp, so it can't be spoofed.
//
// This is also where the actual question content is handed out — and only
// here. If a quiz's pool has more questions than its displayCount, a random
// subset is picked; question order is shuffled; and each question's own
// options are shuffled too. Two people taking the same quiz back-to-back are
// very unlikely to see the same questions in the same order with the same
// option lettering, which makes "the answer is C" tips useless to pass
// around. The mapping needed to grade correctly is kept server-side in
// activeAttempts, never sent to the client.
app.post('/api/quizzes/:slug/start', async (req, res, next) => {
  try {
    const quiz = await fetchQuizRow(req.params.slug);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    if (!quiz.active) return res.status(403).json({ error: 'This quiz is closed.' });

    const pool_ = await fetchQuestions(quiz.slug);
    const count = effectiveQuestionCount(quiz.displayCount, pool_.length);
    const selected = shuffleArray(pool_).slice(0, count);

    const questionIds = [];
    const correctIndexes = [];
    const questions = selected.map((q) => {
      const optionOrder = shuffleArray(q.options.map((_, i) => i)); // e.g. [2,0,3,1]
      const options = optionOrder.map((origIdx) => q.options[origIdx]);
      questionIds.push(q.id);
      correctIndexes.push(optionOrder.indexOf(q.correctIndex)); // where the correct option landed after shuffling
      return { id: q.id, text: q.text, options };
    });

    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    activeAttempts.set(token, { slug: quiz.slug, startedAt: Date.now(), questionIds, correctIndexes });
    res.json({ token, questions });
  } catch (err) { next(err); }
});

// Public: check before letting someone start whether they've already taken this quiz
// (matches on email OR mobile — doesn't return any submission details, just a boolean)
app.get('/api/quizzes/:slug/attempt', async (req, res, next) => {
  try {
    const { email, mobile } = req.query;
    res.json({ attempted: await hasAttempted(req.params.slug, email, mobile) });
  } catch (err) { next(err); }
});

// Public: current UI theme (color palette + font pairing). Public because
// the taker-facing pages need it too, not just the admin dashboard — the
// whole point is that a branding change shows up everywhere. Returns an
// empty object (not 404) when nothing has been saved yet, so the frontend's
// applyTheme() has nothing to merge in and simply keeps its built-in
// defaults.
app.get('/api/settings', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT settings FROM site_settings WHERE id = 1');
    if (!rows.length) return res.json({});
    const settings = typeof rows[0].settings === 'string' ? JSON.parse(rows[0].settings) : rows[0].settings;
    res.json(settings || {});
  } catch (err) { next(err); }
});

// Login: username+password -> bcrypt compare -> new opaque session token.
app.post('/api/admin/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });

    const [[user]] = await pool.query(
      'SELECT id, username, password_hash, role FROM admin_users WHERE username = ?',
      [username]
    );
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await pool.query('INSERT INTO admin_sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [token, user.id, expiresAt]);
    // Housekeeping for this user's own expired sessions — good enough for a
    // two-person tool, no separate cleanup job needed.
    await pool.query('DELETE FROM admin_sessions WHERE user_id = ? AND expires_at <= NOW()', [user.id]);

    res.json({ token, username: user.username, role: user.role });
  } catch (err) { next(err); }
});

// Logout: drop the session row so the token stops working immediately.
app.post('/api/admin/logout', requireAdminAuth, async (req, res, next) => {
  try {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token) await pool.query('DELETE FROM admin_sessions WHERE token = ?', [token]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Lets the frontend validate/restore a token it already has (e.g. after a
// page refresh) without re-sending credentials.
app.get('/api/admin/me', requireAdminAuth, (req, res) => {
  res.json({ username: req.adminUser.username, role: req.adminUser.role });
});

// Admin only: replace the saved theme. Body: { palette?: {...}, fonts?: {display, body} }.
// Stored as-is (an upsert on the single row) — validation of individual
// color/font values happens on the frontend (theme.js's applyTheme only
// ever copies over keys it already knows about), so a malformed save here
// can't corrupt anything beyond the theme itself.
app.put('/api/settings', requireAdminAuth, async (req, res, next) => {
  try {
    const { palette, fonts } = req.body || {};
    const settings = {};
    if (palette && typeof palette === 'object') settings.palette = palette;
    if (fonts && typeof fonts === 'object') settings.fonts = fonts;
    await pool.query(
      'INSERT INTO site_settings (id, settings) VALUES (1, ?) ON DUPLICATE KEY UPDATE settings = VALUES(settings)',
      [JSON.stringify(settings)]
    );
    res.json({ ok: true, ...settings });
  } catch (err) { next(err); }
});

// Admin only: the reusable list of Sheikh names offered in the quiz-editor
// dropdown (seeded initially by db/migrations/005_add_sheikh_name.sql).
app.get('/api/sheikh-names', requireAdminAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT name FROM sheikh_names ORDER BY name ASC');
    res.json(rows.map((r) => r.name));
  } catch (err) { next(err); }
});

// Admin only: add a new name to that list (e.g. from the editor's "add new
// name" option), so it's offered for every quiz from then on. Idempotent —
// re-adding an existing name is a no-op, not an error.
app.post('/api/sheikh-names', requireAdminAuth, async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'A name is required.' });
    await pool.query('INSERT IGNORE INTO sheikh_names (name) VALUES (?)', [name]);
    res.json({ ok: true, name });
  } catch (err) { next(err); }
});

// Admin only: create a new quiz — slug is auto-assigned, never client-supplied.
// The counter is incremented inside a transaction with a row lock so two
// near-simultaneous creates can't race and hand out the same slug twice.
app.post('/api/quizzes', requireAdminAuth, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { title, category, questions, active, displayCount, publishDate, webinarUrl, sheikhName, webinarHidden } = req.body;

    await conn.beginTransaction();
    const slug = await nextQuizSlug(conn);
    const finalTitle = title && title.trim() ? title.trim() : 'Untitled Quiz';
    const finalCategory = CATEGORIES.includes(category) ? category : CATEGORIES[0];
    const finalActive = typeof active === 'boolean' ? active : true;
    // 0 (or omitted) means "show the whole pool" — no randomized subset.
    const finalDisplayCount = Number.isInteger(displayCount) && displayCount > 0 ? displayCount : 0;
    const finalPublishDate = normalizePublishDate(publishDate);
    const finalWebinarUrl = normalizeWebinarUrl(webinarUrl);
    const finalSheikhName = normalizeSheikhName(sheikhName);
    const finalWebinarHidden = webinarHidden === true;
    const finalQuestions = questions && questions.length ? questions : [
      { id: `q${Date.now()}`, text: '', options: ['', '', '', ''], correctIndex: 0 },
    ];

    await conn.query(
      'INSERT INTO quizzes (slug, category, title, active, display_count, publish_date, webinar_url, sheikh_name, webinar_hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [slug, finalCategory, finalTitle, finalActive, finalDisplayCount, finalPublishDate, finalWebinarUrl, finalSheikhName, finalWebinarHidden]
    );
    await replaceQuestions(conn, slug, finalQuestions);
    await conn.commit();

    const { imageUrl, webinarBannerUrl } = resolveBannerUrls(slug, req);
    res.json({ id: slug, slug, category: finalCategory, title: finalTitle, active: finalActive, displayCount: finalDisplayCount, publishDate: finalPublishDate, webinarUrl: finalWebinarUrl, sheikhName: finalSheikhName, webinarHidden: finalWebinarHidden, imageUrl, webinarBannerUrl, participantCount: 0, questions: finalQuestions });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// Admin only: update a quiz's content (title/category/questions) — slug is fixed
app.put('/api/quizzes/:slug', requireAdminAuth, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const existing = await fetchQuizRow(req.params.slug);
    if (!existing || !canAccessQuiz(req.adminUser, existing)) { conn.release(); return res.status(404).json({ error: 'Quiz not found' }); }

    const { title, category, questions, active, displayCount, publishDate, webinarUrl, sheikhName, webinarHidden } = req.body;
    const finalTitle = title ?? existing.title;
    const finalCategory = CATEGORIES.includes(category) ? category : existing.category;
    const finalActive = typeof active === 'boolean' ? active : existing.active;
    const finalDisplayCount = Number.isInteger(displayCount) ? displayCount : existing.displayCount;
    const finalPublishDate = publishDate !== undefined ? normalizePublishDate(publishDate) : existing.publishDate;
    const finalWebinarUrl = webinarUrl !== undefined ? normalizeWebinarUrl(webinarUrl) : existing.webinarUrl;
    const finalSheikhName = sheikhName !== undefined ? normalizeSheikhName(sheikhName) : existing.sheikhName;
    const finalWebinarHidden = typeof webinarHidden === 'boolean' ? webinarHidden : existing.webinarHidden;

    await conn.beginTransaction();
    await conn.query(
      'UPDATE quizzes SET title = ?, category = ?, active = ?, display_count = ?, publish_date = ?, webinar_url = ?, sheikh_name = ?, webinar_hidden = ? WHERE slug = ?',
      [finalTitle, finalCategory, finalActive, finalDisplayCount, finalPublishDate, finalWebinarUrl, finalSheikhName, finalWebinarHidden, existing.slug]
    );
    if (questions !== undefined) {
      await replaceQuestions(conn, existing.slug, questions);
    }
    await conn.commit();

    const finalQuestions = questions !== undefined ? questions : await fetchQuestions(existing.slug);
    const { imageUrl, webinarBannerUrl } = resolveBannerUrls(existing.slug, req);
    res.json({ id: existing.slug, slug: existing.slug, category: finalCategory, title: finalTitle, active: finalActive, displayCount: finalDisplayCount, publishDate: finalPublishDate, webinarUrl: finalWebinarUrl, sheikhName: finalSheikhName, webinarHidden: finalWebinarHidden, imageUrl, webinarBannerUrl, questions: finalQuestions });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// Admin only: clone a quiz — title, category, questions, display count,
// publish date, webinar URL, sheikh name, both banner images, and past
// responses — under a freshly-issued slug. Starts closed (active: false) so
// the copy can't go live before the admin has reviewed/edited it, even
// though its publish date carries over as-is. Copying responses means
// anyone whose email/mobile is in them will be blocked from "retaking"
// this new quiz if it's later opened, since already-attempted is checked
// per quiz_slug.
app.post('/api/quizzes/:slug/duplicate', requireAdminAuth, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const existing = await fetchQuizRow(req.params.slug);
    if (!existing || !canAccessQuiz(req.adminUser, existing)) return res.status(404).json({ error: 'Quiz not found' });
    const questions = await fetchQuestions(existing.slug);

    await conn.beginTransaction();
    const slug = await nextQuizSlug(conn);
    const title = `${existing.title} (Copy)`;

    await conn.query(
      'INSERT INTO quizzes (slug, category, title, active, display_count, publish_date, webinar_url, sheikh_name, webinar_hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [slug, existing.category, title, false, existing.displayCount, existing.publishDate, existing.webinarUrl, existing.sheikhName, existing.webinarHidden]
    );
    await replaceQuestions(conn, slug, questions);
    // legacy_id is globally unique (not scoped per quiz_slug like
    // questions.legacy_id is) — omitting it from the copied columns lets it
    // default to NULL, same as a genuinely new submission would get.
    const [submissionsResult] = await conn.query(
      `INSERT INTO submissions
         (quiz_slug, quiz_title, name, email, mobile, facebook_profile, follow_confirmed,
          answers, question_ids, score, total, duration_ms, timestamp, ip)
       SELECT ?, quiz_title, name, email, mobile, facebook_profile, follow_confirmed,
              answers, question_ids, score, total, duration_ms, timestamp, ip
       FROM submissions WHERE quiz_slug = ?`,
      [slug, existing.slug]
    );
    await conn.commit();

    const sourceImage = resolveImageFile(existing.slug, { fallbackDefault: true });
    if (sourceImage && !sourceImage.startsWith('default')) {
      fs.copyFileSync(path.join(PUBLIC_IMG_DIR, sourceImage), path.join(PUBLIC_IMG_DIR, `${slug}${path.extname(sourceImage)}`));
    }
    const sourceWebinarBanner = resolveImageFile(webinarBannerBase(existing.slug));
    if (sourceWebinarBanner) {
      fs.copyFileSync(path.join(PUBLIC_IMG_DIR, sourceWebinarBanner), path.join(PUBLIC_IMG_DIR, `${webinarBannerBase(slug)}${path.extname(sourceWebinarBanner)}`));
    }

    res.json({ id: slug, slug, category: existing.category, title, active: false, displayCount: existing.displayCount, publishDate: existing.publishDate, webinarUrl: existing.webinarUrl, sheikhName: existing.sheikhName, webinarHidden: existing.webinarHidden, participantCount: submissionsResult.affectedRows, questions });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// Validates/saves a base64 image data URL as public/img/<baseName>.<ext>,
// removing stale files with other extensions for the same base name so
// resolveImageFile() never picks up an old one. On invalid input, answers
// `res` itself (400) and returns null — shared by the Facebook-share banner
// and webinar-banner upload routes below.
function saveBannerImage(baseName, dataUrl, res) {
  const match = /^data:image\/(jpeg|jpg|png);base64,(.+)$/.exec(dataUrl || '');
  if (!match) { res.status(400).json({ error: 'Expected a base64 image data URL (jpeg or png).' }); return null; }

  const ext = match[1] === 'png' ? '.png' : '.jpg';
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 6 * 1024 * 1024) { res.status(400).json({ error: 'Image is too large (max 6MB).' }); return null; }

  fs.mkdirSync(PUBLIC_IMG_DIR, { recursive: true });
  for (const oldExt of IMAGE_EXTS) {
    if (oldExt !== ext) {
      const oldPath = path.join(PUBLIC_IMG_DIR, `${baseName}${oldExt}`);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
  }
  fs.writeFileSync(path.join(PUBLIC_IMG_DIR, `${baseName}${ext}`), buffer);
  return `${baseName}${ext}`;
}

// Admin only: upload/replace a quiz's banner image (used for Facebook share
// previews). Body: { dataUrl } where dataUrl is a base64 data URL (e.g.
// from a <canvas>.toDataURL()). Saved as public/img/<slug>.<ext>.
app.post('/api/quizzes/:slug/image', requireAdminAuth, async (req, res, next) => {
  try {
    const quiz = await fetchQuizRow(req.params.slug);
    if (!quiz || !canAccessQuiz(req.adminUser, quiz)) return res.status(404).json({ error: 'Quiz not found' });

    const filename = saveBannerImage(req.params.slug, req.body.dataUrl, res);
    if (filename) res.json({ ok: true, image: `${BASE_URL}img/${filename}` });
  } catch (err) { next(err); }
});

// Admin only: upload/replace a quiz's webinar banner — shown to takers
// alongside the webinar link and Sheikh name, distinct from the
// Facebook-share banner above. Saved as public/img/<slug>-webinar.<ext>.
app.post('/api/quizzes/:slug/webinar-banner', requireAdminAuth, async (req, res, next) => {
  try {
    const quiz = await fetchQuizRow(req.params.slug);
    if (!quiz || !canAccessQuiz(req.adminUser, quiz)) return res.status(404).json({ error: 'Quiz not found' });

    const filename = saveBannerImage(webinarBannerBase(req.params.slug), req.body.dataUrl, res);
    if (filename) res.json({ ok: true, image: `${BASE_URL}img/${filename}` });
  } catch (err) { next(err); }
});

// Admin only: delete a quiz (leaves its past submissions in place for
// records; its own questions rows are removed via ON DELETE CASCADE)
app.delete('/api/quizzes/:slug', requireAdminAuth, async (req, res, next) => {
  try {
    const quiz = await fetchQuizRow(req.params.slug);
    if (!quiz || !canAccessQuiz(req.adminUser, quiz)) return res.status(404).json({ error: 'Quiz not found' });
    await pool.query('DELETE FROM quizzes WHERE slug = ?', [req.params.slug]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Admin only: list responses, optionally filtered to one quiz via ?slug=.
// An 'admin'-role caller can't see responses for a closed quiz — with a
// slug, that's a 404 (same as fetching the quiz itself); without one, the
// unfiltered list is narrowed to only currently-active quizzes' responses.
app.get('/api/submissions', requireAdminAuth, async (req, res, next) => {
  try {
    const { slug } = req.query;
    if (slug) {
      const quiz = await fetchQuizRow(slug);
      if (!quiz || !canAccessQuiz(req.adminUser, quiz)) return res.status(404).json({ error: 'Quiz not found' });
      const [rows] = await pool.query('SELECT * FROM submissions WHERE quiz_slug = ? ORDER BY id ASC', [slug]);
      return res.json(rows.map(mapSubmissionRow));
    }
    const [rows] = req.adminUser.role === 'admin'
      ? await pool.query(
          `SELECT s.* FROM submissions s
           JOIN quizzes q ON q.slug = s.quiz_slug
           WHERE q.active = 1
           ORDER BY s.id ASC`
        )
      : await pool.query('SELECT * FROM submissions ORDER BY id ASC');
    res.json(rows.map(mapSubmissionRow));
  } catch (err) { next(err); }
});

// Public: taker submits their result. Score and duration are computed here
// from the server's own data and clock — answers/score/durationMs sent by
// the client are never trusted, only the raw list of chosen option indexes.
app.post('/api/submissions', async (req, res, next) => {
  try {
    const { quizSlug, attemptToken, answers, name, email, mobile, facebookProfile, followConfirmed } = req.body;

    const quiz = await fetchQuizRow(quizSlug);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    if (!quiz.active) {
      return res.status(403).json({ error: 'This quiz is closed.' });
    }
    if (await hasAttempted(quizSlug, email, mobile)) {
      return res.status(409).json({ error: 'already_attempted' });
    }

    const attempt = attemptToken ? activeAttempts.get(attemptToken) : null;
    if (!attempt || attempt.slug !== quizSlug) {
      return res.status(400).json({ error: 'invalid_or_expired_session' });
    }
    activeAttempts.delete(attemptToken); // one-time use — can't be replayed for a second, faster-looking submission

    const durationMs = Date.now() - attempt.startedAt;
    const safeAnswers = Array.isArray(answers) ? answers : [];
    // Grade against attempt.correctIndexes, not quiz.questions directly — those
    // indexes are relative to the shuffled option order this specific taker
    // was shown (see /start), which is the only order they ever saw.
    const total = attempt.correctIndexes.length;
    const score = attempt.correctIndexes.reduce((s, correctIdx, i) => s + (safeAnswers[i] === correctIdx ? 1 : 0), 0);

    // req.ip respects X-Forwarded-For because of app.set('trust proxy', true).
    const forwarded = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = forwarded || req.ip || req.socket.remoteAddress || null;

    const [result] = await pool.query(
      `INSERT INTO submissions
         (quiz_slug, quiz_title, name, email, mobile, facebook_profile, follow_confirmed,
          answers, question_ids, score, total, duration_ms, timestamp, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        quizSlug, quiz.title, (name || '').trim(), (email || '').trim(), (mobile || '').trim(), (facebookProfile || '').trim(), !!followConfirmed,
        JSON.stringify(safeAnswers), JSON.stringify(attempt.questionIds), score, total, durationMs, new Date(), ip,
      ]
    );

    // Correct answers are only ever revealed here, after the attempt is
    // locked in — the results-review screen needs them to show right/wrong.
    res.json({
      ok: true, id: result.insertId, score, total, durationMs,
      correctAnswers: attempt.correctIndexes,
    });
  } catch (err) { next(err); }
});

// Admin only: delete a single response
app.delete('/api/submissions/:id', requireAdminAuth, async (req, res, next) => {
  try {
    if (req.adminUser.role === 'admin') {
      const [[row]] = await pool.query('SELECT quiz_slug FROM submissions WHERE id = ?', [req.params.id]);
      if (row) {
        const quiz = await fetchQuizRow(row.quiz_slug);
        if (quiz && !canAccessQuiz(req.adminUser, quiz)) return res.status(404).json({ error: 'Not found' });
      }
    }
    await pool.query('DELETE FROM submissions WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Banner images: served straight from public/img so a new file dropped in
// there (named after a quiz's slug) shows up immediately, no rebuild needed.
app.use('/img', express.static(PUBLIC_IMG_DIR));

// Serve the built frontend (after `npm run build`)
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  app.get('*', async (req, res, next) => {
    try {
      const indexPath = path.join(distPath, 'index.html');
      const slug = req.path.replace(/^\/+/, '').split('/')[0];
      const [rows] = slug ? await pool.query('SELECT slug, title FROM quizzes WHERE slug = ?', [slug]) : [[]];
      const quiz = rows[0];

      if (!quiz) return res.sendFile(indexPath);

      const proto = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const origin = `${proto}://${host}`;
      const imageFile = resolveImageFile(quiz.slug, { fallbackDefault: true });

      const html = renderIndexWithMeta(fs.readFileSync(indexPath, 'utf-8'), {
        title: quiz.title,
        description: `Sagutin ang "${quiz.title}" quiz at subukan ang iyong kaalaman! #NewMuslimPH #NMAph`,
        url: `${origin}${BASE_URL}${quiz.slug}`,
        imageUrl: imageFile ? `${origin}${BASE_URL}img/${imageFile}` : null,
      });
      res.set('Content-Type', 'text/html');
      res.send(html);
    } catch (err) { next(err); }
  });
}

app.listen(PORT, () => console.log(`New Muslim Academy - Philippines quiz app running on port ${PORT}`));
