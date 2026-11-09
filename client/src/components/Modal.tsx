import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'video';
  hideTitle?: boolean;
}

export function Modal({ open, onClose, title, children, size = 'md', hideTitle = false }: Props) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.classList.remove('no-scroll');
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="modal__backdrop" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className={`modal__dialog modal__dialog--${size}`}>
        <header className={`modal__head${hideTitle ? ' modal__head--floating' : ''}`}>
          {!hideTitle && <h2 className="modal__title">{title}</h2>}
          <button type="button" ref={closeBtn} className="icon-btn" onClick={onClose} aria-label="Close" title="Close (Esc)">
            <Icon name="x" size={18} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function TrailerModal({
  trailer,
  title,
  onClose,
}: {
  trailer: { key: string; name: string } | null;
  title: string;
  onClose: () => void;
}) {
  return (
    <Modal open={trailer != null} onClose={onClose} title={`${title} — trailer`} size="video" hideTitle>
      {trailer && (
        <div className="video-frame">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.key)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
            title={trailer.name || `${title} trailer`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
    </Modal>
  );
}

export function ConfirmModal({
  open,
  title,
  text,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="modal__text">{text}</p>
      <div className="modal__actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
