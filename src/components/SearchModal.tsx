import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, FolderClosed, Phone, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db } from '../lib/invoke';
import { SearchHit } from '../types';
import { topLabel } from '../lib/categories';

export function SearchModal() {
  const { dispatch, selectEntry, selectContact, selectFolder } = useApp();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    let alive = true;
    const t = window.setTimeout(async () => {
      try {
        const res = await db.searchAll(q);
        if (alive) {
          const lower = q.toLowerCase();
          res.sort((a, b) => {
            const ord = (h: SearchHit) => h.kind === 'folder' ? 0 : h.kind === 'entry' ? 1 : 2;
            if (ord(a) !== ord(b)) return ord(a) - ord(b);
            const ax = a.title.toLowerCase() === lower ? 0 : 1;
            const bx = b.title.toLowerCase() === lower ? 0 : 1;
            return ax - bx;
          });
          setHits(res);
          setActive(0);
        }
      } catch { /* ignore */ }
    }, 130);
    return () => { alive = false; window.clearTimeout(t); };
  }, [q]);

  const grouped = useMemo(() => {
    const out: Record<string, SearchHit[]> = { folder: [], entry: [], contact: [] };
    for (const h of hits) out[h.kind].push(h);
    return out;
  }, [hits]);

  const flat = useMemo(() => [...grouped.folder, ...grouped.entry, ...grouped.contact], [grouped]);

  const close = () => dispatch({ type: 'TOGGLE_SEARCH', value: false });

  const choose = (h: SearchHit) => {
    if (h.kind === 'folder') selectFolder(h.id);
    if (h.kind === 'entry') void selectEntry(h.id);
    if (h.kind === 'contact') void selectContact(h.id);
    close();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === 'Enter')     { e.preventDefault(); if (flat[active]) choose(flat[active]); }
  };

  const renderHit = (h: SearchHit) => {
    const isActive = flat[active]?.kind === h.kind && flat[active]?.id === h.id;
    const Icon = h.kind === 'folder' ? FolderClosed : h.kind === 'contact' ? Phone : FileText;
    return (
      <li key={`${h.kind}-${h.id}`} className={`search-hit ${isActive ? 'is-active' : ''}`}
          onClick={() => choose(h)} onMouseEnter={() => setActive(flat.indexOf(h))}>
        <Icon size={13} />
        <div className="hit-body">
          <div className="hit-title">{h.title}</div>
          {h.snippet && <div className="hit-snippet">{h.snippet}</div>}
        </div>
        <span className="hit-tag">{topLabel(h.top_category)}</span>
      </li>
    );
  };

  return (
    <div className="search-overlay" onClick={close}>
      <div className="search-panel" onClick={(e) => e.stopPropagation()}>
        <div className="search-input-row">
          <Search size={14} />
          <input ref={inputRef} value={q} placeholder="Search folders, entries, contacts..." onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />
          <button className="search-esc" onClick={close}>esc</button>
        </div>
        <div className="search-results">
          {!q.trim() && <div className="empty">Start typing.</div>}
          {q.trim() && hits.length === 0 && <div className="empty">No matches.</div>}
          {grouped.folder.length > 0 && <><div className="search-section">Folders</div><ul>{grouped.folder.map(renderHit)}</ul></>}
          {grouped.entry.length > 0 && <><div className="search-section">Entries</div><ul>{grouped.entry.map(renderHit)}</ul></>}
          {grouped.contact.length > 0 && <><div className="search-section">Contacts</div><ul>{grouped.contact.map(renderHit)}</ul></>}
        </div>
      </div>
    </div>
  );
}
