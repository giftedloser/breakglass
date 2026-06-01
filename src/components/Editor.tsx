import { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import Color from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-text-style';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Plugin } from '@tiptap/pm/state';
import { open as openShell } from '@tauri-apps/plugin-shell';
import { Bold, CheckSquare, Code, Heading1, Heading2, Heading3, Highlighter, ImageIcon, Italic, LinkIcon, List, ListOrdered, Quote, Redo, TableIcon, Undo } from 'lucide-react';
import { cn } from '../lib/utils';

const pasteImages = () =>
  new Plugin({
    props: {
      handlePaste(view, event) {
        const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith('image/'));
        if (!file) return false;
        const reader = new FileReader();
        reader.onload = () => {
          const src = String(reader.result);
          view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes.image.create({ src })));
        };
        reader.readAsDataURL(file);
        return true;
      },
    },
  });

const parseContent = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export function Editor({ content, onChange, editable, placeholder }: { content: string; onChange: (json: string) => void; editable: boolean; placeholder?: string }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: { languageClassPrefix: 'language-' } }),
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: false }),
      Highlight.configure({ multicolor: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: placeholder ?? 'Start writing...' }),
      CharacterCount,
      Color,
      TextStyle,
      TaskList.configure({ HTMLAttributes: { class: 'task-list' } }),
      TaskItem.configure({ nested: true, HTMLAttributes: { class: 'task-item' } }),
    ],
    content: parseContent(content),
    editable,
    editorProps: { attributes: { class: 'tiptap-content outline-none' }, handlePaste: pasteImages().props.handlePaste },
    onUpdate({ editor: instance }) {
      onChange(JSON.stringify(instance.getJSON()));
    },
  });

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    if (current !== content) editor.commands.setContent(parseContent(content), false);
  }, [content, editor]);

  useEffect(() => {
    if (!editor) return;
    const decorateCodeBlocks = () => {
      shellRef.current?.querySelectorAll<HTMLPreElement>('pre').forEach((pre) => {
        if (pre.querySelector('.code-copy-button')) return;
        const code = pre.querySelector('code');
        const language = code?.className.match(/language-([\w-]+)/)?.[1] ?? 'text';

        const label = document.createElement('span');
        label.className = 'code-language-label';
        label.textContent = language;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'code-copy-button';
        button.textContent = 'Copy';
        button.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await navigator.clipboard.writeText(code?.textContent ?? '');
          button.textContent = 'Copied';
          window.setTimeout(() => { button.textContent = 'Copy'; }, 1200);
        });

        pre.append(label, button);
      });
    };
    decorateCodeBlocks();
    editor.on('update', decorateCodeBlocks);
    editor.on('selectionUpdate', decorateCodeBlocks);
    return () => {
      editor.off('update', decorateCodeBlocks);
      editor.off('selectionUpdate', decorateCodeBlocks);
    };
  }, [editor]);

  const run = (fn: () => void) => () => {
    fn();
    editor?.chain().focus().run();
  };

  const addLink = () => {
    const url = window.prompt('URL');
    if (url) editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const addImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => editor?.chain().focus().setImage({ src: String(reader.result) }).run();
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const toolbar = [
    { icon: Bold, action: run(() => editor?.chain().toggleBold().run()), active: editor?.isActive('bold') },
    { icon: Italic, action: run(() => editor?.chain().toggleItalic().run()), active: editor?.isActive('italic') },
    { icon: Heading1, action: run(() => editor?.chain().toggleHeading({ level: 1 }).run()), active: editor?.isActive('heading', { level: 1 }) },
    { icon: Heading2, action: run(() => editor?.chain().toggleHeading({ level: 2 }).run()), active: editor?.isActive('heading', { level: 2 }) },
    { icon: Heading3, action: run(() => editor?.chain().toggleHeading({ level: 3 }).run()), active: editor?.isActive('heading', { level: 3 }) },
    { icon: List, action: run(() => editor?.chain().toggleBulletList().run()), active: editor?.isActive('bulletList') },
    { icon: ListOrdered, action: run(() => editor?.chain().toggleOrderedList().run()), active: editor?.isActive('orderedList') },
    { icon: CheckSquare, action: run(() => editor?.chain().toggleTaskList().run()), active: editor?.isActive('taskList') },
    { icon: Code, action: run(() => editor?.chain().toggleCodeBlock().run()), active: editor?.isActive('codeBlock') },
    { icon: Quote, action: run(() => editor?.chain().toggleBlockquote().run()), active: editor?.isActive('blockquote') },
    { icon: TableIcon, action: run(() => editor?.chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()), active: false },
    { icon: LinkIcon, action: addLink, active: editor?.isActive('link') },
    { icon: ImageIcon, action: addImage, active: false },
    { icon: Highlighter, action: run(() => editor?.chain().toggleHighlight().run()), active: editor?.isActive('highlight') },
    { icon: Undo, action: run(() => editor?.chain().undo().run()), active: false },
    { icon: Redo, action: run(() => editor?.chain().redo().run()), active: false },
  ];

  return (
    <div className="editor-shell">
      {editable && (
        <div className="editor-toolbar">
          {toolbar.map(({ icon: Icon, action, active }, index) => (
            <button key={index} type="button" onClick={action} className={cn('icon-button', active && 'bg-[var(--selected)] text-strong')}>
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      )}
      <div ref={shellRef} className="editor-body" onClick={(event) => {
        const anchor = (event.target as HTMLElement).closest('a');
        if (anchor?.getAttribute('href')) void openShell(anchor.getAttribute('href')!);
      }}>
        <EditorContent editor={editor} />
      </div>
      {editable && (
        <div className="editor-footer">
          {editor?.storage.characterCount.characters() ?? 0} chars / {editor?.storage.characterCount.words() ?? 0} words
        </div>
      )}
    </div>
  );
}
