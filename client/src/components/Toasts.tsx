import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface Toast {
  id: number;
  message: string;
  icon?: IconName;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show: (message: string, opts?: { icon?: IconName; action?: Toast['action']; duration?: number }) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => undefined });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const show = useCallback<ToastApi['show']>(
    (message, opts = {}) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { id, message, icon: opts.icon, action: opts.action }]);
      window.setTimeout(() => dismiss(id), opts.duration ?? 3200);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.icon && <Icon name={t.icon} size={16} className="toast__icon" />}
            <span className="toast__msg">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
