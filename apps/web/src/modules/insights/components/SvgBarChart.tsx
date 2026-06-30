interface DataPoint { label: string; value: number }

interface SvgBarChartProps {
  data:    DataPoint[];
  yLabel?: string;
  color?:  string;
  formatY?: (n: number) => string;
}

const MARGIN = { top: 16, right: 16, bottom: 36, left: 56 };
const VIEW_W = 700;
const VIEW_H = 200;
const PLOT_W = VIEW_W - MARGIN.left - MARGIN.right;
const PLOT_H = VIEW_H - MARGIN.top - MARGIN.bottom;

export function SvgBarChart({ data, yLabel, color = '#3b82f6', formatY }: SvgBarChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
        Ingen data tillgänglig
      </div>
    );
  }

  const maxVal  = Math.max(...data.map((d) => d.value), 1);
  const step    = Math.ceil(maxVal / 4);
  const yMax    = step * 4;
  const barW    = Math.max(4, (PLOT_W / data.length) * 0.6);
  const gap     = PLOT_W / data.length;
  const gridLines = Array.from({ length: 5 }, (_, i) => i * step);

  function bx(i: number): number { return MARGIN.left + i * gap + gap / 2 - barW / 2; }
  function py(v: number): number { return MARGIN.top + PLOT_H - (v / yMax) * PLOT_H; }

  const fmt = formatY ?? ((n: number) => n.toLocaleString('sv-SE'));

  return (
    <div className="w-full">
      {yLabel && <p className="text-xs text-muted-foreground mb-1">{yLabel}</p>}
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full h-auto" style={{ maxHeight: 200 }} aria-hidden>

        {/* Grid lines + Y labels */}
        {gridLines.map((v) => (
          <g key={v}>
            <line
              x1={MARGIN.left} y1={py(v)}
              x2={MARGIN.left + PLOT_W} y2={py(v)}
              stroke="currentColor" strokeOpacity={0.1} strokeWidth={1}
            />
            <text
              x={MARGIN.left - 6} y={py(v) + 4}
              textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.45}
            >
              {fmt(v)}
            </text>
          </g>
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const barH = ((d.value / yMax) * PLOT_H) || 0;
          const x = bx(i);
          const y = py(d.value);
          return (
            <g key={i}>
              <rect
                x={x} y={y}
                width={barW} height={Math.max(barH, 1)}
                fill={color} fillOpacity={0.85}
                rx={2}
              />
              {/* Value label on top of bar (only if bar is tall enough) */}
              {barH > 20 && (
                <text
                  x={x + barW / 2} y={y - 3}
                  textAnchor="middle" fontSize={9} fill={color} fillOpacity={0.8}
                >
                  {fmt(d.value)}
                </text>
              )}
            </g>
          );
        })}

        {/* X labels */}
        {data.map((d, i) => (
          <text
            key={i}
            x={bx(i) + barW / 2} y={VIEW_H - 6}
            textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.5}
          >
            {d.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
