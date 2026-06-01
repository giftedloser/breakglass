import { open } from '@tauri-apps/plugin-dialog';
import toast from 'react-hot-toast';
import { db } from '../lib/invoke';
import { useApp } from '../context/AppContext';
import { extractPlainText } from '../lib/utils';

const escapeHtml = (value: string) =>
  value.replace(/[<>&"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[char]!));

export function ExportDialog() {
  const { entries, dispatch, refresh } = useApp();
  const exportJson = async () => {
    try {
      const path = await db.exportJson();
      toast.success(`Saved ${path}`);
    } catch (error) { toast.error(String(error)); }
  };
  const importJson = async () => {
    const path = await open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (typeof path !== 'string') return;
    try {
      const result = await db.importJson(path);
      await refresh();
      toast.success(`Imported ${result.entries_imported} entries, ${result.contacts_imported} contacts`);
    } catch (error) { toast.error(String(error)); }
  };
  const printPdf = () => {
    if (!entries.length) return toast.error('No entries to export');
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    if (!doc) {
      iframe.remove();
      return toast.error('Could not prepare PDF export');
    }

    const body = entries.map((entry) => {
      const content = escapeHtml(extractPlainText(entry.content) || 'No content');
      const tags = entry.tags.length ? `<p class="tags">${entry.tags.map(escapeHtml).join(' / ')}</p>` : '';
      return `<section class="entry"><h1>${escapeHtml(entry.title)}</h1><p class="meta">${escapeHtml(entry.category)} / ${escapeHtml(entry.status)} / ${escapeHtml(entry.severity)}</p>${tags}<pre>${content}</pre></section>`;
    }).join('');

    doc.open();
    doc.write(`<html><head><title>BreakGlass Export</title><style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:32px;color:#111}.entry{page-break-after:always}.entry:last-child{page-break-after:auto}h1{font-size:24px;margin:0 0 8px}.meta,.tags{color:#555;font-size:12px;text-transform:uppercase;letter-spacing:.04em}pre{white-space:pre-wrap;font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;background:#f3f4f6;border:1px solid #ddd;border-radius:8px;padding:16px}</style></head><body>${body}</body></html>`);
    doc.close();
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    window.setTimeout(() => iframe.remove(), 1000);
  };
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/45 p-6 backdrop-blur-sm">
      <div className="surface-strong w-full max-w-lg rounded-xl border p-5 shadow-2xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-strong">Import / Export</h2><button onClick={() => dispatch({ type: 'TOGGLE_EXPORT_DIALOG', value: false })} className="text-muted hover:text-strong">Close</button></div>
        <div className="mt-5 space-y-6">
          <section><h3 className="mb-2 text-sm font-semibold uppercase text-muted">Export</h3><div className="flex gap-2"><button onClick={exportJson} className="primary-button">Export all data to JSON</button><button onClick={printPdf} className="secondary-button">Export selected entries to PDF</button></div></section>
          <section><h3 className="mb-2 text-sm font-semibold uppercase text-muted">Import</h3><button onClick={importJson} className="secondary-button">Import from JSON backup</button><p className="mt-2 text-sm text-muted">Importing will add entries. Existing entries with the same ID will be updated.</p></section>
        </div>
      </div>
    </div>
  );
}
