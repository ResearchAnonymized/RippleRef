'use client';

import React from 'react';
import { type DependencyMetrics, type FileDependencyAnalysis } from '../api/client';
import { 
  GitBranch, 
  ArrowRight, 
  AlertTriangle, 
  CheckCircle, 
  TrendingUp,
  BarChart3,
  Activity,
  Target
} from 'lucide-react';

interface DependencyMetricsProps {
  metrics: DependencyMetrics;
  fileAnalysis?: FileDependencyAnalysis;
  className?: string;
}

export default function DependencyMetrics({ metrics, fileAnalysis, className = '' }: DependencyMetricsProps) {
  const getCouplingLevel = (dependencies: number) => {
    if (dependencies === 0) return { 
      level: 'None', 
      color: 'text-emerald-400', 
      bgColor: 'bg-gradient-to-r from-emerald-500/20 to-emerald-600/20',
      borderColor: 'border-emerald-500/30'
    };
    if (dependencies <= 3) return { 
      level: 'Low', 
      color: 'text-green-400', 
      bgColor: 'bg-gradient-to-r from-green-500/20 to-green-600/20',
      borderColor: 'border-green-500/30'
    };
    if (dependencies <= 7) return { 
      level: 'Medium', 
      color: 'text-amber-400', 
      bgColor: 'bg-gradient-to-r from-amber-500/20 to-amber-600/20',
      borderColor: 'border-amber-500/30'
    };
    if (dependencies <= 15) return { 
      level: 'High', 
      color: 'text-orange-400', 
      bgColor: 'bg-gradient-to-r from-orange-500/20 to-orange-600/20',
      borderColor: 'border-orange-500/30'
    };
    return { 
      level: 'Very High', 
      color: 'text-red-400', 
      bgColor: 'bg-gradient-to-r from-red-500/20 to-red-600/20',
      borderColor: 'border-red-500/30'
    };
  };

  const getCouplingScore = (dependencies: number) => {
    // Score from 0-100, where 0 dependencies = 100, 20+ dependencies = 0
    return Math.max(0, 100 - (dependencies * 5));
  };

  const renderCouplingDistribution = () => {
    const entries = Object.entries(metrics.couplingDistribution)
      .map(([deps, count]) => ({ deps: parseInt(deps), count }))
      .sort((a, b) => a.deps - b.deps);

    const maxCount = Math.max(...entries.map(e => e.count));

    return (
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-slate-300 mb-3">Coupling Distribution</h4>
        {entries.map(({ deps, count }) => {
          const percentage = (count / maxCount) * 100;
          const coupling = getCouplingLevel(deps);
          
          return (
            <div key={deps} className="flex items-center space-x-3">
              <div className="w-12 text-sm text-slate-400">{deps} deps</div>
              <div className="flex-1 bg-slate-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${coupling.bgColor}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="w-8 text-sm text-slate-400">{count}</div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Overall Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700/50 hover:border-blue-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/10">
          <div className="flex items-center space-x-3 mb-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <BarChart3 className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-sm font-medium text-slate-300">Total Files</span>
          </div>
          <div className="text-3xl font-bold text-blue-400 mb-1">{metrics.totalFiles}</div>
          <div className="text-xs text-slate-500">Java files in project</div>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700/50 hover:border-green-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/10">
          <div className="flex items-center space-x-3 mb-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <GitBranch className="w-5 h-5 text-green-400" />
            </div>
            <span className="text-sm font-medium text-slate-300">Dependencies</span>
          </div>
          <div className="text-3xl font-bold text-green-400 mb-1">{metrics.totalDependencies}</div>
          <div className="text-xs text-slate-500">Total connections</div>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700/50 hover:border-amber-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/10">
          <div className="flex items-center space-x-3 mb-3">
            <div className="p-2 rounded-lg bg-amber-500/20">
              <TrendingUp className="w-5 h-5 text-amber-400" />
            </div>
            <span className="text-sm font-medium text-slate-300">Avg per File</span>
          </div>
          <div className="text-3xl font-bold text-amber-400 mb-1">{metrics.averageDependencies.toFixed(1)}</div>
          <div className="text-xs text-slate-500">Dependencies per file</div>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700/50 hover:border-purple-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10">
          <div className="flex items-center space-x-3 mb-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Activity className="w-5 h-5 text-purple-400" />
            </div>
            <span className="text-sm font-medium text-slate-300">Complexity</span>
          </div>
          <div className="text-3xl font-bold text-purple-400 mb-1">
            {metrics.averageDependencies > 10 ? 'High' : metrics.averageDependencies > 5 ? 'Medium' : 'Low'}
          </div>
          <div className="text-xs text-slate-500">Overall coupling level</div>
        </div>
      </div>

      {/* File-specific Analysis */}
      {fileAnalysis && (
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
            <Target className="w-5 h-5 mr-2" />
            File Dependency Analysis
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Outgoing Dependencies */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <ArrowRight className="w-4 h-4 text-blue-400" />
                <span className="font-medium text-slate-300">Outgoing Dependencies</span>
              </div>
              <div className="text-3xl font-bold text-blue-400">{fileAnalysis.outgoingDependencies}</div>
              <div className={`text-sm ${getCouplingLevel(fileAnalysis.outgoingDependencies).color}`}>
                {getCouplingLevel(fileAnalysis.outgoingDependencies).level} Coupling
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (fileAnalysis.outgoingDependencies / 20) * 100)}%` }}
                />
              </div>
            </div>

            {/* Incoming Dependencies */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <GitBranch className="w-4 h-4 text-green-400" />
                <span className="font-medium text-slate-300">Incoming Dependencies</span>
              </div>
              <div className="text-3xl font-bold text-green-400">{fileAnalysis.incomingDependencies}</div>
              <div className={`text-sm ${getCouplingLevel(fileAnalysis.incomingDependencies).color}`}>
                {getCouplingLevel(fileAnalysis.incomingDependencies).level} Coupling
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (fileAnalysis.incomingDependencies / 20) * 100)}%` }}
                />
              </div>
            </div>

            {/* Coupling Score */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-purple-400" />
                <span className="font-medium text-slate-300">Coupling Score</span>
              </div>
              <div className="text-3xl font-bold text-purple-400">
                {getCouplingScore(fileAnalysis.outgoingDependencies + fileAnalysis.incomingDependencies)}
              </div>
              <div className="text-sm text-slate-400">out of 100</div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${getCouplingScore(fileAnalysis.outgoingDependencies + fileAnalysis.incomingDependencies)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Dependencies List */}
          {(fileAnalysis.dependencies.length > 0 || fileAnalysis.reverseDependencies.length > 0) && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {fileAnalysis.dependencies.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center">
                    <ArrowRight className="w-4 h-4 mr-2 text-blue-400" />
                    Depends On ({fileAnalysis.dependencies.length})
                  </h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {fileAnalysis.dependencies.map((dep, index) => (
                      <div key={index} className="text-sm text-slate-400 bg-slate-700/50 rounded px-2 py-1">
                        {dep.split('/').pop()}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {fileAnalysis.reverseDependencies.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center">
                    <GitBranch className="w-4 h-4 mr-2 text-green-400" />
                    Depended On By ({fileAnalysis.reverseDependencies.length})
                  </h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {fileAnalysis.reverseDependencies.map((dep, index) => (
                      <div key={index} className="text-sm text-slate-400 bg-slate-700/50 rounded px-2 py-1">
                        {dep.split('/').pop()}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Project-wide Analysis */}
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
          <BarChart3 className="w-5 h-5 mr-2" />
          Project Coupling Analysis
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Most Coupled File */}
          <div>
            <h4 className="text-sm font-semibold text-slate-300 mb-2 flex items-center">
              <AlertTriangle className="w-4 h-4 mr-2 text-orange-400" />
              Most Coupled File
            </h4>
            <div className="bg-slate-700/50 rounded-lg p-3">
              <div className="text-sm text-orange-400 font-medium">
                {metrics.mostCoupledFile.split('/').pop() || 'N/A'}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {metrics.mostCoupledFile}
              </div>
            </div>
          </div>

          {/* Most Dependent File */}
          <div>
            <h4 className="text-sm font-semibold text-slate-300 mb-2 flex items-center">
              <CheckCircle className="w-4 h-4 mr-2 text-green-400" />
              Most Dependent File
            </h4>
            <div className="bg-slate-700/50 rounded-lg p-3">
              <div className="text-sm text-green-400 font-medium">
                {metrics.mostDependentFile.split('/').pop() || 'N/A'}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {metrics.mostDependentFile}
              </div>
            </div>
          </div>
        </div>

        {/* Coupling Distribution */}
        <div className="mt-6">
          {renderCouplingDistribution()}
        </div>
      </div>
    </div>
  );
}
