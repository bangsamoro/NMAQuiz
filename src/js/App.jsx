import { useState, useEffect } from 'react';
import { QuizListPage } from './pages/QuizListPage.jsx';
import { QuizTakePage } from './pages/QuizTakePage.jsx';
import { AdminPage } from './pages/AdminPage.jsx';
import { apiGetSettings } from './api.js';
import { applyTheme, PALETTE } from './theme.js';

// Simple path-based routing: no router library needed.
// "" -> quiz list, "admin" -> admin dashboard, anything else -> that quiz's slug
export default function App() {
  // The saved theme (colors/fonts, see the admin Branding tab) is fetched
  // once here, at the very top of the tree, and applied via applyTheme()
  // *before* any page renders — that's what makes a branding change show
  // up consistently everywhere instead of flashing the built-in default
  // theme first. See theme.js for how the mutation itself works.
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGetSettings().then((settings) => {
      if (cancelled) return;
      if (settings) applyTheme(settings);
      setThemeReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  const relativePath = window.location.pathname
    .replace(import.meta.env.BASE_URL, '')
    .replace(/^\/+|\/+$/g, '');

  if (!themeReady) {
    // Matches the CSS-variable defaults in theme.css so this brief loading
    // frame doesn't itself flash a mismatched color before the real theme
    // (default or custom) takes over.
    return <div className="w-full min-h-screen" style={{ background: PALETTE.cream }} />;
  }

  if (relativePath === 'admin' || relativePath.startsWith('admin/')) return <AdminPage />;
  if (relativePath === '') return <QuizListPage />;
  return <QuizTakePage slug={relativePath.split('/')[0]} />;
}
