"use client";

import "chart.js/auto";
import { Line } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";

type Point = { tempC: number; timeToPeakMinutes: number };

export function StarterPerformanceChart({
  actualPoints,
  modelCurve,
  height = 280,
}: {
  actualPoints: Point[];
  modelCurve: Point[];
  height?: number;
}) {
  const actualSorted = [...actualPoints]
    .filter((p) => p.tempC != null && p.timeToPeakMinutes != null)
    .sort((a, b) => a.tempC - b.tempC);
  const curveSorted = [...modelCurve].sort((a, b) => a.tempC - b.tempC);

  const datasets: {
    label: string;
    data: { x: number; y: number }[];
    borderColor: string;
    backgroundColor?: string;
    pointRadius: number;
    tension: number;
  }[] = [];
  if (curveSorted.length > 0) {
    datasets.push({
      label: "Model curve",
      data: curveSorted.map((p) => ({ x: p.tempC, y: p.timeToPeakMinutes })),
      borderColor: "rgb(99, 102, 241)",
      tension: 0.3,
      pointRadius: 0,
    });
  }
  if (actualSorted.length > 0) {
    datasets.push({
      label: "Actual (cycles)",
      data: actualSorted.map((p) => ({ x: p.tempC, y: p.timeToPeakMinutes })),
      borderColor: "rgb(34, 197, 94)",
      backgroundColor: "rgba(34, 197, 94, 0.2)",
      pointRadius: 5,
      tension: 0,
    });
  }

  if (datasets.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-stone-200 bg-stone-50/50 text-sm text-stone-500" style={{ height }}>
        No data
      </div>
    );
  }

  const chartData = { datasets };
  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: false },
    scales: {
      x: {
        type: "linear",
        title: { display: true, text: "Temp (°C)" },
        grid: { display: true, color: "rgba(0,0,0,0.06)" },
        min: 14,
        max: 29,
      },
      y: {
        beginAtZero: false,
        title: { display: true, text: "Time to peak (min)" },
        grid: { display: true, color: "rgba(0,0,0,0.06)" },
      },
    },
    plugins: {
      legend: { display: true, position: "top" },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const x = ctx.parsed.x;
            const y = ctx.parsed.y;
            return x != null && y != null ? `${ctx.dataset.label}: ${Number(x).toFixed(1)}°C → ${Number(y).toFixed(0)} min` : "";
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
