"use client";

import "chart.js/auto";
import { Line } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";

type DataPoint = { recordedAt: string; distanceMm: number | null };
type PredictedPoint = { recordedAt: string; distanceMm: number };

function mmToCm(mm: number): number {
  return mm / 10;
}

function formatTimeLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

/** Moving average over actualValues (number | null)[]. For each index, average non-null values in window; null if none. */
function smoothedActual(actualValues: (number | null)[], window: number): (number | null)[] {
  if (window < 1) return actualValues.map(() => null);
  const half = Math.floor(window / 2);
  return actualValues.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(actualValues.length, i + half + 1);
    const slice = actualValues.slice(start, end).filter((v): v is number => v != null);
    return slice.length > 0 ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
  });
}

export function FermentationChart({
  data,
  predictedData = null,
  showSmoothedActual = false,
  height = 400,
}: {
  data: DataPoint[] | null;
  predictedData?: PredictedPoint[] | null;
  showSmoothedActual?: boolean;
  height?: number;
}) {
  const hasActual = data && data.length > 0;
  const actualWithValues = hasActual
    ? (data!.filter((d) => d.distanceMm != null) as { recordedAt: string; distanceMm: number }[])
    : [];
  const hasPredicted = predictedData && predictedData.length > 0;

  if (!hasActual && !hasPredicted) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-lg border border-stone-200 bg-stone-50/50 text-sm text-stone-500">
        No data
      </div>
    );
  }

  const labels: string[] = [];
  const actualValues: (number | null)[] = [];
  const predictedValues: number[] = [];

  if (hasPredicted && predictedData) {
    const predTimes = predictedData.map((d) => new Date(d.recordedAt).getTime());
    for (let i = 0; i < predictedData.length; i++) {
      labels.push(formatTimeLabel(predictedData[i].recordedAt));
      predictedValues.push(mmToCm(predictedData[i].distanceMm));
      const t = predTimes[i];
      const closest = actualWithValues.length
        ? actualWithValues.reduce((best, r) => {
            const d = Math.abs(new Date(r.recordedAt).getTime() - t);
            return d < best.d ? { d, value: mmToCm(r.distanceMm) } : best;
          }, { d: Infinity, value: null as number | null })
        : { d: Infinity, value: null as number | null };
      actualValues.push(closest.d <= 15 * 60 * 1000 ? closest.value : null);
    }
  } else {
    actualWithValues.forEach((d) => {
      labels.push(formatTimeLabel(d.recordedAt));
      actualValues.push(mmToCm(d.distanceMm));
      predictedValues.push(0);
    });
  }

  const smoothedValues = showSmoothedActual ? smoothedActual(actualValues, 5) : null;

  const datasets: { label: string; data: (number | null)[]; borderColor: string; backgroundColor?: string; borderDash?: number[]; tension: number; pointRadius: number; pointHoverRadius: number }[] = [
    {
      label: "Actual height",
      data: actualValues,
      borderColor: "rgb(75, 192, 192)",
      backgroundColor: "rgba(75, 192, 192, 0.1)",
      tension: 0.2,
      pointRadius: 2,
      pointHoverRadius: 5,
    },
    ...(showSmoothedActual && smoothedValues
      ? [
          {
            label: "Smoothed actual",
            data: smoothedValues,
            borderColor: "rgb(34, 163, 163)",
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 3,
          },
        ]
      : []),
    ...(hasPredicted
      ? [
          {
            label: "Prediction",
            data: predictedValues,
            borderColor: "rgb(153, 102, 255)",
            borderDash: [5, 5],
            tension: 0.2,
            pointRadius: 0,
            pointHoverRadius: 0,
          },
        ]
      : []),
  ];

  const chartData = { labels, datasets };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    scales: {
      x: {
        title: { display: true, text: "Time (local)" },
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
            const label = ctx.dataset.label || "";
            const value = ctx.parsed.y;
            return value != null ? `${label}: ${Number(value).toFixed(2)} cm` : label;
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
