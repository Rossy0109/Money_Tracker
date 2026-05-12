'use client';
/**
 * components/FinancialChart.jsx
 * Optimized Chart.js wrapper using react-chartjs-2.
 * Fixes Audit Issue #11: Uses internal state management for updates instead of destroy/new.
 */
import { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

export default function FinancialChart({ type = 'line', data, options }) {
  const chartRef = useRef(null);

  // We rely on react-chartjs-2's internal optimization which uses chart.update()
  // when the data prop changes, satisfying the audit requirement.
  
  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    ...options
  };

  return (
    <div className="w-full h-full min-h-[300px]">
      {type === 'line' ? (
        <Line ref={chartRef} data={data} options={defaultOptions} />
      ) : (
        <Doughnut ref={chartRef} data={data} options={defaultOptions} />
      )}
    </div>
  );
}
