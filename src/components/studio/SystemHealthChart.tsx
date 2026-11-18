import React, { useId, useMemo, useState } from 'react';
import * as d3 from 'd3';

export interface HealthChartPoint {
  timestamp: number;
  value: number;
  detail?: string;
}

interface SystemHealthChartProps {
  title: string;
  subtitle: string;
  unit?: string;
  color: string;
  data: HealthChartPoint[];
  testId?: string;
  peakValue?: number;
  avgValue?: number;
}

const CHART_WIDTH = 336;
const CHART_HEIGHT = 138;
const MARGIN = { top: 12, right: 12, bottom: 22, left: 32 };
const INNER_W = CHART_WIDTH - MARGIN.left - MARGIN.right;
const INNER_H = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

export const SystemHealthChart: React.FC<SystemHealthChartProps> = ({
  title,
  subtitle,
  unit = '%',
  color,
  data,
  testId,
  peakValue,
  avgValue,
}) => {
  const gradId = useId().replace(/:/g, '');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const safeData = useMemo(
    () =>
      data.map((d, index) => ({
        index,
        timestamp: d.timestamp,
        value: Math.min(100, Math.max(0, Number.isFinite(d.value) ? d.value : 0)),
        detail: d.detail,
      })),
    [data]
  );

  const latest = safeData.length > 0 ? safeData[safeData.length - 1] : null;
  const inspected =
    hoverIndex !== null && hoverIndex >= 0 && hoverIndex < safeData.length
      ? safeData[hoverIndex]
      : null;

  const { linePath, areaPath, points, avgY, yTicks } = useMemo(() => {
    const xScale = d3
      .scaleLinear()
      .domain([0, Math.max(1, safeData.length - 1)])
      .range([0, INNER_W]);

    const yScale = d3.scaleLinear().domain([0, 100]).range([INNER_H, 0]);

    const lineGen = d3
      .line<(typeof safeData)[number]>()
      .x((d) => xScale(d.index))
      .y((d) => yScale(d.value))
      .curve(d3.curveMonotoneX);

    const areaGen = d3
      .area<(typeof safeData)[number]>()
      .x((d) => xScale(d.index))
      .y0(INNER_H)
      .y1((d) => yScale(d.value))
      .curve(d3.curveMonotoneX);

    const computedLine = safeData.length >= 2 ? lineGen(safeData) ?? '' : '';
    const computedArea = safeData.length >= 2 ? areaGen(safeData) ?? '' : '';
    const pts = safeData.map((d) => ({
      ...d,
      cx: xScale(d.index),
      cy: yScale(d.value),
    }));

    return {
      linePath: computedLine,
      areaPath: computedArea,
      points: pts,
      avgY: typeof avgValue === 'number' ? yScale(Math.min(100, Math.max(0, avgValue))) : null,
      yTicks: [0, 50, 100].map((v) => ({ value: v, y: yScale(v) })),
    };
  }, [safeData, avgValue]);

  const activePoint = inspected ? points[inspected.index] : points[points.length - 1];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (safeData.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * CHART_WIDTH - MARGIN.left;
    const clamped = Math.max(0, Math.min(INNER_W, svgX));
    const ratio = clamped / INNER_W;
    const idx = Math.round(ratio * (safeData.length - 1));
    setHoverIndex(idx);
  };

  return (
    <div
      data-testid={testId}
      className="p-3.5 rounded-xl bg-[#12161B] border border-white/10 flex flex-col gap-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
            />
            <h3 className="text-xs font-semibold text-[#EDF5FF] truncate">{title}</h3>
          </div>
          <p className="text-[11px] text-[#8793A3] truncate mt-0.5">{subtitle}</p>
        </div>

        <div className="text-right shrink-0">
          <div className="font-mono-tabular text-sm font-semibold text-[#EDF5FF]">
            {inspected ? `${inspected.value.toFixed(1)}${unit}` : latest ? `${latest.value.toFixed(1)}${unit}` : '—'}
          </div>
          <div className="text-[10px] font-mono-tabular text-[#8793A3]">
            {inspected
              ? new Date(inspected.timestamp).toLocaleTimeString([], {
                  hour12: false,
                  minute: '2-digit',
                  second: '2-digit',
                })
              : typeof peakValue === 'number'
                ? `Peak ${peakValue.toFixed(1)}${unit}`
                : `${safeData.length} pts`}
          </div>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="w-full h-auto overflow-visible select-none"
          role="img"
          aria-label={`${title} D3.js real-time line chart`}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={`area-${gradId}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.34" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
            {/* Horizontal Y-axis gridlines */}
            {yTicks.map((tick) => (
              <g key={tick.value}>
                <line
                  x1={0}
                  x2={INNER_W}
                  y1={tick.y}
                  y2={tick.y}
                  stroke="rgba(255,255,255,0.07)"
                  strokeDasharray={tick.value === 0 ? undefined : '2 3'}
                />
                <text
                  x={-6}
                  y={tick.y + 3}
                  textAnchor="end"
                  fill="#8793A3"
                  fontSize={9}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {tick.value}
                </text>
              </g>
            ))}

            {/* Average reference line */}
            {avgY !== null && safeData.length >= 2 && (
              <line
                x1={0}
                x2={INNER_W}
                y1={avgY}
                y2={avgY}
                stroke={color}
                strokeOpacity={0.35}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            )}

            {/* D3 area fill */}
            {areaPath && (
              <path
                d={areaPath}
                fill={`url(#area-${gradId})`}
                data-d3-area="true"
              />
            )}

            {/* D3 smooth monotone line */}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                data-d3-line="true"
              />
            )}

            {/* Hover vertical guide & active sample marker */}
            {activePoint && (
              <>
                {inspected && (
                  <line
                    x1={activePoint.cx}
                    x2={activePoint.cx}
                    y1={0}
                    y2={INNER_H}
                    stroke="rgba(255,255,255,0.25)"
                    strokeWidth={1}
                  />
                )}
                <circle
                  cx={activePoint.cx}
                  cy={activePoint.cy}
                  r={5.5}
                  fill={color}
                  fillOpacity={0.2}
                />
                <circle
                  cx={activePoint.cx}
                  cy={activePoint.cy}
                  r={2.8}
                  fill="#EDF5FF"
                  stroke={color}
                  strokeWidth={1.6}
                />
              </>
            )}

            {/* Baseline timestamp hints */}
            <text
              x={0}
              y={INNER_H + 14}
              fill="#8793A3"
              fontSize={9}
              fontFamily="JetBrains Mono, monospace"
            >
              -{Math.max(0, Math.round((safeData.length - 1) * 1.5))}s
            </text>
            <text
              x={INNER_W}
              y={INNER_H + 14}
              textAnchor="end"
              fill="#8793A3"
              fontSize={9}
              fontFamily="JetBrains Mono, monospace"
            >
              now
            </text>
          </g>
        </svg>
      </div>

      {inspected?.detail && (
        <div className="text-[10px] font-mono-tabular text-[#8793A3] truncate border-t border-white/6 pt-1.5">
          {inspected.detail}
        </div>
      )}
    </div>
  );
};
