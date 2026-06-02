import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, File, FileImage, FileText, Paperclip, Trash2, Upload } from 'lucide-react';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { db } from '../lib/invoke';
import { Attachment, AttachmentParent } from '../types';

interface Props { parentKind: AttachmentParent; parentId: string }

function iconFor(mime: string, filename: string) {
  if (mime.startsWith('image/')) return FileImage;
  if (mime.startsWith('text/') || filename.match(/\.(txt|md|log|csv|json|yaml|yml|sql|sh|ps1|ini|conf)$/i)) return FileText;
  return File;
}

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip "data:<mime>;base64," prefix
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function Attachments({ parentKind, parentId }: Props) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    setLoading(true);
    try { setItems(await db.listAttachments(parentKind, parentId)); }
    catch (err) { toast.error(String(err)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, [parentKind, parentId]);

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    for (const file of list) {
      try {
        const b64 = await fileToBase64(file);
        const added = await db.addAttachment(parentKind, parentId, file.name, file.type || '', b64);
        setItems((cur) => [...cur, added].sort((a, b) => a.filename.localeCompare(b.filename)));
      } catch (err) { toast.error(`${file.name}: ${err}`); }
    }
    toast.success(`Attached ${list.length} file${list.length === 1 ? '' : 's'}`);
  };

  const onPickFiles = () => inputRef.current?.click();

  const onDownload = async (a: Attachment) => {
    try {
      const dest = await saveDialog({ defaultPath: a.filename });
      if (!dest) return;
      await db.saveAttachmentTo(a.id, dest);
      toast.success('Saved');
    } catch (err) { toast.error(String(err)); }
  };

  const onOpenInline = async (a: Attachment) => {
    if (!a.mime_type.startsWith('image/')) return onDownload(a);
    try {
      const b64 = await db.readAttachmentB64(a.id);
      const w = window.open();
      if (w) w.document.write(`<title>${a.filename}</title><body style="margin:0;background:#1a1816;display:grid;place-items:center;height:100vh"><img src="data:${a.mime_type};base64,${b64}" style="max-width:100vw;max-height:100vh"/></body>`);
    } catch (err) { toast.error(String(err)); }
  };

  const onDelete = async (a: Attachment) => {
    if (!window.confirm(`Delete attachment "${a.filename}"?`)) return;
    try {
      await db.deleteAttachment(a.id);
      setItems((cur) => cur.filter((x) => x.id !== a.id));
    } catch (err) { toast.error(String(err)); }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) void uploadFiles(e.dataTransfer.files);
  };

  const empty = !loading && items.length === 0;

  return (
    <section className={`panel attachments-panel ${empty ? 'is-empty' : ''}`}>
      <div className="body-head">
        <h3>
          <Paperclip size={11} className="head-glyph" />
          Attachments
          {items.length > 0 && <span className="head-count"> ({items.length})</span>}
        </h3>
        <button className="ghost-btn" onClick={onPickFiles}>
          <Upload size={11} /> Add file
        </button>
        <input ref={inputRef} type="file" multiple style={{ display: 'none' }}
               onChange={(e) => e.target.files && uploadFiles(e.target.files).then(() => { if (inputRef.current) inputRef.current.value = ''; })} />
      </div>
      {!empty && (
        <div className={`attach-drop ${dragOver ? 'is-over' : ''}`}
             onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
             onDragLeave={() => setDragOver(false)}
             onDrop={onDrop}>
          {loading ? (
            <div className="empty">Loading...</div>
          ) : (
            <ul className="attach-list">
              {items.map((a) => {
                const Icon = iconFor(a.mime_type, a.filename);
                return (
                  <li key={a.id} className="attach-row">
                    <button className="attach-name" onClick={() => onOpenInline(a)} title={a.filename}>
                      <Icon size={13} />
                      <span className="truncate">{a.filename}</span>
                    </button>
                    <span className="attach-size">{humanSize(a.size_bytes)}</span>
                    <button className="icon-btn" title="Download" onClick={() => onDownload(a)}><Download size={11} /></button>
                    <button className="icon-btn danger" title="Delete" onClick={() => onDelete(a)}><Trash2 size={11} /></button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {empty && (
        <div className={`attach-empty-strip ${dragOver ? 'is-over' : ''}`}
             onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
             onDragLeave={() => setDragOver(false)}
             onDrop={onDrop}>
          Drop a file here, or click <span className="kbd-like">Add file</span>. Up to 50 MB each.
        </div>
      )}
    </section>
  );
}
