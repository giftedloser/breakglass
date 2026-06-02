import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { Sidebar } from './components/Sidebar';
import { SearchModal } from './components/SearchModal';
import { ContentRouter } from './components/ContentRouter';
import { TitleBar } from './components/TitleBar';
import { useApp } from './context/AppContext';

export default function App() {
  const { searchOpen, theme, dispatch } = useApp();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === 'k') { e.preventDefault(); dispatch({ type: 'TOGGLE_SEARCH', value: true }); }
      if (k === 's') { e.preventDefault(); window.dispatchEvent(new CustomEvent('bg-save')); }
      if (k === ',') { e.preventDefault(); dispatch({ type: 'SELECT', target: { kind: 'settings' } }); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch]);

  const toastBg = theme === 'dark' ? '#272320' : '#fbf8f3';
  const toastFg = theme === 'dark' ? '#ece8e2' : '#1f1a16';
  const toastBorder = theme === 'dark' ? '#34302c' : '#d2ccc1';

  return (
    <div className="app-root">
      <Toaster position="bottom-right" toastOptions={{ style: { background: toastBg, color: toastFg, border: `1px solid ${toastBorder}` } }} />
      {searchOpen && <SearchModal />}
      <TitleBar />
      <div className="app-shell">
        <Sidebar />
        <main className="main-pane">
          <ContentRouter />
        </main>
      </div>
    </div>
  );
}
