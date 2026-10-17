'use client';

import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  RotateCcw, 
  Play, 
  Pause, 
  Square,
  BarChart3,
  TrendingUp,
  FileText,
  GitBranch,
  Shield,
  Zap,
  History,
  Settings,
  Download,
  Upload
} from 'lucide-react';

interface RefactoringOperation {
  id: string;
  type: string;
  filePath: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ROLLED_BACK';
  progress: number;
  startTime: string;
  endTime?: string;
  duration?: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  changes: {
    linesChanged: number;
    charactersChanged: number;
    filesAffected: number;
  };
  backupPath?: string;
  errorMessage?: string;
  qualityImprovement?: {
    beforeScore: number;
    afterScore: number;
    improvement: number;
  };
}

interface RefactoringStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageDuration: number;
  totalTimeSaved: number;
  qualityImprovement: number;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
  };
}

interface RefactoringMonitorProps {
  workspaceId: string;
  onOperationComplete?: () => void;
}

export default function RefactoringMonitor({ workspaceId, onOperationComplete }: RefactoringMonitorProps) {
  const [operations, setOperations] = useState<RefactoringOperation[]>([]);
  const [stats, setStats] = useState<RefactoringStats | null>(null);
  const [selectedOperation, setSelectedOperation] = useState<RefactoringOperation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'RUNNING' | 'COMPLETED' | 'FAILED'>('ALL');

  // Mock data for demonstration
  useEffect(() => {
    const mockOperations: RefactoringOperation[] = [
      {
        id: '1',
        type: 'EXTRACT_METHOD',
        filePath: 'junit4-main/src/main/java/org/junit/Assert.java',
        status: 'COMPLETED',
        progress: 100,
        startTime: '2025-10-22T02:00:00Z',
        endTime: '2025-10-22T02:02:30Z',
        duration: 150,
        riskLevel: 'LOW',
        changes: {
          linesChanged: 15,
          charactersChanged: 450,
          filesAffected: 1
        },
        backupPath: '/backups/Assert.java.backup',
        qualityImprovement: {
          beforeScore: 65,
          afterScore: 78,
          improvement: 13
        }
      },
      {
        id: '2',
        type: 'RENAME_METHOD',
        filePath: 'junit4-main/src/main/java/org/junit/runners/ParentRunner.java',
        status: 'RUNNING',
        progress: 45,
        startTime: '2025-10-22T02:05:00Z',
        riskLevel: 'MEDIUM',
        changes: {
          linesChanged: 0,
          charactersChanged: 0,
          filesAffected: 0
        }
      },
      {
        id: '3',
        type: 'EXTRACT_CLASS',
        filePath: 'junit4-main/src/main/java/junit/framework/TestCase.java',
        status: 'FAILED',
        progress: 0,
        startTime: '2025-10-22T01:45:00Z',
        endTime: '2025-10-22T01:47:15Z',
        duration: 135,
        riskLevel: 'HIGH',
        changes: {
          linesChanged: 0,
          charactersChanged: 0,
          filesAffected: 0
        },
        errorMessage: 'Class extraction failed: Circular dependency detected'
      }
    ];

    const mockStats: RefactoringStats = {
      totalOperations: 3,
      successfulOperations: 1,
      failedOperations: 1,
      averageDuration: 142,
      totalTimeSaved: 25,
      qualityImprovement: 8.5,
      riskDistribution: {
        low: 1,
        medium: 1,
        high: 1
      }
    };

    setOperations(mockOperations);
    setStats(mockStats);
  }, [workspaceId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'text-green-400 bg-green-500/20 border-green-500/50';
      case 'RUNNING': return 'text-blue-400 bg-blue-500/20 border-blue-500/50';
      case 'FAILED': return 'text-red-400 bg-red-500/20 border-red-500/50';
      case 'PENDING': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50';
      case 'ROLLED_BACK': return 'text-orange-400 bg-orange-500/20 border-orange-500/50';
      default: return 'text-gray-400 bg-gray-500/20 border-gray-500/50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED': return <CheckCircle className="w-4 h-4" />;
      case 'RUNNING': return <Activity className="w-4 h-4 animate-pulse" />;
      case 'FAILED': return <AlertTriangle className="w-4 h-4" />;
      case 'PENDING': return <Clock className="w-4 h-4" />;
      case 'ROLLED_BACK': return <RotateCcw className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW': return 'text-green-400';
      case 'MEDIUM': return 'text-yellow-400';
      case 'HIGH': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const handleRollback = async (operationId: string) => {
    setIsLoading(true);
    try {
      // Call rollback API
      const response = await fetch(`/api/refactoring/${workspaceId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId })
      });

      if (response.ok) {
        // Update operation status
        setOperations(prev => prev.map(op => 
          op.id === operationId 
            ? { ...op, status: 'ROLLED_BACK' as const, endTime: new Date().toISOString() }
            : op
        ));
        onOperationComplete?.();
      }
    } catch (error) {
      console.error('Rollback failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = async (operationId: string) => {
    setIsLoading(true);
    try {
      // Call retry API
      const response = await fetch(`/api/refactoring/${workspaceId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId })
      });

      if (response.ok) {
        // Update operation status
        setOperations(prev => prev.map(op => 
          op.id === operationId 
            ? { ...op, status: 'PENDING' as const, progress: 0, errorMessage: undefined }
            : op
        ));
      }
    } catch (error) {
      console.error('Retry failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredOperations = operations.filter(op => 
    filter === 'ALL' || op.status === filter
  );

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center">
              <Activity className="w-6 h-6 mr-3" />
              Refactoring Monitor
            </h2>
            <p className="text-slate-400 mt-1">Track and manage refactoring operations</p>
          </div>
          <div className="flex space-x-3">
            <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center">
              <Download className="w-4 h-4 mr-2" />
              Export
            </button>
            <button className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="bg-slate-800 border-b border-slate-700 p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Total Operations</p>
                  <p className="text-2xl font-bold text-white">{stats.totalOperations}</p>
                </div>
                <BarChart3 className="w-8 h-8 text-blue-400" />
              </div>
            </div>

            <div className="bg-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Success Rate</p>
                  <p className="text-2xl font-bold text-green-400">
                    {Math.round((stats.successfulOperations / stats.totalOperations) * 100)}%
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
            </div>

            <div className="bg-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Avg Duration</p>
                  <p className="text-2xl font-bold text-white">{formatDuration(stats.averageDuration)}</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-400" />
              </div>
            </div>

            <div className="bg-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Time Saved</p>
                  <p className="text-2xl font-bold text-blue-400">{stats.totalTimeSaved}h</p>
                </div>
                <TrendingUp className="w-8 h-8 text-blue-400" />
              </div>
            </div>

            <div className="bg-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Quality Improvement</p>
                  <p className="text-2xl font-bold text-green-400">+{stats.qualityImprovement}%</p>
                </div>
                <Shield className="w-8 h-8 text-green-400" />
              </div>
            </div>

            <div className="bg-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Risk Distribution</p>
                  <div className="flex space-x-1 mt-1">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                    <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                  </div>
                </div>
                <AlertTriangle className="w-8 h-8 text-orange-400" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Operations List */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full flex">
          {/* Operations List */}
          <div className="flex-1 flex flex-col">
            {/* Filter Tabs */}
            <div className="bg-slate-800 border-b border-slate-700 p-4">
              <div className="flex space-x-1">
                {(['ALL', 'RUNNING', 'COMPLETED', 'FAILED'] as const).map((filterType) => (
                  <button
                    key={filterType}
                    onClick={() => setFilter(filterType)}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      filter === filterType
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {filterType}
                  </button>
                ))}
              </div>
            </div>

            {/* Operations Table */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 space-y-3">
                {filteredOperations.map((operation) => (
                  <div
                    key={operation.id}
                    className={`bg-slate-800 rounded-lg border border-slate-700 p-4 cursor-pointer transition-colors hover:bg-slate-750 ${
                      selectedOperation?.id === operation.id ? 'ring-2 ring-blue-500' : ''
                    }`}
                    onClick={() => setSelectedOperation(operation)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(operation.status)}
                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(operation.status)}`}>
                            {operation.status}
                          </span>
                        </div>

                        <div>
                          <h3 className="text-white font-medium">{operation.type.replace('_', ' ')}</h3>
                          <p className="text-slate-400 text-sm">{operation.filePath.split('/').pop()}</p>
                        </div>

                        <div className="flex items-center space-x-4 text-sm text-slate-400">
                          <span className={getRiskColor(operation.riskLevel)}>
                            {operation.riskLevel} Risk
                          </span>
                          {operation.duration && (
                            <span>{formatDuration(operation.duration)}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        {operation.status === 'RUNNING' && (
                          <div className="w-16 bg-slate-700 rounded-full h-2">
                            <div 
                              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${operation.progress}%` }}
                            ></div>
                          </div>
                        )}

                        {operation.status === 'COMPLETED' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRollback(operation.id);
                            }}
                            className="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm flex items-center"
                            disabled={isLoading}
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Rollback
                          </button>
                        )}

                        {operation.status === 'FAILED' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetry(operation.id);
                            }}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm flex items-center"
                            disabled={isLoading}
                          >
                            <Play className="w-3 h-3 mr-1" />
                            Retry
                          </button>
                        )}
                      </div>
                    </div>

                    {operation.status === 'RUNNING' && (
                      <div className="mt-3">
                        <div className="flex justify-between text-sm text-slate-400 mb-1">
                          <span>Progress</span>
                          <span>{operation.progress}%</span>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-2">
                          <div 
                            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${operation.progress}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                    {operation.errorMessage && (
                      <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <p className="text-red-400 text-sm">{operation.errorMessage}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Operation Details Sidebar */}
          {selectedOperation && (
            <div className="w-96 bg-slate-800 border-l border-slate-700 flex flex-col">
              <div className="p-4 border-b border-slate-700">
                <h3 className="text-lg font-semibold text-white">Operation Details</h3>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-slate-400 mb-2">Basic Info</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Type:</span>
                      <span className="text-white">{selectedOperation.type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Status:</span>
                      <span className={getRiskColor(selectedOperation.status)}>{selectedOperation.status}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Risk Level:</span>
                      <span className={getRiskColor(selectedOperation.riskLevel)}>{selectedOperation.riskLevel}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">File:</span>
                      <span className="text-white text-xs">{selectedOperation.filePath}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-slate-400 mb-2">Timing</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Started:</span>
                      <span className="text-white">{new Date(selectedOperation.startTime).toLocaleString()}</span>
                    </div>
                    {selectedOperation.endTime && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Completed:</span>
                        <span className="text-white">{new Date(selectedOperation.endTime).toLocaleString()}</span>
                      </div>
                    )}
                    {selectedOperation.duration && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Duration:</span>
                        <span className="text-white">{formatDuration(selectedOperation.duration)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-slate-400 mb-2">Changes</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Lines Changed:</span>
                      <span className="text-white">{selectedOperation.changes.linesChanged}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Characters:</span>
                      <span className="text-white">{selectedOperation.changes.charactersChanged}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Files Affected:</span>
                      <span className="text-white">{selectedOperation.changes.filesAffected}</span>
                    </div>
                  </div>
                </div>

                {selectedOperation.qualityImprovement && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-400 mb-2">Quality Impact</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Before Score:</span>
                        <span className="text-white">{selectedOperation.qualityImprovement.beforeScore}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">After Score:</span>
                        <span className="text-white">{selectedOperation.qualityImprovement.afterScore}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Improvement:</span>
                        <span className="text-green-400">+{selectedOperation.qualityImprovement.improvement}</span>
                      </div>
                    </div>
                  </div>
                )}

                {selectedOperation.backupPath && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-400 mb-2">Backup</h4>
                    <p className="text-white text-xs break-all">{selectedOperation.backupPath}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
