import { useEffect, useRef, useState } from 'react';
import hljs from 'highlight.js/lib/core';
import sql from 'highlight.js/lib/languages/sql';
import 'highlight.js/styles/atom-one-dark.css';
import { Check, Copy } from 'lucide-react';

hljs.registerLanguage('sql', sql);

export function CodeBlock({ code, language = 'sql' }: { code: string; language?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    try {
      ref.current.removeAttribute('data-highlighted');
      const result = hljs.highlight(code || '', { language, ignoreIllegals: true });
      ref.current.innerHTML = result.value;
    } catch {
      if (ref.current) ref.current.textContent = code;
    }
  }, [code, language]);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-lang">{language.toUpperCase()}</span>
        <button className="code-copy" onClick={copy}>
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre><code ref={ref} className={`language-${language}`}>{code}</code></pre>
    </div>
  );
}
