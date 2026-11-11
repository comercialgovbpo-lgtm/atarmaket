/**
 * Gráficos leves em SVG/HTML (sem dependências). Série única → sem legenda; o título nomeia a série.
 * Marcas finas com cantos arredondados, grade recessiva, valores em tinta de texto (não na cor da série),
 * tooltip por marca (title + foco) e tabela alternativa para acessibilidade.
 */
const SERIES = "#1d55d6"; // azul de ação (passo 600)

export function BarList({ data, format = (v: number) => v.toLocaleString("pt-BR") }: { data: { label: string; value: number }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2.5" role="list">
      {data.map((d) => (
        <li key={d.label} className="group grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm" title={`${d.label}: ${format(d.value)}`}>
          <span className="truncate text-slate-600">{d.label}</span>
          <span className="h-2.5 rounded-full bg-slate-100">
            <span className="block h-2.5 rounded-full transition-opacity group-hover:opacity-80" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: SERIES }} />
          </span>
          <span className="tabular text-right font-medium text-slate-900">{format(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function ColumnChart({ data, height = 180, format = (v: number) => v.toLocaleString("pt-BR"), label }: { data: { label: string; value: number }[]; height?: number; format?: (v: number) => string; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = Math.max(1, data.length);
  const W = 600, padB = 28, padT = 22, gap = 2;
  const bw = (W - gap * (n - 1)) / n;
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label={label}>
        {ticks.map((t) => {
          const y = padT + (height - padT - padB) * (1 - t / max);
          return <g key={t}><line x1={0} x2={W} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={1} /><text x={0} y={y - 3} fontSize={18} fill="#64748b">{format(t)}</text></g>;
        })}
        {data.map((d, i) => {
          const h = Math.max(d.value > 0 ? 2 : 0, ((height - padT - padB) * d.value) / max);
          const x = i * (bw + gap);
          const y = height - padB - h;
          return (
            <g key={d.label} className="group" tabIndex={0}>
              <title>{`${d.label}: ${format(d.value)}`}</title>
              <rect x={x} y={padT} width={bw} height={height - padT - padB} fill="transparent" />
              <path d={`M${x},${y + h} V${y + Math.min(4, h)} Q${x},${y} ${x + Math.min(4, bw / 2)},${y} H${x + bw - Math.min(4, bw / 2)} Q${x + bw},${y} ${x + bw},${y + Math.min(4, h)} V${y + h} Z`} fill={SERIES} className="transition-opacity group-hover:opacity-75" />
              {(n <= 6 || i % Math.ceil(n / 6) === 0) && <text x={x + bw / 2} y={height - 2} fontSize={18} textAnchor="middle" fill="#64748b">{d.label}</text>}
            </g>
          );
        })}
      </svg>
      <details className="mt-1 text-xs text-slate-500">
        <summary className="cursor-pointer">Ver dados em tabela</summary>
        <table className="mt-2 w-full"><tbody>{data.map((d) => <tr key={d.label}><td className="py-0.5">{d.label}</td><td className="tabular text-right">{format(d.value)}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}
