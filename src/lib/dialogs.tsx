import { createRoot, Root } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────
// Imperative themed replacements for window.prompt and window.confirm.
// A single hidden mount point at the document root renders one dialog at
// a time. Callers `await bgPrompt(...)` / `await bgConfirm(...)`.
// ─────────────────────────────────────────────────────────────────────

let host: HTMLDivElement | null = null;
let root: Root | null = null;
function ensureHost(): Root {
  if (root) return root;
  host = document.createElement('div');
  host.id = 'bg-dialog-host';
  document.body.appendChild(host);
  root = createRoot(host);
  return root;
}

interface PromptOpts {
  title: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  multiline?: boolean;
}

interface ConfirmOpts {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function bgPrompt(opts: PromptOpts): Promise<string | null> {
  return new Promise((resolve) => {
    const r = ensureHost();
    r.render(
      <PromptDialog
        opts={opts}
        onClose={(val) => {
          r.render(null);
          resolve(val);
        }}
      />,
    );
  });
}

export function bgConfirm(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    const r = ensureHost();
    r.render(
      <ConfirmDialog
        opts={opts}
        onClose={(val) => {
          r.render(null);
          resolve(val);
        }}
      />,
    );
  });
}

function PromptDialog({ opts, onClose }: { opts: PromptOpts; onClose: (v: string | null) => void }) {
  const [val, setVal] = useState(opts.defaultValue ?? '');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      if (inputRef.current instanceof HTMLInputElement) inputRef.current.select();
    }, 10);
    return () => window.clearTimeout(t);
  }, []);

  const submit = () => onClose(val.trim() ? val.trim() : null);
  const cancel = () => onClose(null);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    if (e.key === 'Enter' && !opts.multiline) { e.preventDefault(); submit(); }
    if (e.key === 'Enter' && opts.multiline && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
  };

  return (
    <div className="search-overlay" onClick={cancel}>
      <div className="bg-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="bg-dialog-title">{opts.title}</div>
        {opts.multiline ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            className="bg-dialog-input multiline"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={onKey}
            placeholder={opts.placeholder}
            rows={4}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            className="bg-dialog-input"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={onKey}
            placeholder={opts.placeholder}
          />
        )}
        <div className="bg-dialog-actions">
          <button className="ghost-btn" onClick={cancel}>Cancel</button>
          <button className="primary-btn" onClick={submit}>{opts.confirmLabel ?? 'OK'}</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({ opts, onClose }: { opts: ConfirmOpts; onClose: (v: boolean) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false);
      if (e.key === 'Enter') onClose(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="search-overlay" onClick={() => onClose(false)}>
      <div className="bg-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="bg-dialog-title">{opts.title}</div>
        {opts.message && <div className="bg-dialog-message">{opts.message}</div>}
        <div className="bg-dialog-actions">
          <button className="ghost-btn" onClick={() => onClose(false)} autoFocus>{opts.cancelLabel ?? 'Cancel'}</button>
          <button className={opts.danger ? 'primary-btn is-danger' : 'primary-btn'} onClick={() => onClose(true)}>
            {opts.confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
