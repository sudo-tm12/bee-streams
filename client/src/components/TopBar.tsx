import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router';
import { rememberSearch } from '../lib/library';
import { Icon } from './Icon';

export const SEARCH_INPUT_ID = 'global-search';

export function focusSearch() {
  const el = document.getElementById(SEARCH_INPUT_ID) as HTMLInputElement | null;
  el?.focus();
  el?.select();
}

export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const onSearchPage = location.pathname === '/search';
  const urlQuery = onSearchPage ? params.get('q') ?? '' : '';
  const [value, setValue] = useState(urlQuery);
  const [scrolled, setScrolled] = useState(false);
  const debounce = useRef<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Keep the box in sync when the URL changes (back/forward, recent-search clicks).
  useEffect(() => {
    if (document.activeElement !== input.current || !onSearchPage) setValue(urlQuery);
  }, [urlQuery, onSearchPage]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (typing) return;
      if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function pushQuery(q: string, immediate = false) {
    if (debounce.current) window.clearTimeout(debounce.current);
    const run = () => {
      const trimmed = q.trim();
      const target = trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : '/search';
      navigate(target, { replace: onSearchPage });
    };
    if (immediate) run();
    else debounce.current = window.setTimeout(run, 280);
  }

  return (
    <header className={`topbar${scrolled ? ' is-scrolled' : ''}`}>
      <Link to="/" className="brand" aria-label="The Bee Streams — home">
        <span className="brand__badge">BEE</span>
        <span className="brand__word">Streams</span>
      </Link>

      <nav className="topbar__nav" aria-label="Main">
        <NavLink to="/" end>
          Home
        </NavLink>
        <NavLink to="/movies">Movies</NavLink>
        <NavLink to="/tv">TV Shows</NavLink>
        <NavLink to="/my-list">My List</NavLink>
      </nav>

      <form
        className="search-box"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          rememberSearch(value);
          pushQuery(value, true);
        }}
      >
        <Icon name="search" size={17} className="search-box__icon" />
        <input
          id={SEARCH_INPUT_ID}
          ref={input}
          type="search"
          value={value}
          placeholder="Search movies, shows, people"
          aria-label="Search"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setValue(e.target.value);
            pushQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (value) {
                setValue('');
                pushQuery('', true);
              } else {
                input.current?.blur();
              }
            }
          }}
        />
        {value ? (
          <button
            type="button"
            className="search-box__clear"
            aria-label="Clear search"
            onClick={() => {
              setValue('');
              pushQuery('', true);
              input.current?.focus();
            }}
          >
            <Icon name="x" size={15} />
          </button>
        ) : (
          <kbd className="search-box__kbd" aria-hidden="true">
            /
          </kbd>
        )}
      </form>

      <NavLink to="/settings" className="icon-btn topbar__settings" aria-label="Settings" title="Settings (Ctrl+,)">
        <Icon name="settings" size={19} />
      </NavLink>
    </header>
  );
}
