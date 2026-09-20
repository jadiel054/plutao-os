"use client";

/**
 * Markdown Renderer Completo para respostas do Núcleo
 * Parseia: headers, negrito, itálico, listas, links, código inline, blocos de código
 * Funciona incrementalmente durante streaming
 */

import { Fragment, memo } from "react";

// Regex patterns para parsing incremental
const patterns = {
  // Headers
  header1: /^#\s+(.*)$/,
  header2: /^##\s+(.*)$/,
  header3: /^###\s+(.*)$/,
  header4: /^####\s+(.*)$/,
  
  // Bold e Italic
  bold: /\*\*(.+?)\*\*/g,
  italic: /\*(.+?)\*/g,
  
  // Inline code
  inlineCode: /`([^`]+)`/g,
  
  // Links
  link: /\\[(.+?)\\]\\((.+?)\\)/g,
  
  // Listas
  unorderedList: /^\s*[-*+]\s+(.*)$/,
  orderedList: /^\s*\d+\.\s+(.*)$/,
  
  // Blocos de código (já tratados em StructuredMessage)
  // Code blocks: /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g,
  
  // Blockquotes
  blockquote: /^>\s+(.*)$/,
  
  // Horizontal rule
  hr: /^---+$/,
};

const headerClasses = {
  1: "text-xl font-bold",
  2: "text-lg font-semibold",
  3: "text-base font-semibold",
  4: "text-sm font-medium",
};

function parseInlineMarkdown(text: string): React.ReactNode {
  const result: React.ReactNode[] = [];
  const _lastIndex = 0;
  
  // Processar links
  const linkRegex = /\\[(.+?)\\]\\((.+?)\\)/g;
  let linkMatch: RegExpExecArray | null;
  const linkMatches: {start: number; end: number; text: string; url: string}[] = [];
  
  while ((linkMatch = linkRegex.exec(text)) !== null) {
    linkMatches.push({
      start: linkMatch!.index,
      end: linkRegex.lastIndex,
      text: linkMatch![1],
      url: linkMatch![2],
    });
  }
  
  // Processar bold
  const boldRegex = /\*\*(.+?)\*\*/g;
  let boldMatch: RegExpExecArray | null;
  const boldMatches: {start: number; end: number; text: string}[] = [];
  
  while ((boldMatch = boldRegex.exec(text)) !== null) {
    boldMatches.push({
      start: boldMatch!.index,
      end: boldRegex.lastIndex,
      text: boldMatch![1],
    });
  }
  
  // Processar itálico
  const italicRegex = /\*(.+?)\*/g;
  let italicMatch: RegExpExecArray | null;
  const italicMatches: {start: number; end: number; text: string}[] = [];
  
  while ((italicMatch = italicRegex.exec(text)) !== null) {
    // Evitar conflitos com bold
    const isInsideBold = boldMatches.some(b => 
      italicMatch!.index >= b.start && italicRegex.lastIndex <= b.end
    );
    if (!isInsideBold) {
      italicMatches.push({
        start: italicMatch.index,
        end: italicRegex.lastIndex,
        text: italicMatch![1],
      });
    }
  }
  
  // Processar inline code
  const codeRegex = /`([^`]+)`/g;
  let codeMatch;
  const codeMatches: {start: number; end: number; text: string}[] = [];
  
  while ((codeMatch = codeRegex.exec(text)) !== null) {
    codeMatches.push({
      start: codeMatch.index,
      end: codeRegex.lastIndex,
      text: codeMatch[1],
    });
  }
  
  // Ordenar todos os matches por posição
  const allMatches = [
    ...linkMatches.map(m => ({...m, type: 'link' as const})),
    ...boldMatches.map(m => ({...m, type: 'bold' as const})),
    ...italicMatches.map(m => ({...m, type: 'italic' as const})),
    ...codeMatches.map(m => ({...m, type: 'code' as const})),
  ].sort((a, b) => a.start - b.start);
  
  // Construir o resultado
  let currentIndex = 0;
  for (const match of allMatches) {
    // Adicionar texto antes do match
    if (match.start > currentIndex) {
      result.push(text.slice(currentIndex, match.start));
    }
    
    // Adicionar o elemento correspondente
    switch (match.type) {
      case 'link':
        result.push(
          <a 
            key={`${match.start}-link`}
            href={match.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[var(--selo)] underline hover:text-[var(--nucleo)] transition-colors [overflow-wrap:anywhere] break-words"
          >
            {match.text}
          </a>
        );
        break;
      case 'bold':
        result.push(
          <strong key={`${match.start}-bold`} className="font-semibold text-[var(--text-primary)]">
            {parseInlineMarkdown(match.text)}
          </strong>
        );
        break;
      case 'italic':
        result.push(
          <em key={`${match.start}-italic`} className="italic text-[var(--text-secondary)]">
            {parseInlineMarkdown(match.text)}
          </em>
        );
        break;
      case 'code':
        result.push(
          <code 
            key={`${match.start}-code`} 
            className="px-1 py-0.5 rounded-md bg-[var(--base)] border border-[var(--border)] font-mono text-[12px] text-[var(--selo)]"
          >
            {match.text}
          </code>
        );
        break;
    }
    
    currentIndex = match.end;
  }
  
  // Adicionar texto restante
  if (currentIndex < text.length) {
    result.push(text.slice(currentIndex));
  }
  
  return result.length === 1 ? result[0] : <>{result}</>;
}

function parseBlock(text: string, key: string): React.ReactNode {
  // Header 1
  if (patterns.header1.test(text)) {
    const match = text.match(patterns.header1);
    return match ? (
      <h1 key={key} className={`mt-4 mb-2 ${headerClasses[1]} text-[var(--text-primary)]`}>
        {parseInlineMarkdown(match[1])}
      </h1>
    ) : null;
  }
  
  // Header 2
  if (patterns.header2.test(text)) {
    const match = text.match(patterns.header2);
    return match ? (
      <h2 key={key} className={`mt-4 mb-2 ${headerClasses[2]} text-[var(--text-primary)]`}>
        {parseInlineMarkdown(match[1])}
      </h2>
    ) : null;
  }
  
  // Header 3
  if (patterns.header3.test(text)) {
    const match = text.match(patterns.header3);
    return match ? (
      <h3 key={key} className={`mt-3 mb-2 ${headerClasses[3]} text-[var(--text-primary)]`}>
        {parseInlineMarkdown(match[1])}
      </h3>
    ) : null;
  }
  
  // Header 4
  if (patterns.header4.test(text)) {
    const match = text.match(patterns.header4);
    return match ? (
      <h4 key={key} className={`mt-2 mb-2 ${headerClasses[4]} text-[var(--text-primary)]`}>
        {parseInlineMarkdown(match[1])}
      </h4>
    ) : null;
  }
  
  // Blockquote
  if (patterns.blockquote.test(text)) {
    const match = text.match(patterns.blockquote);
    return match ? (
      <blockquote 
        key={key} 
        className="mt-2 mb-2 pl-4 border-l-2 border-[var(--border)] text-[var(--text-secondary)] italic"
      >
        {parseInlineMarkdown(match[1])}
      </blockquote>
    ) : null;
  }
  
  // Horizontal rule
  if (patterns.hr.test(text)) {
    return <hr key={key} className="my-4 border-[var(--border)]" />;
  }
  
  // Listas não ordenadas
  if (patterns.unorderedList.test(text)) {
    const match = text.match(patterns.unorderedList);
    return match ? (
      <li key={key} className="list-disc list-inside ml-4 text-[var(--text-primary)]">
        {parseInlineMarkdown(match[1])}
      </li>
    ) : null;
  }
  
  // Listas ordenadas
  if (patterns.orderedList.test(text)) {
    const match = text.match(patterns.orderedList);
    return match ? (
      <li key={key} className="list-decimal list-inside ml-4 text-[var(--text-primary)]">
        {parseInlineMarkdown(match[1])}
      </li>
    ) : null;
  }
  
  // Parágrafo comum
  return (
    <p key={key} className="whitespace-pre-wrap text-[var(--text-primary)] leading-relaxed [overflow-wrap:anywhere] break-words">
      {parseInlineMarkdown(text)}
    </p>
  );
}

type MarkdownRendererProps = {
  text: string;
};

export function MarkdownRenderer({ text }: MarkdownRendererProps) {
  if (!text || !text.trim()) {
    return null;
  }
  
  // Dividir por linhas em branco (2+ newlines)
  const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  
  return (
    <div className="space-y-2 text-[14.5px] leading-relaxed [overflow-wrap:anywhere] break-words">
      {blocks.map((block, index) => {
        // Verificar se é uma lista (múltiplas linhas começando com - ou 1.)
        const lines = block.split('\n');
        const isUnorderedList = lines.every(l => patterns.unorderedList.test(l.trim()));
        const isOrderedList = lines.every(l => patterns.orderedList.test(l.trim()));
        
        if (isUnorderedList) {
          return (
            <ul key={index} className="space-y-1">
              {lines.map((line, li) => {
                const match = line.match(patterns.unorderedList);
                return match ? (
                  <li key={li} className="list-disc list-inside ml-4 text-[var(--text-primary)]">
                    {parseInlineMarkdown(match[1])}
                  </li>
                ) : null;
              })}
            </ul>
          );
        }
        
        if (isOrderedList) {
          return (
            <ol key={index} className="space-y-1">
              {lines.map((line, li) => {
                const match = line.match(patterns.orderedList);
                return match ? (
                  <li key={li} className="list-decimal list-inside ml-4 text-[var(--text-primary)]">
                    {parseInlineMarkdown(match[1])}
                  </li>
                ) : null;
              })}
            </ol>
          );
        }
        
        // Para cada linha individual no bloco
        return lines.map((line, li) => {
          const trimmed = line.trim();
          if (!trimmed) return null;
          return parseBlock(trimmed, `${index}-${li}`);
        });
      })}
    </div>
  );
}

export default memo(MarkdownRenderer);
