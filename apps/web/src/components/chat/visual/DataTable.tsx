"use client";

import { useState } from "react";
import { tableToChartSpec, type TableSpec } from "@/lib/chat/visualBlocks";
import { InlineChart } from "./InlineChart";

function isNumericSeries(values: string[]): boolean {
  if (values.length === 0) return false;
  return values.every((v) => {
    const t = v.trim().replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    return t !== "" && !Number.isNaN(Number(t));
  });
}

/**
 * Tabela estruturada inline: colunas/linhas reais, cabecalho fixo,
 * alinhamento numerico, scroll em conjuntos grandes e visao em grafico
 * quando ha coluna categorica + numerica.
 */
export function DataTable({ spec }: { spec: TableSpec }) {
  const [asChart, setAsChart] = useState(false);
  const chartSpec = tableToChartSpec(spec);

  return (
    <figure className="my-3 rounded-xl border border-[var(--border)]/50 bg-[var(--base)]/40 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-[var(--border)]/40">
        <figcaption className="text-[12px] font-semibold text-[var(--text-primary)] truncate min-w-0">
          {spec.title || "Tabela"}
          <span className="ml-2 text-[10px] font-normal text-[var(--text-muted)]">
            {spec.rows.length} {spec.rows.length === 1 ? "linha" : "linhas"}
          </span>
        </figcaption>
        {chartSpec ? (
          <button
            type="button"
            onClick={() => setAsChart((v) => !v)}
            className="shrink-0 rounded-lg border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] hover:text-[var(--selo)] hover:border-[var(--selo)]/50 transition-colors cursor-pointer"
            aria-pressed={asChart}
          >
            {asChart ? "Ver como tabela" : "Ver como gráfico"}
          </button>
        ) : null}
      </div>

      {asChart && chartSpec ? (
        <div className="px-3.5 py-3">
          <InlineChart spec={{ ...chartSpec, title: undefined }} />
        </div>
      ) : (
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-[1] bg-[var(--pinho)]/95 backdrop-blur-sm">
              <tr>
                {spec.columns.map((c, i) => (
                  <th
                    key={i}
                    className={`px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border)]/60 whitespace-nowrap ${isNumericSeries(spec.rows.map((r) => r[i] ?? "")) ? "text-right" : ""}`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spec.rows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 1 ? "bg-[var(--surface)]/40" : ""}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className={`px-3 py-1.5 text-[12px] text-[var(--text-secondary)] border-b border-[var(--border)]/25 whitespace-nowrap max-w-[280px] truncate ${isNumericSeries(spec.rows.map((r) => r[ci] ?? "")) ? "text-right tabular-nums text-[var(--text-primary)]" : ""}`}
                      title={cell}
                    >
                      {cell || <span className="opacity-30">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}
