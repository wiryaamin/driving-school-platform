interface DataPoint { label: string; value: number }

interface SvgLineChartProps {
  data: DataPoint[];
  yLabel?: string;
  color?: string;
}

const MARGIN = { top: 16, right: 24, bottom: 36, left: 44 };
const VIEW_W = 700;
const VIEW_H = 240;
const PLOT_W = VIEW_W - MARGIN.left - MARGIN.right;
const PLOT_H = VIEW_H - MARGIN.top - MARGIN.bottom;

export function SvgLineChart({ data, yLabel = 'Antal elever', color = '#3b82f6' }: SvgLineChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
        Ingen data tillgänglig
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const step   = Math.ceil(maxVal / 5);
  const yMax   = step * 5;

  function px(i: number): number {
    return MARGIN.left + (data.length === 1 ? PLOT_W / 2 : i * (PLOT_W / (data.length - 1)));
  }
  function py(v: number): number {
    return MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;
  }

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${px(i)},${py(d.value)}`).join(' ');
  const fillPath =
    `M${px(0)},${py(0)} ${data.map((d, i) => `L${px(i)},${py(d.value)}`).join(' ')} L${px(data.length - 1)},${py(0)} Z`;

  const gridLines = Array.from({ length: 6 }, (_, i) => i * step);

  return (
    <div className="w-full">
      <p className="text-xs text-muted-foreground mb-1">{yLabel}</p>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-auto"
        style={{ maxHeight: 240 }}
        aria-hidden
      >
        {/* Grid lines + Y labels */}
        {gridLines.map((v) => (
          <g key={v}>
            <line
              x1={MARGIN.left}
              y1={py(v)}
              x2={MARGIN.left + PLOT_W}
              y2={py(v)}
              stroke="currentColor"
              strokeOpacity={0.1}
              strokeWidth={1}
            />
            <text
              x={MARGIN.left - 6}
              y={py(v) + 4}
              textAnchor="end"
              fontSize={11}
              fill="currentColor"
              fillOpacity={0.45}
            >
              {v}
            </text>
          </g>
        ))}

        {/* Fill */}
        <path d={fillPath} fill={color} fillOpacity={0.08} />

        {/* Line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points */}
        {data.map((d, i) => (
          <circle key={i} cx={px(i)} cy={py(d.value)} r={3} fill={color} />
        ))}

        {/* X labels */}
        {data.map((d, i) => (
          <text
            key={i}
            x={px(i)}
            y={VIEW_H - 8}
            textAnchor="middle"
            fontSize={11}
            fill="currentColor"
            fillOpacity={0.5}
          >
            {d.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
