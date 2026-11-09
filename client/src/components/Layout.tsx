import { useEffect, useState } from 'react';
import { Link, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import { onKeyProblem, type ApiErrorCode } from '../lib/api';
import { desktop, openExternal } from '../lib/desktop';
import { loadDesktopSettings } from '../lib/settings';
import { Icon } from './Icon';
import { useToast } from './Toasts';
import { TopBar, focusSearch } from './TopBar';

/** Root route: scroll restoration + desktop menu commands + popup-blocked notices. */
export function Root() {
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    void loadDesktopSettings();
  }, []);

  useEffect(() => {
    if (!desktop) return;
    const offCommand = desktop.onCommand((cmd) => {
      switch (cmd.type) {
        case 'home':
          navigate('/');
          break;
        case 'search':
          if (window.location.pathname.startsWith('/watch')) navigate('/search');
          window.setTimeout(focusSearch, 30);
          break;
        case 'my-list':
          navigate('/my-list');
          break;
        case 'settings':
          navigate('/settings');
          break;
        case 'navigate':
          navigate(cmd.path);
          break;
      }
    });
    let lastToast = 0;
    const offBlocked = desktop.onBlocked((e) => {
      // Player pages show their own counter; elsewhere, a quiet toast (at most every few seconds).
      if (window.location.pathname.startsWith('/watch')) return;
      const now = Date.now();
      if (now - lastToast < 4000) return;
      lastToast = now;
      const what = e.kind === 'download' ? 'a download' : e.kind === 'redirect' ? 'a redirect' : e.kind === 'notification' ? 'a notification prompt' : 'a popup';
      toast.show(`Blocked ${what}${e.host ? ` from ${e.host}` : ''}`, { icon: 'shield' });
    });
    return () => {
      offCommand();
      offBlocked();
    };
  }, [navigate, toast]);

  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

function KeyBanner() {
  const [problem, setProblem] = useState<ApiErrorCode | null>(null);
  const location = useLocation();
  useEffect(() => onKeyProblem(setProblem), []);
  if (!problem || location.pathname === '/settings') return null;
  return (
    <div className="key-banner" role="alert">
      <Icon name="key" size={17} />
      <span>
        {problem === 'TMDB_KEY_MISSING'
          ? 'No TMDB key is set, so nothing can load.'
          : 'TMDB rejected your API key, so nothing can load right now.'}
      </span>
      <Link to="/settings#tmdb" className="btn btn--primary btn--sm">
        Update key
      </Link>
    </div>
  );
}

export function AppLayout() {
  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <TopBar />
      <KeyBanner />
      <main id="main" className="main">
        <Outlet />
      </main>
      <footer className="footer page-pad">
        <span>
          Metadata from{' '}
          <button type="button" className="link" onClick={() => openExternal('https://www.themoviedb.org/')}>
            TMDB
          </button>
          . This product uses the TMDB API but is not endorsed or certified by TMDB.
        </span>
        <span className="footer__shortcuts">
          <kbd>/</kbd> search · <kbd>Ctrl</kbd>+<kbd>,</kbd> settings · <kbd>Alt</kbd>+<kbd>←</kbd> back
        </span>
      </footer>
    </div>
  );
}
