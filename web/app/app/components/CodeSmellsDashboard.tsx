'use client';

import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
} from 'chart.js';
import { Bar, Pie, Line } from 'react-chartjs-2';
import { Download, BarChart3, PieChart, TrendingUp, AlertTriangle, FileText, Code } from 'lucide-react';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

interface CodeSmellsDashboardProps {
  assessment: any;
  files: any[];
  workspaceId: string;
}

export default function CodeSmellsDashboard({ assessment, files, workspaceId }: CodeSmellsDashboardProps) {
  const [isExporting, setIsExporting] = React.useState(false);

  // Process data for charts
  const chartData = useMemo(() => {
    if (!assessment?.evidences) {
      return {
        smellTypeDistribution: { labels: [], datasets: [] },
        severityBreakdown: { labels: [], datasets: [] },
        filesWithMostSmells: { labels: [], datasets: [] },
        smellTrendsByFileType: { labels: [], datasets: [] }
      };
    }

    const evidences = assessment.evidences;

    // 1. Code Smell Types Distribution
    const smellTypeCounts = evidences.reduce((acc: any, evidence: any) => {
      const type = evidence.detectorId || 'Unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    const smellTypeLabels = Object.keys(smellTypeCounts);
    const smellTypeData = Object.values(smellTypeCounts);
    const smellTypeColors = [
      '#ef4444', // red - long-method
      '#8b5cf6', // purple - god-class
      '#f59e0b', // orange - duplicate-code
      '#eab308', // yellow - complex-method
      '#ec4899', // pink - long-parameter-list
      '#06b6d4', // cyan - feature-envy
      '#14b8a6', // teal - data-clumps
      '#6366f1', // indigo - primitive-obsession
      '#f43f5e', // rose - switch-statements
      '#10b981', // emerald - temporary-field
      '#8b5cf6', // violet - lazy-class
      '#f59e0b', // amber - middle-man
      '#0ea5e9', // sky - speculative-generality
      '#84cc16', // lime - message-chains
      '#dc2626', // red-600 - inappropriate-intimacy
      '#ea580c', // orange-600 - shotgun-surgery
      '#d946ef', // fuchsia-500 - divergent-change
      '#3b82f6', // blue-500 - parallel-inheritance
      '#6b7280', // gray-500 - excessive-comments
      '#991b1b', // red-800 - dead-code
      '#9333ea', // purple-600 - large-class
      '#16a34a', // green-600 - data-class
      '#ca8a04', // yellow-600 - magic-numbers
      '#0d9488', // teal-600 - string-constants
      '#db2777', // pink-600 - inconsistent-naming
      '#4f46e5', // indigo-600 - nested-conditionals
      '#f97316', // orange-500 - flag-arguments
      '#b91c1c', // red-700 - try-catch-hell
      '#4b5563', // gray-600 - null-abuse
      '#0891b2', // cyan-600 - type-embedded-name
      '#7c3aed', // purple-700 - refused-bequest
      '#7f1d1d', // red-900 - empty-catch-block
      '#c2410c', // orange-700 - resource-leak
      '#a16207', // yellow-700 - raw-types
      '#be185d', // pink-700 - circular-dependencies
      '#374151', // gray-700 - long-line
      '#115e59', // teal-700 - string-concatenation
      '#ef4444', // red-500 - generic-exception
      '#4338ca', // indigo-700 - single-letter-vars
      '#000000', // black - hardcoded-credentials
      '#10b981', // green
      '#3b82f6', // blue
      '#f97316', // orange-500
      '#84cc16', // lime
    ];

    // 2. Severity Breakdown
    const severityCounts = evidences.reduce((acc: any, evidence: any) => {
      const severity = evidence.severity || 'UNKNOWN';
      acc[severity] = (acc[severity] || 0) + 1;
      return acc;
    }, {});

    const severityLabels = Object.keys(severityCounts);
    const severityData = Object.values(severityCounts);
    const severityColors = {
      'CRITICAL': '#dc2626',
      'MAJOR': '#ea580c',
      'MINOR': '#d97706',
      'UNKNOWN': '#6b7280'
    };

    // 3. Files with Most Smells
    const fileSmellCounts = files.map(file => {
      const evidencesForFile = evidences.filter((e: any) => {
        const filePath = e.pointer?.file;
        if (!filePath) return false;
        
        const norm = (p: string) => String(p).replace(/\\\\/g, '/').toLowerCase();
        const ev = norm(filePath);
        const rel = norm(file.relativePath);
        const fileName = file.name.toLowerCase();
        
        const exactMatch = ev === rel;
        const endsWithMatch = ev.endsWith('/' + fileName) && ev.includes('src/');
        const containsMatch = ev.includes('/' + fileName) && ev.includes('src/');
        
        return exactMatch || endsWithMatch || containsMatch;
      });

      return {
        fileName: file.name,
        smellCount: evidencesForFile.length,
        filePath: file.relativePath
      };
    }).filter(f => f.smellCount > 0).sort((a, b) => b.smellCount - a.smellCount).slice(0, 10);

    // 4. Smell Trends by File Type
    const fileTypeSmellCounts = files.reduce((acc: any, file) => {
      const fileType = file.name.split('.').pop() || 'unknown';
      const evidencesForFile = evidences.filter((e: any) => {
        const filePath = e.pointer?.file;
        if (!filePath) return false;
        
        const norm = (p: string) => String(p).replace(/\\\\/g, '/').toLowerCase();
        const ev = norm(filePath);
        const rel = norm(file.relativePath);
        const fileName = file.name.toLowerCase();
        
        const exactMatch = ev === rel;
        const endsWithMatch = ev.endsWith('/' + fileName) && ev.includes('src/');
        const containsMatch = ev.includes('/' + fileName) && ev.includes('src/');
        
        return exactMatch || endsWithMatch || containsMatch;
      });

      if (!acc[fileType]) {
        acc[fileType] = { count: 0, files: 0 };
      }
      acc[fileType].count += evidencesForFile.length;
      acc[fileType].files += 1;
      return acc;
    }, {});

    const fileTypeLabels = Object.keys(fileTypeSmellCounts);
    const fileTypeData = Object.values(fileTypeSmellCounts).map((item: any) => item.count);

    return {
      smellTypeDistribution: {
        labels: smellTypeLabels,
        datasets: [{
          label: 'Code Smell Types',
          data: smellTypeData,
          backgroundColor: smellTypeColors.slice(0, smellTypeLabels.length),
          borderColor: smellTypeColors.slice(0, smellTypeLabels.length),
          borderWidth: 1
        }]
      },
      severityBreakdown: {
        labels: severityLabels,
        datasets: [{
          label: 'Severity Distribution',
          data: severityData,
          backgroundColor: severityLabels.map((label: string) => severityColors[label as keyof typeof severityColors] || '#6b7280'),
          borderColor: severityLabels.map((label: string) => severityColors[label as keyof typeof severityColors] || '#6b7280'),
          borderWidth: 1
        }]
      },
      filesWithMostSmells: {
        labels: fileSmellCounts.map(f => f.fileName),
        datasets: [{
          label: 'Code Smells Count',
          data: fileSmellCounts.map(f => f.smellCount),
          backgroundColor: '#3b82f6',
          borderColor: '#1d4ed8',
          borderWidth: 1
        }]
      },
      smellTrendsByFileType: {
        labels: fileTypeLabels,
        datasets: [{
          label: 'Total Code Smells',
          data: fileTypeData,
          backgroundColor: '#10b981',
          borderColor: '#059669',
          borderWidth: 1
        }]
      }
    };
  }, [assessment, files]);

  const exportToCSV = async () => {
    setIsExporting(true);
    try {
      // Generate comprehensive CSV with all chart data
      const headers = [
        'Metric Type',
        'Category',
        'Value',
        'Description'
      ];

      const rows = [
        // Summary statistics
        ['Total Files', 'Files', files.length, 'Total number of files analyzed'],
        ['Files with Smells', 'Files', files.filter(f => {
          const evidencesForFile = assessment?.evidences?.filter((e: any) => {
            const filePath = e.pointer?.file;
            if (!filePath) return false;
            const norm = (p: string) => String(p).replace(/\\\\/g, '/').toLowerCase();
            const ev = norm(filePath);
            const rel = norm(f.relativePath);
            const fileName = f.name.toLowerCase();
            const exactMatch = ev === rel;
            const endsWithMatch = ev.endsWith('/' + fileName) && ev.includes('src/');
            const containsMatch = ev.includes('/' + fileName) && ev.includes('src/');
            return exactMatch || endsWithMatch || containsMatch;
          }) || [];
          return evidencesForFile.length > 0;
        }).length, 'Number of files with code smells'],
        ['Total Code Smells', 'Smells', assessment?.evidences?.length || 0, 'Total number of code smell instances'],
        
        // Smell type breakdown
        ...Object.entries(chartData.smellTypeDistribution.labels.reduce((acc: any, label, index) => {
          acc[label] = chartData.smellTypeDistribution.datasets[0].data[index];
          return acc;
        }, {})).map(([type, count]) => [type, 'Smell Types', count, `Number of ${type} smells`]),
        
        // Severity breakdown
        ...Object.entries(chartData.severityBreakdown.labels.reduce((acc: any, label, index) => {
          acc[label] = chartData.severityBreakdown.datasets[0].data[index];
          return acc;
        }, {})).map(([severity, count]) => [severity, 'Severity', count, `Number of ${severity} severity issues`])
      ];

      // Escape CSV values
      const escapeCSV = (value: any) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvContent = [
        headers.map(escapeCSV).join(','),
        ...rows.map(row => row.map(escapeCSV).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `refactai-${workspaceId}-${timestamp}-dashboard-report.csv`;
      link.setAttribute('download', filename);
      
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log('Dashboard CSV export completed:', filename);
    } catch (error) {
      console.error('Dashboard CSV export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#e2e8f0'
        }
      },
      title: {
        display: true,
        color: '#e2e8f0'
      }
    },
    scales: {
      x: {
        ticks: {
          color: '#94a3b8'
        },
        grid: {
          color: '#374151'
        }
      },
      y: {
        ticks: {
          color: '#94a3b8'
        },
        grid: {
          color: '#374151'
        }
      }
    }
  };

  const pieOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          color: '#e2e8f0'
        }
      },
      title: {
        display: true,
        color: '#e2e8f0'
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Code Smells Dashboard</h1>
            <p className="text-slate-400 mt-1">
              Interactive analysis of code quality issues and patterns
            </p>
          </div>
          <button 
            onClick={exportToCSV}
            disabled={isExporting}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition-colors"
          >
            {isExporting ? (
              <Download className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{isExporting ? 'Exporting...' : 'Export Dashboard'}</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center">
              <FileText className="w-8 h-8 text-blue-400" />
              <div className="ml-4">
                <p className="text-sm text-slate-400">Total Files</p>
                <p className="text-2xl font-bold text-white">{files.length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center">
              <AlertTriangle className="w-8 h-8 text-orange-400" />
              <div className="ml-4">
                <p className="text-sm text-slate-400">Code Smells</p>
                <p className="text-2xl font-bold text-white">{assessment?.evidences?.length || 0}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center">
              <Code className="w-8 h-8 text-red-400" />
              <div className="ml-4">
                <p className="text-sm text-slate-400">Files with Issues</p>
                <p className="text-2xl font-bold text-white">
                  {files.filter(f => {
                    const evidencesForFile = assessment?.evidences?.filter((e: any) => {
                      const filePath = e.pointer?.file;
                      if (!filePath) return false;
                      const norm = (p: string) => String(p).replace(/\\\\/g, '/').toLowerCase();
                      const ev = norm(filePath);
                      const rel = norm(f.relativePath);
                      const fileName = f.name.toLowerCase();
                      const exactMatch = ev === rel;
                      const endsWithMatch = ev.endsWith('/' + fileName) && ev.includes('src/');
                      const containsMatch = ev.includes('/' + fileName) && ev.includes('src/');
                      return exactMatch || endsWithMatch || containsMatch;
                    }) || [];
                    return evidencesForFile.length > 0;
                  }).length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center">
              <BarChart3 className="w-8 h-8 text-green-400" />
              <div className="ml-4">
                <p className="text-sm text-slate-400">Smell Types</p>
                <p className="text-2xl font-bold text-white">{chartData.smellTypeDistribution.labels.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Code Smell Types Distribution */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <PieChart className="w-5 h-5 mr-2" />
              Code Smell Types Distribution
            </h3>
            <div className="h-80">
              <Pie data={chartData.smellTypeDistribution} options={pieOptions} />
            </div>
          </div>

          {/* Severity Breakdown */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2" />
              Severity Breakdown
            </h3>
            <div className="h-80">
              <Bar data={chartData.severityBreakdown} options={chartOptions} />
            </div>
          </div>

          {/* Files with Most Smells */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <FileText className="w-5 h-5 mr-2" />
              Files with Most Code Smells
            </h3>
            <div className="h-80">
              <Bar data={chartData.filesWithMostSmells} options={{
                ...chartOptions,
                indexAxis: 'y' as const
              }} />
            </div>
          </div>

          {/* Smell Trends by File Type */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              Code Smells by File Type
            </h3>
            <div className="h-80">
              <Bar data={chartData.smellTrendsByFileType} options={chartOptions} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
