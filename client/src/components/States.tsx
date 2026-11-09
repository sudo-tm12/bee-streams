import { Link } from 'react-router';
import { ApiError, friendlyError, isKeyProblem } from '../lib/api';
import { Icon } from './Icon';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  compact = false,
  title,
}: {
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
  title?: string;
}) {
  const keyProblem = isKeyProblem(error);
  const notFound = error instanceof ApiError && error.code === 'NOT_FOUND';
  const heading =
    title ??
    (keyProblem
      ? 'TMDB key needs attention'
      : notFound
        ? 'Not found'
        : error instanceof ApiError && error.code === 'TMDB_UNREACHABLE'
          ? 'You seem to be offline'
          : 'Couldn’t load this');

  return (
    <div className={`state state--error${compact ? ' state--compact' : ''}`} role="alert">
      <Icon name={keyProblem ? 'key' : 'alert'} size={compact ? 18 : 26} className="state__icon" />
      <div className="state__body">
        <p className="state__title">{heading}</p>
        <p className="state__text">{friendlyError(error)}</p>
        <div className="state__actions">
          {keyProblem ? (
            <Link to="/settings#tmdb" className="btn btn--primary btn--sm">
              <Icon name="key" size={15} /> Update API key
            </Link>
          ) : (
            onRetry &&
            !notFound && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={onRetry}>
                <Icon name="refresh" size={15} /> Try again
              </button>
            )
          )}
          {notFound && (
            <Link to="/" className="btn btn--ghost btn--sm">
              Go home
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, text, children }: { icon: Parameters<typeof Icon>[0]['name']; title: string; text?: string; children?: React.ReactNode }) {
  return (
    <div className="state state--empty">
      <Icon name={icon} size={28} className="state__icon" />
      <div className="state__body">
        <p className="state__title">{title}</p>
        {text && <p className="state__text">{text}</p>}
        {children && <div className="state__actions">{children}</div>}
      </div>
    </div>
  );
}
