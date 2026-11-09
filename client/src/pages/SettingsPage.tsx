import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { Icon } from '../components/Icon';
import { ConfirmModal } from '../components/Modal';
import { useToast } from '../components/Toasts';
import { clearClientCache, setKeyProblem } from '../lib/api';
import { desktop, openExternal, type KeyCheckResult, type KeyKind } from '../lib/desktop';
import {
  autoplayStore,
  clearContinue,
  clearMyList,
  useAutoplay,
  useContinueWatching,
  useMyList,
} from '../lib/library';
import { REGIONS, keyManager, setRegion, useAppSettings, useRegion } from '../lib/settings';

/** "this PC" in the desktop app, "this browser" on the web. */
const HERE = desktop ? 'this PC' : 'this browser';

type Status = 'checking' | 'ok' | 'invalid' | 'offline' | 'missing' | 'unknown';

const KIND_LABEL: Record<KeyKind, string> = {
  'v4-token': 'API Read Access Token',
  'v3-key': 'API Key (v3)',
  none: 'Not set',
};

function cleanKey(raw: string) {
  return raw.trim().replace(/^["']|["']$/g, '').replace(/^bearer\s+/i, '').replace(/\s+/g, '');
}

function describeKey(value: string): { text: string; ok: boolean } {
  if (!value) return { text: '', ok: false };
  if (value.startsWith('eyJ') && value.split('.').length === 3) return { text: 'Looks like an API Read Access Token', ok: true };
  if (/^[a-f0-9]{32}$/i.test(value)) return { text: 'Looks like an API Key (v3)', ok: true };
  if (value.length < 20) return { text: 'Too short — make sure you copied the whole key', ok: false };
  return { text: 'Unrecognised format — we’ll check it with TMDB', ok: false };
}

function statusFrom(result: KeyCheckResult): Status {
  if (result.ok) return 'ok';
  if (result.code === 'TMDB_KEY_INVALID') return 'invalid';
  if (result.code === 'TMDB_KEY_MISSING') return 'missing';
  if (result.code === 'TMDB_UNREACHABLE' || result.code === 'TMDB_RATE_LIMITED') return 'offline';
  return 'unknown';
}

const STATUS_COPY: Record<Status, { label: string; tone: 'ok' | 'bad' | 'warn' | 'muted' }> = {
  checking: { label: 'Checking…', tone: 'muted' },
  ok: { label: 'Connected', tone: 'ok' },
  invalid: { label: 'Key rejected by TMDB', tone: 'bad' },
  missing: { label: 'No key set', tone: 'bad' },
  offline: { label: 'Can’t reach TMDB right now', tone: 'warn' },
  unknown: { label: 'Couldn’t check', tone: 'warn' },
};

function TmdbSection() {
  const { settings, setSettings } = useAppSettings();
  const toast = useToast();
  const [status, setStatus] = useState<Status>('checking');
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<KeyCheckResult | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function check() {
    setStatus('checking');
    const r = await keyManager.testKey().catch(() => ({ ok: false, code: 'UNKNOWN' }) as KeyCheckResult);
    const s = statusFrom(r);
    setStatus(s);
    if (s === 'invalid' || s === 'missing') setEditing(true);
  }

  useEffect(() => {
    void check();
  }, []);

  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  async function save(skipCheck = false) {
    const key = cleanKey(value);
    if (!key) {
      setResult({ ok: false, message: 'Paste your TMDB key first.' });
      input.current?.focus();
      return;
    }
    setSaving(true);
    setResult(null);
    try {
      const r = await keyManager.saveKey(key, { skipCheck });
      if (r.ok) {
        if (r.settings) setSettings(r.settings);
        setStatus(skipCheck ? 'unknown' : 'ok');
        setEditing(false);
        setValue('');
        setReveal(false);
        clearClientCache();
        setKeyProblem(null);
        toast.show(skipCheck ? 'Key saved (not checked yet)' : 'TMDB key saved and working', { icon: 'check' });
        if (skipCheck) void check();
      } else {
        setResult(r);
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Couldn’t save the key.' });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    await keyManager.removeKey();
    // The desktop app returns to its setup screen by itself; on the web we stay here.
    if (desktop) return;
    clearClientCache();
    setKeyProblem('TMDB_KEY_MISSING');
    setSettings(await keyManager.getSettings());
    setStatus('missing');
    setEditing(true);
    toast.show('TMDB key removed from this browser', { icon: 'trash' });
  }

  const tone = STATUS_COPY[status];
  const detected = describeKey(cleanKey(value));
  const canSaveAnyway = result && (result.code === 'TMDB_UNREACHABLE' || result.code === 'TMDB_RATE_LIMITED');

  return (
    <>
      <div className="key-card">
        <div className="key-card__row">
          <span className={`status-dot status-dot--${tone.tone}`} aria-hidden="true" />
          <div className="key-card__main">
            <p className="key-card__status">{tone.label}</p>
            <p className="key-card__meta">
              {settings?.hasKey ? (
                <>
                  <code>{settings.keyHint}</code> · {KIND_LABEL[settings.keyKind]}
                  {settings.keyEncrypted && (
                    <span className="badge" title="Stored with Windows data protection">
                      <Icon name="shield" size={12} /> Encrypted
                    </span>
                  )}
                </>
              ) : (
                'Add a key to load posters, details and episodes.'
              )}
            </p>
          </div>
          <div className="key-card__actions">
            {!editing && (
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing(true)}>
                <Icon name="key" size={15} /> {settings?.hasKey ? 'Change key' : 'Add key'}
              </button>
            )}
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void check()} disabled={status === 'checking'}>
              <Icon name="refresh" size={15} /> Check
            </button>
          </div>
        </div>

        {editing && (
          <form
            className="key-editor"
            onSubmit={(e) => {
              e.preventDefault();
              void save(false);
            }}
          >
            <label htmlFor="tmdb-key" className="field-label">
              New TMDB key
            </label>
            <div className="field">
              <input
                id="tmdb-key"
                ref={input}
                className="input input--mono"
                type={reveal ? 'text' : 'password'}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setResult(null);
                }}
                placeholder="Paste your API Key or API Read Access Token"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={result && !result.ok ? true : undefined}
                aria-describedby="tmdb-key-help"
                disabled={saving}
              />
              <button
                type="button"
                className="field__btn"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? 'Hide key' : 'Show key'}
                title={reveal ? 'Hide key' : 'Show key'}
              >
                <Icon name={reveal ? 'eyeOff' : 'eye'} size={17} />
              </button>
            </div>
            <p id="tmdb-key-help" className={`field-help${detected.ok ? ' is-ok' : ''}`}>
              {detected.text ? (
                <>
                  {detected.ok && <Icon name="check" size={13} />} {detected.text}
                </>
              ) : (
                <>
                  Find it at{' '}
                  <button type="button" className="link" onClick={() => openExternal('https://www.themoviedb.org/settings/api')}>
                    themoviedb.org → Settings → API <Icon name="external" size={12} />
                  </button>
                  . Either the API Key or the Read Access Token works.
                </>
              )}
            </p>
            {result && !result.ok && (
              <p className="field-error" role="alert">
                <Icon name="alert" size={14} /> {result.message ?? 'That key didn’t work.'}
              </p>
            )}
            <div className="key-editor__actions">
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? (
                  <>
                    <span className="spinner spinner--sm" aria-hidden="true" /> Checking with TMDB…
                  </>
                ) : (
                  'Save key'
                )}
              </button>
              {canSaveAnyway && (
                <button type="button" className="btn btn--ghost" onClick={() => void save(true)} disabled={saving}>
                  Save without checking
                </button>
              )}
              {settings?.hasKey && (
                <button
                  type="button"
                  className="btn btn--text"
                  onClick={() => {
                    setEditing(false);
                    setValue('');
                    setResult(null);
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      {settings?.hasKey && (
        <button type="button" className="btn btn--text btn--sm btn--danger-text" onClick={() => setConfirmRemove(true)}>
          <Icon name="trash" size={14} /> Remove key from {HERE}
        </button>
      )}

      <ConfirmModal
        open={confirmRemove}
        title="Remove your TMDB key?"
        text={
          desktop
            ? 'The app will go back to the setup screen and nothing will load until you add a key again.'
            : 'Nothing will load in this browser until you add a key again.'
        }
        confirmLabel="Remove key"
        danger
        onConfirm={() => void remove()}
        onClose={() => setConfirmRemove(false)}
      />
    </>
  );
}

function WebProtectionSection() {
  return (
    <ul className="protect-list">
        <li>
          <Icon name="check" size={16} className="protect-list__icon" />
          <div>
            <p className="protect-list__title">Leaving the player</p>
            <p className="protect-list__text">
              If the player tries to send this tab to another website, your browser asks before leaving.
            </p>
          </div>
        </li>
        <li>
          <Icon name="alert" size={16} className="protect-list__icon" />
          <div>
            <p className="protect-list__title">Popups & downloads</p>
            <p className="protect-list__text">
              In a browser these are up to your browser’s own blocker, so some player popups can get through. An ad
              blocker such as uBlock Origin helps — or use the desktop app, which blocks them all.
            </p>
          </div>
        </li>
    </ul>
  );
}

function ProtectionSection() {
  const { settings } = useAppSettings();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (settings) setCount(settings.blockedTotal);
  }, [settings]);
  useEffect(() => {
    if (!desktop) return;
    return desktop.onBlocked((e) => setCount(e.total));
  }, []);

  const items: Array<[string, string]> = [
    ['Popups & pop-unders', 'New windows and tabs opened by players are blocked — they never reach your browser.'],
    ['Redirects', 'Nothing can navigate the app away to another website.'],
    ['Downloads', 'Files a page tries to download (fake “player updates” etc.) are cancelled.'],
    ['Permission prompts', 'Notification, camera, microphone, location and device requests are denied.'],
  ];

  return (
    <>
      <ul className="protect-list">
        {items.map(([title, text]) => (
          <li key={title}>
            <Icon name="check" size={16} className="protect-list__icon" />
            <div>
              <p className="protect-list__title">{title}</p>
              <p className="protect-list__text">{text}</p>
            </div>
          </li>
        ))}
      </ul>
      {desktop && (
        <p className="muted small">
          {count == null ? '…' : count === 0 ? 'Nothing blocked yet this session.' : `${count.toLocaleString()} blocked since the app started.`}
        </p>
      )}
    </>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="setting-row">
      <span>
        <span className="setting-row__label">{label}</span>
        {hint && <span className="setting-row__hint">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`toggle toggle--bare${checked ? ' is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle__track" aria-hidden="true">
          <span className="toggle__thumb" />
        </span>
        <span className="sr-only">{label}</span>
      </button>
    </label>
  );
}

const DESKTOP_ONLY_SHORTCUTS = new Set(['Ctrl + ,', 'Ctrl + L', 'M']);

const SHORTCUTS: Array<[string, string]> = (
  [
    ['/', 'Search'],
    ['Ctrl + K', 'Search (from anywhere)'],
    ['Ctrl + ,', 'Settings'],
    ['Ctrl + L', 'My List'],
    ['Alt + ← / →', 'Back / forward'],
    ['F', 'Player: fullscreen'],
    ['M', 'Player: mini player'],
    ['N / B', 'Player: next / previous episode'],
    ['E', 'Player: episode list'],
    ['R', 'Player: reload'],
    ['Esc', 'Player: back to details'],
    ['Ctrl + = / −', 'Zoom in / out'],
  ] satisfies Array<[string, string]>
).filter(([keys]) => desktop || !DESKTOP_ONLY_SHORTCUTS.has(keys));

export function SettingsPage() {
  const autoplay = useAutoplay();
  const region = useRegion();
  const list = useMyList();
  const history = useContinueWatching();
  const toast = useToast();
  const location = useLocation();
  const { settings } = useAppSettings();
  const [confirm, setConfirm] = useState<'list' | 'history' | null>(null);
  const regions = REGIONS.some(([c]) => c === region) ? REGIONS : [[region, region] as [string, string], ...REGIONS];

  useEffect(() => {
    document.title = 'Settings · The Bee Streams';
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView({ block: 'start' });
    return () => {
      document.title = 'The Bee Streams';
    };
  }, [location.hash]);

  return (
    <div className="page page--settings page--padded">
      <header className="page-head page-pad">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Everything here is saved {desktop ? 'on' : 'in'} {HERE}.</p>
        </div>
      </header>

      <div className="settings page-pad">
        <section className="settings__card" id="tmdb" aria-labelledby="s-tmdb">
          <header className="settings__head">
            <Icon name="key" size={20} />
            <div>
              <h2 id="s-tmdb">TMDB connection</h2>
              <p>Posters, details, cast and episode lists come from TMDB using your own free key.</p>
            </div>
          </header>
          <TmdbSection />
        </section>

        <section className="settings__card" aria-labelledby="s-play">
          <header className="settings__head">
            <Icon name="play" size={20} />
            <div>
              <h2 id="s-play">Playback</h2>
              <p>How the player behaves.</p>
            </div>
          </header>
          <Toggle
            checked={autoplay}
            onChange={(v) => autoplayStore.set(v)}
            label="Autoplay next episode"
            hint="When an episode ends, start the next one after a 10-second countdown you can cancel."
          />
        </section>

        <section className="settings__card" aria-labelledby="s-region">
          <header className="settings__head">
            <Icon name="globe" size={20} />
            <div>
              <h2 id="s-region">Region</h2>
              <p>Used for “Where to watch” and age ratings.</p>
            </div>
          </header>
          <label className="setting-row">
            <span className="setting-row__label">Country</span>
            <span className="select">
              <select
                value={region}
                onChange={(e) => {
                  void setRegion(e.target.value);
                  clearClientCache();
                  toast.show('Region updated', { icon: 'globe' });
                }}
              >
                {regions.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={15} />
            </span>
          </label>
        </section>

        <section className="settings__card" aria-labelledby="s-protect">
          <header className="settings__head">
            <Icon name="shield" size={20} />
            <div>
              <h2 id="s-protect">Protection</h2>
              <p>
                {desktop
                  ? 'Always on. Keeps embedded players from doing anything outside the player box.'
                  : 'What the web version can and can’t stop embedded players from doing.'}
              </p>
            </div>
          </header>
          {desktop ? <ProtectionSection /> : <WebProtectionSection />}
        </section>

        <section className="settings__card" aria-labelledby="s-data">
          <header className="settings__head">
            <Icon name="database" size={20} />
            <div>
              <h2 id="s-data">Your data</h2>
              <p>Your list and history never leave {HERE}.</p>
            </div>
          </header>
          <div className="setting-row">
            <span>
              <span className="setting-row__label">My List</span>
              <span className="setting-row__hint">{list.length} saved titles</span>
            </span>
            <button type="button" className="btn btn--ghost btn--sm" disabled={list.length === 0} onClick={() => setConfirm('list')}>
              Clear
            </button>
          </div>
          <div className="setting-row">
            <span>
              <span className="setting-row__label">Watch history</span>
              <span className="setting-row__hint">{history.length} titles in Continue Watching</span>
            </span>
            <button type="button" className="btn btn--ghost btn--sm" disabled={history.length === 0} onClick={() => setConfirm('history')}>
              Clear
            </button>
          </div>
          <div className="setting-row">
            <span>
              <span className="setting-row__label">Cached data</span>
              <span className="setting-row__hint">Re-download posters and details if something looks out of date.</span>
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={async () => {
                clearClientCache();
                await desktop?.clearCache();
                toast.show('Cache cleared', { icon: 'check' });
              }}
            >
              Clear cache
            </button>
          </div>
        </section>

        <section className="settings__card" aria-labelledby="s-keys">
          <header className="settings__head">
            <Icon name="keyboard" size={20} />
            <div>
              <h2 id="s-keys">Keyboard shortcuts</h2>
            </div>
          </header>
          <dl className="shortcuts">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k}>
                <dt>
                  {k.split(' ').map((part, i) =>
                    part === '+' || part === '/' ? (
                      <span key={i} className="shortcuts__sep">{part}</span>
                    ) : (
                      <kbd key={i}>{part}</kbd>
                    ),
                  )}
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="settings__card settings__card--about" aria-labelledby="s-about">
          <header className="settings__head">
            <Icon name="info" size={20} />
            <div>
              <h2 id="s-about">About</h2>
              <p>
                The Bee Streams {settings?.version ? `v${settings.version}` : ''}. Metadata from{' '}
                <button type="button" className="link" onClick={() => openExternal('https://www.themoviedb.org/')}>
                  TMDB
                </button>
                ; this product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability by
                JustWatch.
              </p>
            </div>
          </header>
        </section>
      </div>

      <ConfirmModal
        open={confirm != null}
        title={confirm === 'list' ? 'Clear My List?' : 'Clear watch history?'}
        text={confirm === 'list' ? `This removes all ${list.length} saved titles.` : 'This empties Continue Watching.'}
        confirmLabel="Clear"
        danger
        onConfirm={() => (confirm === 'list' ? clearMyList() : clearContinue())}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
