"use client";

import "chart.js/auto";
import { Line } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";

export type SeriesPoint = { recordedAt: string; heightMm: number };

const SERIES_COLORS: Record<string, { border: string; dash?: number[] }> = {
  rawSeries: { border: "rgb(156, 163, 175)" },
  cleanedSeries: { border: "rgb(75, 192, 192)" },
  smoothedSeries: { border: "rgb(34, 163, 163)" },
  fittedSeries: { border: "rgb(234, 179, 8)" },
  predictedSeries: { border: "rgb(153, 102, 255)", dash: [5, 5] },
};

function formatTimeLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function mmToCm(mm: number): number {
  return mm / 10;
}

export function CycleDebugChart({
  series,
  enabled,
  height = 400,
}: {
  series: Record<string, SeriesPoint[] | null>;
  enabled: Record<string, boolean>;
  height?: number;
}) {
  const allTimes = new Set<string>();
  for (const data of Object.values(series)) {
    if (data) for (const p of data) allTimes.add(p.recordedAt);
  }
  const sortedTimes = [...allTimes].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const labels = sortedTimes.map(formatTimeLabel);

  const datasets = Object.entries(series)
    .filter(([key, data]) => data != null && data.length > 0 && enabled[key])
    .map(([key, data]) => {
      const timeToVal = new Map((data ?? []).map((p) => [p.recordedAt, mmToCm(p.heightMm)]));
      const values = sortedTimes.map((t) => timeToVal.get(t) ?? null);
      const style = SERIES_COLORS[key] ?? { border: "rgb(100,100,100)" };
      return {
        label: key.replace("Series", ""),
        data: values,
        borderColor: style.border,
        borderDash: style.dash ?? undefined,
        tension: 0.2,
        pointRadius: key === "rawSeries" || key === "cleanedSeries" ? 2 : 0,
        pointHoverRadius: 5,
      };
    });

  if (datasets.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-lg border border-stone-200 bg-stone-50/50 text-sm text-stone-500">
        Enable at least one series
      </div>
    );
  }

  const chartData = { labels, datasets };
  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    scales: {
      x: {
        title: { display: true, text: "Time" },
        grid: { display: true, color: "rgba(0,0,0,0.06)" },
      },
      y: {
        beginAtZero: false,
        title: { display: true, text: "Height (cm)" },
        grid: { display: true, color: "rgba(0,0,0,0.06)" },
      },
    },
    plugins: {
      legend: { display: true, position: "top" },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const v = ctx.parsed.y;
            return v != null ? `${ctx.dataset.label}: ${Number(v).toFixed(2)} cm` : "";
          },
        },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Line data={chartData} options={options} />
    </div>
  );
}
