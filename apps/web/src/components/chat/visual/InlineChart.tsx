"use client";

import { useMemo } from "react";
import type { ChartSpec } from "@/lib/chat/visualBlocks";

/**
 * Graficos inline do chat — SVG puro, responsivo, sem dependencias externas.
 * Renderiza SOMENTE o spec validado (dados reais); sem estado fake.
 */

const PALETTE = [
  "var(--selo)", "#9CD9C2", "#2FA76F", "#5FA88C", "#7FD4AE",
  "#3E8E68", "#BFE8D6", "#2E5C4C", "#8FE0C0", "#5CC294",
  "#CFF3E4", "#4CA985",
];

function colorAt(i: number): string {
  return PALETTE[i % PALETTE.length];
}

function formatValue(value: number, unit?: string): string {
  const abs = Math.abs(value);
  let text: string;
  if (abs >= 1_000_000) text = `${(value / 1_000_000).toFixed(1).replace(".0", "")}M`;
  else if (abs >= 1_000) text = `${(value / 1_000).toFixed(1).replace(".0", "")}k`;
  else if (Number.isInteger(value)) text = String(value);
  else text = value.toFixed(1);
  return unit ? `${text}${unit}` : text;
}

function describe(spec: ChartSpec): string {
  const summary = spec.data
    .slice(0, 4)
    .map((d) => `${d.label}: ${formatValue(d.value, spec.unit)}`)
    .join("; ");
  const extra = spec.data.length > 4 ? `; e mais ${spec.data.length - 4}` : "";
  return `Gráfico ${spec.chartType === "metric" ? "de indicadores" : spec.chartType}${spec.title ? `: ${spec.title}` : ""}. ${summary}${extra}.`;
}

function BarChart({ spec }: { spec: ChartSpec }) {
  const W = 340; const H = 190; const P = { l: 34, r: 10, t: 14, b: 30 };
  const { bars, ticks } = useMemo(() => {
    const max = Math.max(...spec.data.map((d) => d.value), 0.000001);
    const min = Math.min(...spec.data.map((d) => d.value), 0);
    const lo = min < 0 ? min : 0;
    const span = max - lo || 1;
    const n = spec.data.length;
    const slot = (W - P.l - P.r) / n;
    const bw = Math.min(slot * 0.62, 42);
    const bars = spec.data.map((d, i) => {
      const h = ((d.value - lo) / span) * (H - P.t - P.b);
      const x = P.l + slot * i + (slot - bw) / 2;
      const y = H - P.b - h;
      return { x, y, w: bw, h: Math.max(h, 2), d, cx: P.l + slot * i + slot / 2 };
    });
    const ticks = [0, 0.5, 1].map((f) => ({
      y: H - P.b - f * (H - P.t - P.b),
      label: formatValue(lo + f * span, spec.unit),
    }));
    return { bars, ticks };
  }, [spec]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="presentation">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={P.l} x2={W - P.r} y1={t.y} y2={t.y} stroke="var(--border)" strokeDasharray="2 3" strokeWidth="1" />
          <text x={P.l - 6} y={t.y + 3} textAnchor="end" fontSize="8.5" fill="var(--text-muted)">{t.label}</text>
        </g>
      ))}
      {bars.map((b, i) => (
        <g key={`b-${i}`}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="3" fill={colorAt(i)} opacity="0.9" />
          <text x={b.cx} y={b.y - 4} textAnchor="middle" fontSize="8.5" fill="var(--text-secondary)">
            {formatValue(b.d.value, spec.unit)}
          </text>
          <text x={b.cx} y={H - P.b + 12} textAnchor="middle" fontSize="8.5" fill="var(--text-muted)">
            {b.d.label.length > 9 ? b.d.label.slice(0, 8) + "…" : b.d.label}
          </text>
        </g>
      ))}
      <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} stroke="var(--border-strong)" strokeWidth="1" />
    </svg>
  );
}

function LineChart({ spec }: { spec: ChartSpec }) {
  const W = 340; const H = 190; const P = { l: 34, r: 12, t: 14, b: 26 };
  const { path, area, points, ticks } = useMemo(() => {
    const values = spec.data.map((d) => d.value);
    const max = Math.max(...values);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    const n = spec.data.length;
    const px = (i: number) => (n === 1 ? (P.l + W - P.r) / 2 : P.l + ((W - P.l - P.r) * i) / (n - 1));
    const py = (v: number) => H - P.b - ((v - min) / span) * (H - P.t - P.b);
    const points = spec.data.map((d, i) => ({ x: px(i), y: py(d.value), d }));
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area = `${path} L${points[points.length - 1].x.toFixed(1)} ${H - P.b} L${points[0].x.toFixed(1)} ${H - P.b} Z`;
    const ticks = [0, 0.5, 1].map((f) => ({
      y: H - P.b - f * (H - P.t - P.b),
      label: formatValue(min + f * span, spec.unit),
    }));
    return { path, area, points, ticks };
  }, [spec]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="presentation">
      <defs>
        <linearGradient id="plutao-line-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--selo)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--selo)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={P.l} x2={W - P.r} y1={t.y} y2={t.y} stroke="var(--border)" strokeDasharray="2 3" strokeWidth="1" />
          <text x={P.l - 6} y={t.y + 3} textAnchor="end" fontSize="8.5" fill="var(--text-muted)">{t.label}</text>
        </g>
      ))}
      <path d={area} fill="url(#plutao-line-fill)" />
      <path d={path} fill="none" stroke="var(--selo)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={`p-${i}`}>
          <circle cx={p.x} cy={p.y} r="3" fill="var(--selo)" stroke="var(--bg)" strokeWidth="1.5" />
          {(i === 0 || i === points.length - 1 || points.length <= 6) && (
            <text
              x={Math.min(Math.max(p.x, P.l + 14), W - P.r - 14)}
              y={p.y - 8}
              textAnchor="middle"
              fontSize="8.5"
              fill="var(--text-secondary)"
            >
              {formatValue(p.d.value, spec.unit)}
            </text>
          )}
          {(i === 0 || i === points.length - 1 || points.length <= 6) && (
            <text x={p.x} y={H - P.b + 12} textAnchor="middle" fontSize="8.5" fill="var(--text-muted)">
              {p.d.label.length > 9 ? p.d.label.slice(0, 8) + "…" : p.d.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, rOuter, a0);
  const [x1, y1] = polar(cx, cy, rOuter, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  if (rInner <= 0) {
    return `M${cx} ${cy} L${x0.toFixed(2)} ${y0.toFixed(2)} A${rOuter} ${rOuter} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
  }
  const [xi1, yi1] = polar(cx, cy, rInner, a1);
  const [xi0, yi0] = polar(cx, cy, rInner, a0);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${rOuter} ${rOuter} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${xi1.toFixed(2)} ${yi1.toFixed(2)} A${rInner} ${rInner} 0 ${large} 0 ${xi0.toFixed(2)} ${yi0.toFixed(2)} Z`;
}

function PieChart({ spec, donut }: { spec: ChartSpec; donut: boolean }) {
  const total = spec.data.reduce((s, d) => s + Math.max(d.value, 0), 0) || 1;
  let acc = 0;
  const slices = spec.data.map((d, i) => {
    const frac = Math.max(d.value, 0) / total;
    const a0 = acc * 360;
    acc += frac;
    const a1 = acc * 360;
    return { d, i, a0, a1, pct: Math.round(frac * 100) };
  });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-3">
      <svg viewBox="0 0 140 140" className="w-36 h-36 shrink-0" role="presentation">
        {slices.map((s) => (
          <path
            key={s.i}
            d={arcPath(70, 70, 66, donut ? 38 : 0, s.a0, Math.max(s.a1, s.a0 + 0.5))}
            fill={colorAt(s.i)}
            opacity="0.92"
          />
        ))}
        {donut && (
          <text x="70" y="74" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text-primary)">
            {formatValue(total, spec.unit)}
          </text>
        )}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1">
        {slices.map((s) => (
          <li key={s.i} className="flex items-center gap-2 text-[11px] min-w-0">
            <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: colorAt(s.i) }} aria-hidden />
            <span className="truncate text-[var(--text-primary)]">{s.d.label}</span>
            <span className="ml-auto shrink-0 font-mono text-[var(--text-muted)]">
              {formatValue(s.d.value, spec.unit)} · {s.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetricChart({ spec }: { spec: ChartSpec }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {spec.data.map((d, i) => (
        <div
          key={`m-${i}`}
          className="rounded-xl border border-[var(--border)]/50 bg-[var(--base)]/50 px-3 py-2.5 min-w-0"
        >
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] truncate">{d.label}</p>
          <p className="text-lg font-semibold text-[var(--text-primary)] tabular-nums leading-tight mt-0.5">
            {formatValue(d.value, spec.unit)}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * Grafico inline da conversa: bar, line, pie, donut ou metric.
 * Inclui fallback acessivel (tabela de valores) e estado de erro real.
 */
export function InlineChart({ spec }: { spec: ChartSpec }) {
  if (!spec.data || spec.data.length === 0) {
    return (
      <div className="my-3 rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/5 px-3 py-2.5 text-[11px] text-[var(--danger)]" role="alert">
        Não foi possível renderizar o gráfico: dados ausentes ou inválidos.
      </div>
    );
  }

  return (
    <figure className="my-3 rounded-xl border border-[var(--border)]/50 bg-[var(--base)]/40 px-3.5 py-3 overflow-hidden">
      {spec.title ? (
        <figcaption className="text-[12px] font-semibold text-[var(--text-primary)] mb-2 truncate">
          {spec.title}
        </figcaption>
      ) : null}
      <div role="img" aria-label={describe(spec)}>
        {spec.chartType === "bar" ? <BarChart spec={spec} /> : null}
        {spec.chartType === "line" ? <LineChart spec={spec} /> : null}
        {spec.chartType === "pie" ? <PieChart spec={spec} donut={false} /> : null}
        {spec.chartType === "donut" ? <PieChart spec={spec} donut /> : null}
        {spec.chartType === "metric" ? <MetricChart spec={spec} /> : null}
      </div>
      <details className="mt-2 text-[10px] text-[var(--text-muted)]">
        <summary className="cursor-pointer select-none hover:text-[var(--text-secondary)]">Dados do gráfico</summary>
        <table className="mt-1.5 w-full text-left font-mono">
          <tbody>
            {spec.data.map((d, i) => (
              <tr key={i}>
                <td className="py-0.5 pr-3 truncate max-w-[160px]">{d.label}</td>
                <td className="py-0.5 tabular-nums text-right">{formatValue(d.value, spec.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
