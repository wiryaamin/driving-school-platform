interface DataPoint { label: string; value: number }

interface SvgLineChartProps {
  data:          DataPoint[];
  data2?:        DataPoint[] | undefined;
  color?:        string | undefined;
  color2?:       string | undefined;
  yLabel?:       string | undefined;
  legendLabel?:  string | undefined;
  legend2Label?: string | undefined;
}

const MARGIN = { top: 20, right: 24, bottom: 36, left: 44 };
const VIEW_W = 700;
const VIEW_H = 240;
const PLOT_W = VIEW_W - MARGIN.left - MARGIN.right;
const PLOT_H = VIEW_H - MARGIN.top - MARGIN.bottom;

export function SvgLineChart({
  data,
  data2,
  color  = '#3b82f6',
  color2 = '#f59e0b',
  yLabel = 'Antal elever',
  legendLabel,
  legend2Label,
}: SvgLineChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
        Ingen data tillgänglig
      </div>
    );
  }

  const allValues = [
    ...data.map((d) => d.value),
    ...(data2 ?? []).map((d) => d.value),
  ];
  const maxVal = Math.max(...allValues, 1);
  const step   = Math.ceil(maxVal / 5);
  const yMax   = step * 5;

  function px(i: number, len: number): number {
    return MARGIN.left + (len === 1 ? PLOT_W / 2 : i * (PLOT_W / (len - 1)));
  }
  function py(v: number): number {
    return MARGIN.top + PLOT_H - (v / yMax) * PLOT_H;
  }

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${px(i, data.length)},${py(d.value)}`).join(' ');
  const fillPath =
    `M${px(0, data.length)},${py(0)} ` +
    data.map((d, i) => `L${px(i, data.length)},${py(d.value)}`).join(' ') +
    ` L${px(data.length - 1, data.length)},${py(0)} Z`;

  const line2Path = data2
    ? data2.map((d, i) => `${i === 0 ? 'M' : 'L'}${px(i, data2.length)},${py(d.value)}`).join(' ')
    : null;

  const gridLines = Array.from({ length: 6 }, (_, i) => i * step);

  const showLegend = Boolean((legendLabel ?? data2) && legend2Label);

  return (
    <div className="w-full">
      <p className="text-xs text-muted-foreground mb-1">{yLabel}</p>

      {/* Legend */}
      {showLegend && (
        <div className="flex items-center gap-4 mb-2">
          {legendLabel && (
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-0.5 rounded-full inline-block" style={{ backgroundColor: color }} />
              <span className="text-xs text-muted-foreground">{legendLabel}</span>
            </div>
          )}
          {data2 && legend2Label && (
            <div className="flex items-center gap-1.5">
              <svg width="24" height="6" aria-hidden>
                <line x1="0" y1="3" x2="24" y2="3" stroke={color2} strokeWidth="1.75" strokeDasharray="4 2" />
              </svg>
              <span className="text-xs text-muted-foreground">{legend2Label}</span>
            </div>
          )}
        </div>
      )}

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
              x1={MARGIN.left}   y1={py(v)}
              x2={MARGIN.left + PLOT_W} y2={py(v)}
              stroke="currentColor" strokeOpacity={0.1} strokeWidth={1}
            />
            <text
              x={MARGIN.left - 6} y={py(v) + 4}
              textAnchor="end" fontSize={11} fill="currentColor" fillOpacity={0.45}
            >
              {v}
            </text>
          </g>
        ))}

        {/* Series 1: fill + line + dots */}
        <path d={fillPath} fill={color} fillOpacity={0.08} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => (
          <circle key={i} cx={px(i, data.length)} cy={py(d.value)} r={3} fill={color} />
        ))}

        {/* Series 2: dashed line + open dots */}
        {line2Path && data2 && (
          <>
            <path
              d={line2Path}
              fill="none"
              stroke={color2}
              strokeWidth={1.75}
              strokeDasharray="4 2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {data2.map((d, i) => (
              <circle
                key={i}
                cx={px(i, data2.length)} cy={py(d.value)} r={3}
                fill="var(--background, white)" stroke={color2} strokeWidth={1.5}
              />
            ))}
          </>
        )}

        {/* X labels from series 1 */}
        {data.map((d, i) => (
          <text
            key={i}
            x={px(i, data.length)} y={VIEW_H - 8}
            textAnchor="middle" fontSize={11} fill="currentColor" fillOpacity={0.5}
          >
            {d.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
