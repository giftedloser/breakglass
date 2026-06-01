import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { Sidebar } from './components/Sidebar';
import { SearchModal } from './components/SearchModal';
import { ExportDialog } from './components/ExportDialog';
import { ContentRouter } from './components/ContentRouter';
import { useApp } from './context/AppContext';

export default function App() {
  const { searchOpen, exportOpen, dispatch } = useApp();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === 'k') { e.preventDefault(); dispatch({ type: 'TOGGLE_SEARCH', value: true }); }
      if (k === 's') { e.preventDefault(); window.dispatchEvent(new CustomEvent('bg-save')); }
      if (k === 'n') { e.preventDefault(); window.dispatchEvent(new CustomEvent('bg-new')); }
      if (k === 'e') { e.preventDefault(); dispatch({ type: 'TOGGLE_EXPORT', value: true }); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch]);

  return (
    <div className="app-shell">
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#272320', color: '#ece8e2', border: '1px solid #34302c' } }} />
      {searchOpen && <SearchModal />}
      {exportOpen && <ExportDialog />}
      <Sidebar />
      <main className="main-pane">
        <ContentRouter />
      </main>
    </div>
  );
}
