import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
  theme?: "dark" | "light";
  isUser?: boolean;
}

export default function MarkdownRenderer({ content, theme = "dark", isUser = false }: MarkdownRendererProps) {
  if (!content) return null;

  const isDark = theme !== "light" || isUser;

  // Split content into blocks of code and text
  const blocks: { type: "code" | "text"; language?: string; code?: string; text?: string }[] = [];
  const parts = content.split("```");

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      // Code block
      const s = parts[i];
      const match = s.match(/^([a-zA-Z0-9+#]+)?\n([\s\S]*)$/);
      if (match) {
        blocks.push({
          type: "code",
          language: match[1] || "plaintext",
          code: match[2].trimEnd(),
        });
      } else {
        blocks.push({
          type: "code",
          language: "plaintext",
          code: s.trimEnd(),
        });
      }
    } else {
      // Normal text
      if (parts[i]) {
        blocks.push({
          type: "text",
          text: parts[i],
        });
      }
    }
  }

  return (
    <div className={`space-y-4 text-sm leading-relaxed font-sans ${isDark ? "text-slate-100" : "text-stone-800"}`}>
      {blocks.map((block, idx) => {
        if (block.type === "code") {
          return (
            <CodeBlockKey
              key={idx}
              code={block.code || ""}
              language={block.language || "text"}
              isDark={isDark}
            />
          );
        } else {
          return <TextParser key={idx} text={block.text || ""} isDark={isDark} />;
        }
      })}
    </div>
  );
}

interface CodeBlockProps {
  key?: any;
  code: string;
  language: string;
  isDark: boolean;
}

function CodeBlockKey({ code, language, isDark }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`my-4 overflow-hidden rounded-xl border font-mono shadow-md ${
      isDark 
        ? "border-slate-800 bg-slate-900" 
        : "border-stone-200 bg-stone-50"
    }`}>
      <div className={`flex items-center justify-between px-4 py-2.5 text-xs transition-colors ${
        isDark ? "bg-slate-950 text-slate-400" : "bg-stone-200/60 text-stone-500"
      }`}>
        <span className="font-semibold uppercase tracking-wider">{language}</span>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-all active:scale-95 ${
            isDark 
              ? "bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white" 
              : "bg-white border border-stone-250 text-stone-600 hover:bg-stone-100 shadow-sm"
          }`}
          title="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-550 font-bold">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className={`overflow-x-auto p-4 text-xs leading-5 select-text ${
        isDark ? "text-slate-200" : "text-stone-700"
      }`}>
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

interface BlockQuoteProps {
  key?: any;
  text: string;
  isDark: boolean;
}

function BlockQuoteComponent({ text, isDark }: BlockQuoteProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`group relative my-3 border-l-4 pl-4 pr-12 py-2.5 rounded-r-xl transition-all duration-200 ${
      isDark 
        ? "border-blue-500 bg-slate-900/30 text-slate-200 hover:bg-slate-900/50" 
        : "border-indigo-600 bg-stone-100 text-stone-850 hover:bg-stone-200/50 shadow-sm"
    }`}>
      <div className="font-sans italic">
        <InlineTextParser text={text} isDark={isDark} />
      </div>
      
      {/* Floating Copy Prompt Button */}
      <button
        onClick={handleCopy}
        className={`absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1 rounded bg-slate-950/90 border border-slate-800 px-2.5 py-1 text-[10px] font-semibold text-slate-400 hover:text-white hover:bg-slate-900 active:scale-95 cursor-pointer shadow-md`}
        title="Copy prompt template"
      >
        {copied ? (
          <>
            <Check className="h-3 w-3 text-emerald-400" />
            <span className="text-emerald-500 font-bold">Copied</span>
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" />
            <span>Copy Prompt</span>
          </>
        )}
      </button>
    </div>
  );
}

interface InlineCodeProps {
  key?: any;
  text: string;
  isDark: boolean;
}

function InlineCodeComponent({ text, isDark }: InlineCodeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <code
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-mono transition-all duration-200 cursor-pointer active:scale-95 group border ${
        copied
          ? isDark
            ? "bg-emerald-950/40 text-emerald-400 border-emerald-550/40"
            : "bg-emerald-50 text-emerald-705 border-emerald-200"
          : isDark
            ? "bg-slate-850 hover:bg-slate-800 border-slate-800/60 text-sky-300 hover:text-sky-200"
            : "bg-stone-100 hover:bg-stone-200/80 border-stone-200/60 text-indigo-700 font-medium"
      }`}
      title="Click to copy prompt/code"
    >
      <span>{text}</span>
      {copied ? (
        <Check className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
      ) : (
        <Copy className="h-2.5 w-2.5 text-slate-500 hover:text-slate-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </code>
  );
}

function TextParser({ text, isDark }: { key?: any; text: string; isDark: boolean }) {
  const lines = text.split("\n");
  const parsedElements: React.ReactNode[] = [];

  let inList = false;
  let listItems: string[] = [];
  let listType: "ul" | "ol" = "ul";

  const flushList = (key: string) => {
    if (listItems.length > 0) {
      if (listType === "ul") {
        parsedElements.push(
          <ul key={`ul-${key}`} className={`list-disc pl-6 py-1 space-y-1.5 ${isDark ? "text-slate-300" : "text-stone-700"}`}>
            {listItems.map((item, idx) => (
              <li key={idx} className={isDark ? "marker:text-blue-400/80" : "marker:text-indigo-600/80"}>
                <InlineTextParser text={item} isDark={isDark} />
              </li>
            ))}
          </ul>
        );
      } else {
        parsedElements.push(
          <ol key={`ol-${key}`} className={`list-decimal pl-6 py-1 space-y-1.5 ${isDark ? "text-slate-300" : "text-stone-700"}`}>
            {listItems.map((item, idx) => (
              <li key={idx}>
                <InlineTextParser text={item} isDark={isDark} />
              </li>
            ))}
          </ol>
        );
      }
      listItems = [];
      inList = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headers
    if (line.startsWith("# ")) {
      flushList(`${i}`);
      parsedElements.push(
        <h1 key={i} className={`text-xl font-bold mt-4 mb-2 tracking-tight ${isDark ? "text-slate-50" : "text-stone-900"}`}>
          <InlineTextParser text={line.substring(2)} isDark={isDark} />
        </h1>
      );
    } else if (line.startsWith("## ")) {
      flushList(`${i}`);
      parsedElements.push(
        <h2 key={i} className={`text-lg font-bold mt-4 mb-2 tracking-tight ${isDark ? "text-slate-100" : "text-stone-850"}`}>
          <InlineTextParser text={line.substring(3)} isDark={isDark} />
        </h2>
      );
    } else if (line.startsWith("### ")) {
      flushList(`${i}`);
      parsedElements.push(
        <h3 key={i} className={`text-md font-semibold mt-3 mb-1.5 tracking-tight ${isDark ? "text-slate-200" : "text-stone-850"}`}>
          <InlineTextParser text={line.substring(4)} isDark={isDark} />
        </h3>
      );
    } else if (line.startsWith("#### ")) {
      flushList(`${i}`);
      parsedElements.push(
        <h4 key={i} className={`text-sm font-semibold mt-3 mb-1 tracking-tight ${isDark ? "text-slate-300" : "text-stone-750"}`}>
          <InlineTextParser text={line.substring(5)} isDark={isDark} />
        </h4>
      );
    }
    // Blockquote
    else if (line.startsWith("> ")) {
      flushList(`${i}`);
      parsedElements.push(
        <BlockQuoteComponent key={i} text={line.substring(2)} isDark={isDark} />
      );
    }
    // Unordered List (- or *)
    else if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) {
        flushList(`${i}`);
        inList = true;
        listType = "ul";
      }
      listItems.push(line.substring(2));
    }
    // Ordered List (1. 2. etc)
    else if (/^\d+\.\s/.test(line)) {
      if (!inList) {
        flushList(`${i}`);
        inList = true;
        listType = "ol";
      }
      const match = line.match(/^\d+\.\s(.*)/);
      if (match) {
        listItems.push(match[1]);
      }
    }
    // Empty line
    else if (line.trim() === "") {
      flushList(`${i}`);
    }
    // Normal paragraph
    else {
      flushList(`${i}`);
      parsedElements.push(
        <p key={i} className={`mb-2.5 ${isDark ? "text-slate-200" : "text-stone-800"}`}>
          <InlineTextParser text={line} isDark={isDark} />
        </p>
      );
    }
  }

  // Handle remaining list
  flushList("final");

  return <>{parsedElements}</>;
}

function InlineTextParser({ text, isDark }: { text: string; isDark: boolean }) {
  if (!text) return null;

  // Simple parser to handle bold (**), italic (*), inline code (`)
  const elements: React.ReactNode[] = [];
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
  const parts = text.split(regex);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith("**") && part.endsWith("**")) {
      elements.push(
        <strong key={i} className={`font-bold ${isDark ? "text-slate-50" : "text-stone-950 font-semibold"}`}>
          {part.substring(2, part.length - 2)}
        </strong>
      );
    } else if (part.startsWith("*") && part.endsWith("*")) {
      elements.push(
        <em key={i} className={`italic ${isDark ? "text-slate-100" : "text-stone-900"}`}>
          {part.substring(1, part.length - 1)}
        </em>
      );
    } else if (part.startsWith("`") && part.endsWith("`")) {
      elements.push(
        <InlineCodeComponent key={i} text={part.substring(1, part.length - 1)} isDark={isDark} />
      );
    } else {
      elements.push(<span key={i}>{part}</span>);
    }
  }

  return <>{elements}</>;
}
