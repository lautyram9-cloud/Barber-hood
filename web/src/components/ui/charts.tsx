// Gráficos livianos en SVG/HTML (sin librerías), con etiqueta accesible.

export function LineChart({ labels, values, suffix = '' }: { labels: string[]; values: number[]; suffix?: string }) {
  const W = 300, H = 120, max = Math.max(1, ...values.map((x) => Math.max(0, x))), w = W / Math.max(1, labels.length);
  const P = values.map((x, i) => [i * w + w / 2, 92 - (Math.max(0, x) / max) * 66]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={labels.map((l, i) => `${l}: ${Math.round(values[i])}${suffix}`).join(', ')}>
      <defs><linearGradient id="lc" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--color-accent)" stopOpacity=".28" /><stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" /></linearGradient></defs>
      {P.length > 1 && <polygon fill="url(#lc)" points={`${P[0][0]},96 ${P.map((p) => p.join(',')).join(' ')} ${P[P.length - 1][0]},96`} />}
      <polyline fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" points={P.map((p) => p.join(',')).join(' ')} />
      {P.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="3" fill="var(--color-bg)" stroke="var(--color-accent)" strokeWidth="2" />
          <text x={p[0]} y={p[1] - 8} fontSize="8.5" textAnchor="middle" fill="var(--color-fg)">{Math.round(values[i])}{suffix}</text>
          <text x={p[0]} y="112" fontSize="9" textAnchor="middle" fill="var(--color-subtle)">{labels[i]}</text>
        </g>
      ))}
    </svg>
  );
}

export function PairBars({ labels, a, b, format }: { labels: string[]; a: number[]; b: number[]; format(n: number): string }) {
  const max = Math.max(1, ...a, ...b);
  return (
    <div className="flex h-40 items-end gap-3" role="img" aria-label={labels.map((l, i) => `${l}: ingresos ${format(a[i])}, gastos ${format(b[i])}`).join('; ')}>
      {labels.map((l, i) => (
        <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full flex-1 items-end justify-center gap-1">
            <div className="w-1/2 max-w-5 rounded-sm bg-accent" style={{ height: `${(a[i] / max) * 100}%` }} />
            <div className="w-1/2 max-w-5 rounded-sm bg-ko/80" style={{ height: `${(b[i] / max) * 100}%` }} />
          </div>
          <span className="text-[11px] text-subtle">{l}</span>
        </div>
      ))}
    </div>
  );
}

export const kf = (x: number) => (x >= 1000 ? Math.round(x / 1000) + 'k' : String(Math.round(x)));
