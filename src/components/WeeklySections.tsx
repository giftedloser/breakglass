import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

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

  const removeSection = (id: string) => {
    if (!window.confirm('Remove this section?')) return;
    onChange(sections.filter((s) => s.id !== id));
  };

  // Suggestions = default titles not already used (case-insensitive).
  const usedTitles = new Set(sections.map((s) => s.title.trim().toLowerCase()));
  const suggestions = DEFAULT_TITLES.filter((t) => !usedTitles.has(t.toLowerCase()));

  if (!editing) {
    if (sections.length === 0) {
      return <div className="empty">No notes yet. Click the pen above to add sections.</div>;
    }
    return (
      <div className="wr-sections is-reading">
        {sections.map((s) => (
          <section key={s.id} className="wr-section">
            <h3 className="wr-section-title">{s.title || '(untitled section)'}</h3>
            {s.content
              ? <div className="wr-section-body">{s.content}</div>
              : <div className="empty wr-section-empty">Nothing jotted here yet.</div>}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="wr-sections is-editing">
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
