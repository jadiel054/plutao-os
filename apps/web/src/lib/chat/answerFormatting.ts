export type ResultHighlight = {
  label: "Resultado";
  content: string;
};

export type AnswerSections = {
  result: ResultHighlight | null;
  body: string;
};

const RESULT_MARKER = /^\s*(?:#{1,3}\s*)?(?:\*\*)?(?:resultado(?: final)?|conclus[aã]o|resposta direta)(?:\s*:\s*)?(?:\*\*)?\s*:?\s*(.*)$/i;
const SECTION_BOUNDARY = /^\s*(?:#{1,4}\s+|(?:\*\*)?(?:evid[eê]ncia(?:s)?|m[eé]todo|metodologia|crit[eé]rio|limita[cç][oõ]es|fontes|pr[oó]ximos passos|detalhes)(?:\*\*)?\s*:?)/i;
const MAX_RESULT_HIGHLIGHT_LENGTH = 4_000;

/**
 * Extracts only an explicitly labelled result paragraph. Ordinary prose stays
 * untouched, so visual emphasis is never inferred from arbitrary wording.
 */
export function extractAnswerSections(content: string): AnswerSections {
  if (!content.trim()) return { result: null, body: content };

  const paragraphs = content.split(/\n\s*\n/);
  const resultIndex = paragraphs.findIndex((paragraph) =>
    RESULT_MARKER.test(paragraph.split(/\r?\n/, 1)[0] ?? "")
  );
  if (resultIndex < 0) return { result: null, body: content };

  const resultParagraph = paragraphs[resultIndex] ?? "";
  const resultLines = resultParagraph.split(/\r?\n/);
  const marker = resultLines[0]?.match(RESULT_MARKER);
  if (!marker) return { result: null, body: content };

  let highlighted = [marker[1] ?? "", ...resultLines.slice(1)]
    .join("\n")
    .trim();
  const removedParagraphIndexes = new Set([resultIndex]);

  // A heading-only marker may be followed by its answer in the next paragraph.
  if (!highlighted) {
    const nextParagraph = paragraphs[resultIndex + 1];
    if (nextParagraph && !SECTION_BOUNDARY.test(nextParagraph)) {
      highlighted = nextParagraph.trim();
      removedParagraphIndexes.add(resultIndex + 1);
    }
  }

  if (!highlighted || highlighted.length > MAX_RESULT_HIGHLIGHT_LENGTH) {
    return { result: null, body: content };
  }

  const body = paragraphs
    .filter((_, index) => !removedParagraphIndexes.has(index))
    .join("\n\n")
    .trim();

  return {
    result: { label: "Resultado", content: highlighted },
    body,
  };
}

export type ParsedMarkdownTable = {
  headers: string[];
  rows: string[][];
};

function splitTableRow(line: string): string[] {
  const escapedPipe = "\u0000";
  const value = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .replace(/\\\|/g, escapedPipe);
  return value.split("|").map((cell) => cell.trim().replaceAll(escapedPipe, "|"));
}

/** Parse a Markdown table block, returning null for prose or malformed tables. */
export function parseMarkdownTableBlock(block: string): ParsedMarkdownTable | null {
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2 || !lines[0]?.includes("|") || !lines[1]?.includes("|")) {
    return null;
  }

  const headers = splitTableRow(lines[0]);
  const separators = splitTableRow(lines[1]);
  const isSeparator = (cell: string) => /^:?-{3,}:?$/.test(cell);
  if (
    headers.length === 0 ||
    headers.length !== separators.length ||
    !separators.every(isSeparator)
  ) {
    return null;
  }

  const rows = lines.slice(2).map((line) => {
    const cells = splitTableRow(line).slice(0, headers.length);
    return Array.from({ length: headers.length }, (_, index) => cells[index] ?? "");
  });

  return { headers, rows };
}
