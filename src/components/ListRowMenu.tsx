import { useState, ReactNode } from 'react';

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface Props {
  items: MenuItem[];
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

/**
 * Wraps a clickable row/card and shows a context menu on right-click.
 * Children receive the row content; clicking the row fires `onClick`.
 */
export function ListRowMenu({ items, children, className, onClick }: Props) {
  const [open, setOpen] = useState<{ x: number; y: number } | null>(null);

  return (
    <>
      <div
        className={className}
        onClick={onClick}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen({ x: e.clientX, y: e.clientY });
        }}
      >
        {children}
      </div>
      {open && (
        <>
          <div className="ctx-backdrop" onClick={() => setOpen(null)} onContextMenu={(e) => { e.preventDefault(); setOpen(null); }} />
          <div className="ctx-menu" style={{ top: open.y, left: open.x }}>
            {items.map((item, i) => (
              <button key={i} className={`ctx-item ${item.danger ? 'danger' : ''}`}
                      onClick={() => { item.onClick(); setOpen(null); }}>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
