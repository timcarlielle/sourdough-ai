"use client";

type DataPoint = { recordedAt: string; distanceMm: number | null };
type PredictedPoint = { recordedAt: string; distanceMm: number };

const CHART_PADDING = { top: 20, right: 12, bottom: 32, left: 44 };
const CHART_WIDTH = 300;
const TICK_FONT_SIZE = 10;
const LABEL_FONT_SIZE = 11;

/** Rise graph: time (x) vs distance mm (y). Axes, gridlines, optional predicted series. */
export function RiseGraph({
  data,
  predictedData = null,
  title,
  height = 180,
}: {
  data: DataPoint[] | null;
  predictedData?: PredictedPoint[] | null;
  title: string;
  height?: number;
}) {
  const hasActual = data && data.length > 0;
  const actualValues = hasActual
    ? (data!.map((d) => d.distanceMm).filter((v): v is number => v != null) as number[])
    : [];
  const hasActualValues = actualValues.length > 0;
  const hasPredicted = predictedData && predictedData.length > 0;

  if (!hasActual && !hasPredicted) {
    return (
      <div className="rounded border border-stone-200 bg-stone-50/50 p-4">
        {title && <h3 className="text-sm font-medium text-stone-600">{title}</h3>}
        <p className="mt-2 text-sm text-stone-500">No data</p>
      </div>
    );
  }

  if (hasActual && !hasActualValues) {
    return (
      <div className="rounded border border-stone-200 bg-stone-50/50 p-4">
        {title && <h3 className="text-sm font-medium text-stone-600">{title}</h3>}
        <p className="mt-2 text-sm text-stone-500">No rise readings</p>
      </div>
    );
  }

  const actualPoints = hasActual
    ? (data!.filter((d) => d.distanceMm != null) as { recordedAt: string; distanceMm: number }[])
    : [];
  const allPoints = [...actualPoints, ...(hasPredicted ? predictedData! : [])];
  const times = allPoints.map((p) => new Date(p.recordedAt).getTime());
  const values = allPoints.map((p) => p.distanceMm);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const tRange = tMax - tMin || 1;
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  const vRange = vMax - vMin || 1;

  const chartW = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const chartH = height - CHART_PADDING.top - CHART_PADDING.bottom;

  const toX = (t: number) =>
    CHART_PADDING.left + ((t - tMin) / tRange) * chartW;
  const toY = (v: number) =>
    CHART_PADDING.top + chartH - ((v - vMin) / vRange) * chartH;

  // Grid: 5 vertical, 5 horizontal
  const numVertical = 5;
  const numHorizontal = 5;
  const gridLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i <= numVertical; i++) {
    const x = CHART_PADDING.left + (i / numVertical) * chartW;
    gridLines.push({ x1: x, y1: CHART_PADDING.top, x2: x, y2: CHART_PADDING.top + chartH });
  }
  for (let i = 0; i <= numHorizontal; i++) {
    const y = CHART_PADDING.top + (i / numHorizontal) * chartH;
    gridLines.push({
      x1: CHART_PADDING.left,
      y1: y,
      x2: CHART_PADDING.left + chartW,
      y2: y,
    });
  }

  // Y ticks: 5 steps from vMin to vMax
  const yTicks: number[] = [];
  for (let i = 0; i <= numHorizontal; i++) {
    const v = vMin + (i / numHorizontal) * vRange;
    yTicks.push(v);
  }
  // X ticks: 5 time labels
  const xTicks: number[] = [];
  for (let i = 0; i <= numVertical; i++) {
    const t = tMin + (i / numVertical) * tRange;
    xTicks.push(t);
  }

  const formatTime = (ms: number) => {
    const d = new Date(ms);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };
  const formatMm = (v: number) =>
    v >= 100 ? Math.round(v).toString() : v.toFixed(1);

  const actualPolyline =
    actualPoints.length > 0
      ? actualPoints
          .map((d) => `${toX(new Date(d.recordedAt).getTime())},${toY(d.distanceMm)}`)
          .join(" ")
      : null;
  const predictedPolyline =
    hasPredicted && predictedData
      ? predictedData
          .map((d) => `${toX(new Date(d.recordedAt).getTime())},${toY(d.distanceMm)}`)
          .join(" ")
      : null;

  return (
    <div className="rounded border border-stone-200 bg-stone-50/50 p-4">
      {title && (
        <h3 className="text-sm font-medium text-stone-600">{title}</h3>
      )}
      <div className="mt-2 overflow-hidden rounded border border-stone-200 bg-white">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${height}`}
          className="w-full max-w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Grid */}
          {gridLines.map((line, i) => (
            <line
              key={i}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="rgba(0,0,0,0.06)"
              strokeWidth="0.5"
            />
          ))}
          <text
            x={14}
            y={height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(-90, 14, ${height / 2})`}
            fill="rgb(87 83 78)"
            fontSize={LABEL_FONT_SIZE}
            fontFamily="system-ui, sans-serif"
          >
            Height (mm)
          </text>
          {yTicks.map((v, i) => (
            <text
              key={i}
              x={CHART_PADDING.left - 6}
              y={toY(v)}
              textAnchor="end"
              dominantBaseline="middle"
              fill="rgb(87 83 78)"
              fontSize={TICK_FONT_SIZE}
              fontFamily="ui-monospace, monospace"
            >
              {formatMm(v)}
            </text>
          ))}
          {xTicks.map((t, i) => (
            <text
              key={i}
              x={toX(t)}
              y={height - 8}
              textAnchor="middle"
              dominantBaseline="auto"
              fill="rgb(87 83 78)"
              fontSize={TICK_FONT_SIZE}
              fontFamily="ui-monospace, monospace"
            >
              {formatTime(t)}
            </text>
          ))}
          <text
            x={CHART_PADDING.left + chartW / 2}
            y={height - 4}
            textAnchor="middle"
            dominantBaseline="auto"
            fill="rgb(87 83 78)"
            fontSize={LABEL_FONT_SIZE}
            fontFamily="system-ui, sans-serif"
          >
            Time
          </text>
          {predictedPolyline && (
            <polyline
              fill="none"
              stroke="rgb(147 51 234)"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              points={predictedPolyline}
            />
          )}
          {actualPolyline && (
            <polyline
              fill="none"
              stroke="rgb(59 130 246)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={actualPolyline}
            />
          )}
        </svg>
      </div>
      {(hasActualValues || hasPredicted) && (
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-stone-500">
          {hasActualValues && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded bg-blue-500" aria-hidden />
              Actual
            </span>
          )}
          {hasPredicted && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 border-b-2 border-dashed border-violet-500" aria-hidden />
              Predicted
            </span>
          )}
        </div>
      )}
    </div>
  );
}
