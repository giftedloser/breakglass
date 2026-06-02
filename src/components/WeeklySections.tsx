import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Clipboard, FileText, Plus, StickyNote, Trash2 } from 'lucide-react';
import { bgConfirm } from '../lib/dialogs';
import { copyToClipboard } from '../lib/utils';

export interface ReportSection {
  id: string;
  title: string;
  content: string;
}

interface Props {
  sections: ReportSection[];
  editing: boolean;
  onChange: (next: ReportSection[]) => void;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

const DEFAULT_TITLES = [
  'Solutions Created / Discovered',
  'Logs & Problem-Solving',
  'Escalations',
  'Workflow & Innovation',
  'Customer Service',
  'Professionalism & FASTER',
  'Project Ownership',
];

export function WeeklySections({ sections, editing, onChange }: Props) {
  const [view, setView] = useState<'notes' | 'draft'>('notes');
  const [copied, setCopied] = useState(false);

  // Lazy hydrate: if no sections yet and we're in edit mode, seed with one blank.
  useEffect(() => {
    if (editing && sections.length === 0) {
      onChange([{ id: uid(), title: '', content: '' }]);
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSection = (id: string, patch: Partial<ReportSection>) => {
    onChange(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const addSection = (suggestedTitle = '') => {
    onChange([...sections, { id: uid(), title: suggestedTitle, content: '' }]);
  };

  const removeSection = async (id: string) => {
    const ok = await bgConfirm({ title: 'Remove this section?', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    onChange(sections.filter((s) => s.id !== id));
  };

  // Suggestions = default titles not already used (case-insensitive).
  const usedTitles = new Set(sections.map((s) => s.title.trim().toLowerCase()));
  const suggestions = DEFAULT_TITLES.filter((t) => !usedTitles.has(t.toLowerCase()));
  const filledSections = sections.filter((s) => s.title.trim() || s.content.trim());
  const noteCount = sections.reduce((sum, s) => (
    sum + s.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length
  ), 0);
  const reportDraft = filledSections
    .map((s) => {
      const title = s.title.trim() || 'Untitled section';
      const lines = s.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (lines.length === 0) return `${title}\n- No notes captured yet.`;
      return `${title}\n${lines.map((line) => line.match(/^[-*•]/) ? line.replace(/^[-*•]\s*/, '- ') : `- ${line}`).join('\n')}`;
    })
    .join('\n\n');

  const copyDraft = async () => {
    if (!reportDraft.trim()) {
      toast.error('No report notes to copy');
      return;
    }
    await copyToClipboard(reportDraft);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
    toast.success('Report draft copied');
  };

  if (!editing) {
    if (sections.length === 0) {
      return <div className="empty">No notes yet. Click the pen above to add sections.</div>;
    }
    return (
      <div className="wr-sections is-reading">
        <div className="wr-modebar">
          <div className="wr-mode-copy">
            <span>{noteCount} note{noteCount === 1 ? '' : 's'} captured</span>
            <strong>{view === 'notes' ? 'Working notes' : 'Report draft'}</strong>
          </div>
          <div className="wr-mode-actions">
            <button className={`wr-mode-btn ${view === 'notes' ? 'is-selected' : ''}`} onClick={() => setView('notes')}>
              <StickyNote size={12} /> Notes
            </button>
            <button className={`wr-mode-btn ${view === 'draft' ? 'is-selected' : ''}`} onClick={() => setView('draft')}>
              <FileText size={12} /> Draft
            </button>
            <button className="ghost-btn" onClick={copyDraft}>
              {copied ? <Check size={12} /> : <Clipboard size={12} />}
              {copied ? 'Copied' : 'Copy draft'}
            </button>
          </div>
        </div>

        {view === 'notes' ? (
          sections.map((s) => (
            <section key={s.id} className="wr-section">
              <h3 className="wr-section-title">{s.title || '(untitled section)'}</h3>
              {s.content
                ? <div className="wr-section-body">{s.content}</div>
                : <div className="empty wr-section-empty">Nothing jotted here yet.</div>}
            </section>
          ))
        ) : (
          <section className="wr-draft">
            {reportDraft.trim()
              ? reportDraft.split('\n\n').map((block, index) => {
                  const [title, ...lines] = block.split('\n');
                  return (
                    <div key={`${title}-${index}`} className="wr-draft-section">
                      <h3>{title}</h3>
                      <ul>
                        {lines.map((line, lineIndex) => (
                          <li key={lineIndex}>{line.replace(/^-\s*/, '')}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })
              : <div className="empty">No report notes to draft yet.</div>}
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="wr-sections is-editing">
      <div className="wr-capture-hint">
        <StickyNote size={13} />
        <span>Capture rough notes here during the week. The Draft view will turn them into a clean report outline later.</span>
      </div>

      {sections.map((s) => (
        <section key={s.id} className="wr-section editable">
          <div className="wr-section-head">
            <input
              className="wr-section-title-input"
              value={s.title}
              placeholder="Section title (e.g. Escalations)"
              onChange={(e) => updateSection(s.id, { title: e.target.value })}
            />
            <button className="icon-btn danger" title="Remove section" onClick={() => removeSection(s.id)}>
              <Trash2 size={12} />
            </button>
          </div>
          <textarea
            className="notes-area wr-section-textarea"
            rows={4}
            value={s.content}
            placeholder="Scrap notes — bullet points, ticket #s, anything."
            onChange={(e) => updateSection(s.id, { content: e.target.value })}
          />
        </section>
      ))}

      <div className="wr-add-row">
        <button className="ghost-btn" onClick={() => addSection('')}>
          <Plus size={12} /> Add section
        </button>
        {suggestions.length > 0 && (
          <div className="wr-suggestions">
            <span className="wr-suggest-label">Quick add:</span>
            {suggestions.map((title) => (
              <button key={title} className="wr-suggest-chip" onClick={() => addSection(title)}>
                {title}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
