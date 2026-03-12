import React, { useMemo, useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface JsonBlockProps {
  value?: unknown;
  raw?: string;
  maxHeight?: string;
}

export function JsonBlock({ value, raw, maxHeight = 'max-h-40' }: JsonBlockProps) {
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => {
    if (raw != null) {
      try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
    }
    return JSON.stringify(value, null, 2);
  }, [value, raw]);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-1.5 right-1.5 z-10 p-1 rounded border border-border/50 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
        title="Copy JSON"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      </button>
      <textarea
        readOnly
        value={text}
        className={`text-xs bg-background/50 border rounded-md p-3 overflow-auto resize ${maxHeight} w-full font-mono whitespace-pre`}
      />
    </div>
  );
}
