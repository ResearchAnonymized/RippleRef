'use client';

import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

interface CodeSmellsPieChartProps {
  critical: number;
  major: number;
  minor: number;
}

export const CodeSmellsPieChart: React.FC<CodeSmellsPieChartProps> = ({ critical, major, minor }) => {
  const data = {
    labels: ['Critical', 'Major', 'Minor'],
    datasets: [
      {
        data: [critical, major, minor],
        backgroundColor: [
          '#ef4444', // red-500
          '#f97316', // orange-500
          '#eab308', // yellow-500
        ],
        borderColor: [
          '#dc2626', // red-600
          '#ea580c', // orange-600
          '#ca8a04', // yellow-600
        ],
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: '#e2e8f0', // slate-200
          font: {
            size: 12,
          },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)', // slate-900
        titleColor: '#e2e8f0',
        bodyColor: '#e2e8f0',
        borderColor: '#475569',
        borderWidth: 1,
      },
    },
  };

  return (
    <div className="relative h-full w-full max-h-64 overflow-hidden">
      <Pie data={data} options={options} />
    </div>
  );
};

interface MetricsBarChartProps {
  classes: number;
  methods: number;
  comments: number;
  lines: number;
}

export const MetricsBarChart: React.FC<MetricsBarChartProps> = ({ classes, methods, comments, lines }) => {
  const data = {
    labels: ['Classes', 'Methods', 'Comments', 'Lines'],
    datasets: [
      {
        label: 'Count',
        data: [classes, methods, comments, lines],
        backgroundColor: [
          '#3b82f6', // blue-500
          '#10b981', // emerald-500
          '#8b5cf6', // violet-500
          '#f59e0b', // amber-500
        ],
        borderColor: [
          '#2563eb', // blue-600
          '#059669', // emerald-600
          '#7c3aed', // violet-600
          '#d97706', // amber-600
        ],
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)', // slate-900
        titleColor: '#e2e8f0',
        bodyColor: '#e2e8f0',
        borderColor: '#475569',
        borderWidth: 1,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          color: '#94a3b8', // slate-400
          maxTicksLimit: 5,
        },
        grid: {
          color: '#334155', // slate-700
        },
      },
      x: {
        ticks: {
          color: '#94a3b8', // slate-400
          maxRotation: 45,
          minRotation: 0,
        },
        grid: {
          color: '#334155', // slate-700
        },
      },
    },
    layout: {
      padding: {
        top: 10,
        bottom: 10,
        left: 10,
        right: 10,
      },
    },
  };

  return (
    <div className="relative h-full w-full max-h-64 overflow-hidden">
      <Bar data={data} options={options} />
    </div>
  );
};

interface QualityGaugeProps {
  score: number;
  maxScore?: number;
  label: string;
}

export const QualityGauge: React.FC<QualityGaugeProps> = ({ score, maxScore = 100, label }) => {
  const percentage = (score / maxScore) * 100;
  
  const getColor = () => {
    if (percentage >= 80) return '#10b981'; // emerald-500
    if (percentage >= 60) return '#f59e0b'; // amber-500
    return '#ef4444'; // red-500
  };

  const getBackgroundColor = () => {
    if (percentage >= 80) return '#065f46'; // emerald-800
    if (percentage >= 60) return '#92400e'; // amber-800
    return '#991b1b'; // red-800
  };

  return (
    <div className="relative w-32 h-32 mx-auto flex-shrink-0">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
        {/* Background circle */}
        <circle
          cx="60"
          cy="60"
          r="50"
          stroke={getBackgroundColor()}
          strokeWidth="8"
          fill="none"
        />
        {/* Progress circle */}
        <circle
          cx="60"
          cy="60"
          r="50"
          stroke={getColor()}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 50}`}
          strokeDashoffset={`${2 * Math.PI * 50 * (1 - percentage / 100)}`}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-bold text-white">{score}</div>
        <div className="text-xs text-gray-400 text-center">{label}</div>
      </div>
    </div>
  );
};
