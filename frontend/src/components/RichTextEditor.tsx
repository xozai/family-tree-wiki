import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const btnClass = 'p-1.5 rounded hover:bg-stone-100 text-stone-600 text-sm font-medium transition-colors';
const activeBtnClass = 'p-1.5 rounded bg-stone-200 text-stone-900 text-sm font-medium';

export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholder || 'Write a biography…' }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  if (!editor) return null;

  return (
    <div className="border border-stone-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-warm-400 focus-within:border-warm-400">
      <div className="flex flex-wrap gap-0.5 p-2 bg-stone-50 border-b border-stone-200">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? activeBtnClass : btnClass} title="Bold">B</button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? activeBtnClass : btnClass} title="Italic"><em>I</em></button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={editor.isActive('underline') ? activeBtnClass : btnClass} title="Underline"><u>U</u></button>
        <div className="w-px bg-stone-200 mx-1 my-0.5" />
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={editor.isActive('heading', { level: 2 }) ? activeBtnClass : btnClass}>H2</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={editor.isActive('heading', { level: 3 }) ? activeBtnClass : btnClass}>H3</button>
        <div className="w-px bg-stone-200 mx-1 my-0.5" />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? activeBtnClass : btnClass} title="Bullet list">• List</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? activeBtnClass : btnClass} title="Numbered list">1. List</button>
        <div className="w-px bg-stone-200 mx-1 my-0.5" />
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={editor.isActive('blockquote') ? activeBtnClass : btnClass} title="Quote">"</button>
        <div className="w-px bg-stone-200 mx-1 my-0.5" />
        <button type="button" onClick={() => editor.chain().focus().undo().run()} className={btnClass} title="Undo">↩</button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} className={btnClass} title="Redo">↪</button>
      </div>
      <EditorContent editor={editor} className="prose prose-stone max-w-none p-4 min-h-[200px] text-sm focus:outline-none" />
    </div>
  );
}
