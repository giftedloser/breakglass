import { useEffect, useMemo, useRef, useState } from 'react';
import { AppWindow, FileText, FolderClosed, Phone, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db } from '../lib/invoke';
import { SearchHit } from '../types';
import { topLabel } from '../lib/categories';

const searchTokens = (value: string) =>
  value.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

const wordStartsWith = (value: string, token: string) =>
  searchTokens(value).some((word) => word.startsWith(token));

const isSubsequence = (word: string, token: string) => {
  if (token.length < 4) return false;
  let i = 0;
  for (const ch of word) {
    if (ch === token[i]) i += 1;
    if (i === token.length) return true;
  }
  return false;
};

const fuzzyTokenMatch = (value: string, token: string) =>
  searchTokens(value).some((word) => word.includes(token) || isSubsequence(word, token));

const allTokensMatch = (value: string, tokens: string[]) => {
  const lower = normalize(value);
  return tokens.length > 0 && tokens.every((token) => lower.includes(token) || fuzzyTokenMatch(lower, token));
};

const rankHit = (hit: SearchHit, query: string) => {
  const q = normalize(query);
  const tokens = searchTokens(query);
  const title = normalize(hit.title);
  const snippet = normalize(hit.snippet);
  const category = normalize(topLabel(hit.top_category));
  const haystack = `${title} ${snippet} ${category}`;
  let score = 0;

  if (title === q) score += 1000;
  else if (title.startsWith(q)) score += 760;
  else if (tokens.some((token) => wordStartsWith(title, token))) score += 560;
  else if (title.includes(q)) score += 460;

  if (allTokensMatch(title, tokens)) score += 300;
  if (snippet.includes(q)) score += 150;
  if (allTokensMatch(haystack, tokens)) score += 120;
  if (category.includes(q)) score += 60;
  if (hit.is_favorite) score += 25;

  const updated = Date.parse(hit.updated_at);
  if (!Number.isNaN(updated)) {
    const daysOld = Math.max(0, (Date.now() - updated) / 86_400_000);
    score += Math.max(0, 20 - Math.min(20, daysOld));
  }

  return score;
};

export function SearchModal() {
  const { dispatch, selectEntry, selectContact, selectFolder, selectApp } = useApp();
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
          const ranked = res
            .map((hit, index) => ({ hit, index, score: rankHit(hit, q) }))
            .sort((a, b) => b.score - a.score || a.index - b.index)
            .map(({ hit }) => hit);
          setHits(ranked);
          setActive(0);
        }
      } catch { /* ignore */ }
    }, 130);
    return () => { alive = false; window.clearTimeout(t); };
  }, [q]);

  const grouped = useMemo(() => {
    const out: Record<SearchHit['kind'], SearchHit[]> = { folder: [], entry: [], app: [], contact: [] };
    for (const h of hits) out[h.kind].push(h);
    return out;
  }, [hits]);

  const flat = useMemo(() => [...grouped.folder, ...grouped.entry, ...grouped.app, ...grouped.contact], [grouped]);

  const close = () => dispatch({ type: 'TOGGLE_SEARCH', value: false });

  const choose = (h: SearchHit) => {
    if (h.kind === 'folder') selectFolder(h.id);
    if (h.kind === 'entry') void selectEntry(h.id);
    if (h.kind === 'app') void selectApp(h.id);
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
    const Icon = h.kind === 'folder' ? FolderClosed : h.kind === 'contact' ? Phone : h.kind === 'app' ? AppWindow : FileText;
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
          <input ref={inputRef} value={q} placeholder="Search folders, entries, apps, contacts..." onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />
          <button className="search-esc" onClick={close}>esc</button>
        </div>
        <div className="search-results">
          {!q.trim() && <div className="empty">Start typing.</div>}
          {q.trim() && hits.length === 0 && <div className="empty">No matches.</div>}
          {grouped.folder.length > 0 && <><div className="search-section">Folders</div><ul>{grouped.folder.map(renderHit)}</ul></>}
          {grouped.entry.length > 0 && <><div className="search-section">Entries</div><ul>{grouped.entry.map(renderHit)}</ul></>}
          {grouped.app.length > 0 && <><div className="search-section">Apps</div><ul>{grouped.app.map(renderHit)}</ul></>}
          {grouped.contact.length > 0 && <><div className="search-section">Contacts</div><ul>{grouped.contact.map(renderHit)}</ul></>}
        </div>
      </div>
    </div>
  );
}
