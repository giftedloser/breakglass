import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../lib/invoke';
import { getCategoryMeta } from '../lib/categories';
import { formatRelativeDate } from '../lib/utils';
import { SearchResult } from '../types';
import { useApp } from '../context/AppContext';

export function SearchModal() {
  const { dispatch } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const handle = window.setTimeout(async () => {
      if (!query.trim()) return setResults([]);
      try {
        setLoading(true);
        setResults(await db.searchEntries(query));
        setSelected(0);
      } catch (error) { toast.error(String(error)); } finally { setLoading(false); }
    }, 150);
    return () => window.clearTimeout(handle);
  }, [query]);

  const grouped = useMemo(() => results.reduce<Record<string, SearchResult[]>>((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, {}), [results]);
  const flat = Object.values(grouped).flat();
  const open = (result: SearchResult) => {
    dispatch({ type: 'SET_VIEW', view: result.category });
    dispatch({ type: 'SELECT_ENTRY', id: result.id });
    dispatch({ type: 'TOGGLE_SEARCH', value: false });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/45 p-6 backdrop-blur-sm" onKeyDown={(e) => {
      if (e.key === 'Escape') dispatch({ type: 'TOGGLE_SEARCH', value: false });
      if (e.key === 'ArrowDown') setSelected((v) => Math.min(v + 1, Math.max(flat.length - 1, 0)));
      if (e.key === 'ArrowUp') setSelected((v) => Math.max(v - 1, 0));
      if (e.key === 'Enter' && flat[selected]) open(flat[selected]);
    }}>
      <div className="surface-strong mx-auto mt-16 w-full max-w-2xl rounded-xl border shadow-2xl">
        <div className="flex items-center gap-3 border-b px-4 py-3"><Search className="h-5 w-5 text-muted" /><input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search runbooks, tags, notes..." className="flex-1 bg-transparent text-lg text-strong outline-none" />{loading && <Loader2 className="h-4 w-4 animate-spin text-muted" />}<button className="icon-button" onClick={() => dispatch({ type: 'TOGGLE_SEARCH', value: false })}><X className="h-5 w-5" /></button></div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {flat.length === 0 ? <div className="p-8 text-center text-muted">{query ? 'No results' : 'Type to search your emergency reference.'}</div> : Object.entries(grouped).map(([category, items]) => {
            const meta = getCategoryMeta(category as SearchResult['category']);
            return <div key={category}><div className="px-2 py-2 text-xs font-semibold uppercase text-muted">{meta.label}</div>{items.map((item) => {
              const index = flat.findIndex((r) => r.id === item.id);
              return <button key={item.id} onMouseEnter={() => setSelected(index)} onClick={() => open(item)} className={`entry-card w-full border-l-4 ${meta.tw} p-3 text-left ${selected === index ? 'entry-card-selected' : ''}`}><div className="flex justify-between gap-4"><span className="font-medium text-strong">{item.title}</span><span className="text-xs text-muted">{formatRelativeDate(item.updated_at)}</span></div><p className="mt-1 text-sm text-muted">{item.snippet}</p></button>;
            })}</div>;
          })}
        </div>
      </div>
    </div>
  );
}
