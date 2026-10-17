'use client';

import { useState, useEffect } from 'react';
import { 
  Code, Zap, FileText, AlertTriangle, CheckCircle, Info, XCircle,
  BarChart3, Target, Lightbulb, Search, Filter, Download, RefreshCw,
  Folder, PieChart, Eye, ChevronRight, ChevronDown, Clock, Shield,
  TrendingUp, GitBranch, Settings, Play, StopCircle, AlertCircle,
  CheckCircle2, MinusCircle, PlusCircle, ExternalLink, Copy, Edit3,
  Trash2, Star, Activity, Layers, Database, Cpu, HardDrive, Network,
  Lock, Unlock, Bug, Wrench, BookOpen, FileCode, GitCommit, Calendar,
  User, Users, Globe, Server, Monitor, Smartphone, Tablet, TestTube,
  ChevronLeft, ChevronFirst, ChevronLast, X
} from 'lucide-react';
import { apiClient, CodeAnalysisResult, FileAnalysis, FileInfo, EnhancedAnalysisResult } from '../api/client';
import { useToast } from './ToastManager';
import LoadingTimer from './LoadingTimer';
import { CodeSmellsPieChart, MetricsBarChart, QualityGauge } from './Charts';

interface CodeAnalysisDashboardProps {
  workspaceId: string;
  onAnalysisComplete?: (result: CodeAnalysisResult) => void;
}

interface FileSummary {
  totalFiles: number;
  fileTypeCounts: Record<string, number>;
  sourceFiles: number;
  testFiles: number;
  configFiles: number;
  resourceFiles: number;
}

interface PaginatedFilesResponse {
  files: FileInfo[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalFiles: number;
    pageSize: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export default function CodeAnalysisDashboard({ workspaceId, onAnalysisComplete }: CodeAnalysisDashboardProps) {
  const toast = useToast();
  const [analysisResult, setAnalysisResult] = useState<CodeAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileAnalysis, setFileAnalysis] = useState<FileAnalysis | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<FileInfo[]>([]);
  const [fileSearchTerm, setFileSearchTerm] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState('');
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null);
  const [showFileViewer, setShowFileViewer] = useState(false);
  const [isLoadingFileContent, setIsLoadingFileContent] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'overview' | 'files' | 'smells' | 'security' | 'enhanced'>('overview');
  const [enhancedAnalysis, setEnhancedAnalysis] = useState<EnhancedAnalysisResult | null>(null);
  const [isEnhancedAnalyzing, setIsEnhancedAnalyzing] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [fileSummary, setFileSummary] = useState<FileSummary | null>(null);
  const [loadingTime, setLoadingTime] = useState<number | null>(null);
  const [timingMetrics, setTimingMetrics] = useState<any>(null);

  // Initialize dashboard with completely empty state
  useEffect(() => {
    if (workspaceId) {
      // Start with completely empty state - no auto-clearing
      setAnalysisResult(null);
      setWorkspaceFiles([]);
      setFileSummary(null);
      setCurrentPage(1);
      setTotalPages(0);
      setTotalFiles(0);
      setFileAnalysis(null);
      setEnhancedAnalysis(null);
      setSelectedFile(null);
      setSelectedFileContent('');
      setShowFileViewer(false);
      
      console.log('Dashboard initialized with empty state - waiting for user action');
    } else {
      // If no workspaceId, ensure we're in a clean state
      setAnalysisResult(null);
      setWorkspaceFiles([]);
      setFileSummary(null);
      setCurrentPage(1);
      setTotalPages(0);
      setTotalFiles(0);
      setFileAnalysis(null);
      setEnhancedAnalysis(null);
      setSelectedFile(null);
      setSelectedFileContent('');
      setShowFileViewer(false);
      
      console.log('Dashboard initialized with empty state - no workspace ID');
    }
  }, [workspaceId]);

  const loadFileSummary = async () => {
    if (!workspaceId) {
      console.log('No workspace ID available - please upload a project first');
      toast.showWarning('No Project', 'Please upload a project first before loading file summary');
      return;
    }
    
    try {
      const summary = await apiClient.getWorkspaceFileSummary(workspaceId);
      setFileSummary(summary);
      setTotalFiles(summary.totalFiles);
    } catch (error) {
      console.error('Failed to load file summary:', error);
    }
  };

  // Load workspace files only when explicitly requested
  const loadWorkspaceFiles = async () => {
    if (!workspaceId) {
      console.log('No workspace ID available - please upload a project first');
      toast.showWarning('No Project', 'Please upload a project first before loading files');
      return;
    }
    
    const startTime = Date.now();
    try {
      setIsLoadingFiles(true);
      setLoadingTime(null);
      setTimingMetrics(null);
      
      const response = await apiClient.getWorkspaceFilesPaginated(
        workspaceId,
        currentPage,
        pageSize,
        fileSearchTerm,
        fileTypeFilter,
        true
      );
      
      const endTime = Date.now();
      const elapsed = (endTime - startTime) / 1000;
      
      setWorkspaceFiles(response.files);
      setTotalPages(response.pagination.totalPages);
      setTotalFiles(response.pagination.totalFiles);
      setLoadingTime(elapsed);
      
      // Store timing metrics from backend if available
      if ((response as any).timing) {
        setTimingMetrics((response as any).timing);
        console.log('Backend timing metrics:', (response as any).timing);
      }
      
      console.log(`Workspace files loaded: ${response.files.length} files in ${elapsed.toFixed(2)}s`);
      
      // Show timing info in toast
      if (elapsed > 2) {
        toast.showInfo(
          'Files Loaded',
          `Loaded ${response.files.length} files in ${elapsed.toFixed(2)}s (${((response as any).timing?.filesPerSecond || 0).toFixed(1)} files/sec)`
        );
      }
    } catch (error) {
      console.error('Failed to load workspace files:', error);
      setWorkspaceFiles([]);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(0); // Reset to first page when changing page size
  };

  const handleSearch = (searchTerm: string) => {
    setFileSearchTerm(searchTerm);
    setCurrentPage(0); // Reset to first page when searching
  };

  const handleFileTypeFilter = (fileType: string) => {
    setFileTypeFilter(fileType);
    setCurrentPage(0); // Reset to first page when filtering
  };

  const clearFilters = () => {
    setFileSearchTerm('');
    setFileTypeFilter('');
    setCurrentPage(0);
  };

  const analyzeFile = async (filePath: string) => {
    if (!workspaceId) {
      console.log('No workspace ID available - please upload a project first');
      toast.showWarning('No Project', 'Please upload a project first before analyzing files');
      return;
    }
    
    try {
      console.log('Performing basic analysis for file:', filePath);
      const analysis = await apiClient.analyzeFile(workspaceId, filePath);
      console.log('Basic analysis result:', analysis);
      setFileAnalysis(analysis);
      setSelectedFile(filePath);
      
      // Show success message with key insights
      if (analysis.metrics) {
        const methods = analysis.metrics.methodCount || 0;
        const classes = analysis.metrics.classCount || 0;
        const lines = analysis.metrics.totalLines || 0;
        const smells = analysis.smells?.length || 0;
        
        toast.showSuccess(
          'Basic Analysis Complete!', 
          `File: ${filePath.split('/').pop()}\nClasses: ${classes} | Methods: ${methods} | Lines: ${lines} | Code Smells: ${smells}\n\nCheck the Individual File Analysis section for detailed insights.`
        );
      }
    } catch (error) {
      console.error('Failed to analyze file:', error);
      toast.showError('Analysis Failed', 'Basic analysis failed. Please try again or check the console for details.');
    }
  };

  const analyzeFileEnhanced = async (filePath: string) => {
    if (!workspaceId) {
      console.log('No workspace ID available - please upload a project first');
      toast.showWarning('No Project', 'Please upload a project first before analyzing files');
      return;
    }
    
    setIsEnhancedAnalyzing(true);
    try {
      console.log('Performing enhanced analysis for file:', filePath);
      const analysis = await apiClient.analyzeFileEnhanced(workspaceId, filePath);
      console.log('Enhanced analysis result:', analysis);
      setEnhancedAnalysis(analysis);
      setSelectedFile(filePath);
      
      // Show success message with key insights
      if (analysis.metrics) {
        const score = analysis.metrics.overallScore || 0;
        const grade = analysis.metrics.qualityGrade || 'N/A';
        const issues = analysis.metrics.codeSmells || 0;
        
        toast.showSuccess(
          'Enhanced Analysis Complete!', 
          `Overall Score: ${score}/100 (${grade})\nCode Smells: ${issues}\n\nCheck the Enhanced Analysis tab for detailed insights, charts, and recommendations.`
        );
      }
    } catch (error) {
      console.error('Enhanced analysis failed:', error);
      toast.showError('Enhanced Analysis Failed', 'Enhanced analysis failed. Please try again or check the console for details.');
    } finally {
      setIsEnhancedAnalyzing(false);
    }
  };

  const loadFileContent = async (filePath: string) => {
    if (!workspaceId) {
      console.log('No workspace ID available - please upload a project first');
      toast.showWarning('No Project', 'Please upload a project first before loading file content');
      return;
    }
    
    setIsLoadingFileContent(true);
    try {
      const response = await apiClient.getFileContent(workspaceId, filePath);
      setSelectedFileContent(response.content);
      setShowFileViewer(true);
    } catch (error) {
      console.error('Failed to load file content:', error);
    } finally {
      setIsLoadingFileContent(false);
    }
  };

  const toggleFileExpansion = (filePath: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(filePath)) {
      newExpanded.delete(filePath);
    } else {
      newExpanded.add(filePath);
    }
    setExpandedFiles(newExpanded);
  };

  const runFullAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const result = await apiClient.analyzeWorkspace(workspaceId);
      setAnalysisResult(result);
      if (onAnalysisComplete) {
        onAnalysisComplete(result);
      }
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const exportReport = () => {
    if (!analysisResult) return;
    
    const report = {
      workspaceId,
      timestamp: new Date().toISOString(),
      analyzedFiles: analysisResult.analyzedFiles,
      totalSmells: analysisResult.totalSmells,
      totalTechnicalDebt: analysisResult.totalTechnicalDebt,
      recommendations: analysisResult.recommendations
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `refactai-report-${workspaceId}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">No Workspace Selected</h2>
          <p className="text-slate-400">Please select a workspace to begin analysis</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-6">
        <div className="flex items-center justify-between">
              <div>
            <h1 className="text-3xl font-bold text-white">Code Analysis Dashboard</h1>
            <p className="text-slate-300">Workspace: {workspaceId}</p>
              </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={runFullAnalysis}
              disabled={isAnalyzing}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 px-6 py-3 rounded-lg font-semibold flex items-center space-x-2"
            >
              {isAnalyzing ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Play className="w-5 h-5" />
              )}
              <span>{isAnalyzing ? 'Analyzing...' : 'Run Analysis'}</span>
            </button>
            {analysisResult && (
              <button
                onClick={exportReport}
                className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-semibold flex items-center space-x-2"
              >
                <Download className="w-5 h-5" />
                <span>Export Report</span>
            </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="w-80 bg-slate-800 border-r border-slate-700 min-h-screen p-6">
      {/* Navigation Tabs */}
          <div className="space-y-2 mb-8">
            {[
              { id: 'overview', label: 'Overview', icon: BarChart3 },
              { id: 'files', label: 'Files', icon: FileText },
              { id: 'smells', label: 'Code Smells', icon: AlertTriangle },
              { id: 'security', label: 'Security', icon: Shield },
              { id: 'enhanced', label: 'Enhanced', icon: Zap }
            ].map(({ id, label, icon: Icon }) => (
                <button
                key={id}
                onClick={() => setViewMode(id as any)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                  viewMode === id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
                {id === 'files' && (
                  <span className="ml-auto bg-slate-600 text-slate-200 px-2 py-1 rounded-full text-xs">
                    {totalFiles}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* File Summary Stats */}
          {fileSummary && (
            <div className="bg-slate-700 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-semibold mb-4 text-white">File Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-slate-300">Total Files:</span>
                  <span className="font-medium text-white">{fileSummary.totalFiles}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">Source Files:</span>
                  <span className="font-medium text-white">{fileSummary.sourceFiles}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">Test Files:</span>
                  <span className="font-medium text-white">{fileSummary.testFiles}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">Config Files:</span>
                  <span className="font-medium text-white">{fileSummary.configFiles}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">Resource Files:</span>
                  <span className="font-medium text-white">{fileSummary.resourceFiles}</span>
                </div>
              </div>
            </div>
          )}

          {/* Project Status */}
          <div className="bg-slate-700 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold mb-4 text-white">Project Status</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-300">Status:</span>
                <span className={`font-medium px-2 py-1 rounded text-xs ${
                  analysisResult ? 'bg-green-600 text-white' : 'bg-yellow-600 text-white'
                }`}>
                  {analysisResult ? 'Analyzed' : 'Ready to Analyze'}
                    </span>
              </div>
              {analysisResult && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-300">Files Analyzed:</span>
                    <span className="font-medium text-white">{analysisResult.analyzedFiles}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-300">Total Smells:</span>
                    <span className="font-medium text-white">{analysisResult.totalSmells}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6">
          {/* Page Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white mb-2">
              {viewMode === 'overview' && 'Project Overview'}
              {viewMode === 'files' && 'File Management'}
              {viewMode === 'smells' && 'Code Smells Analysis'}
              {viewMode === 'security' && 'Security Analysis'}
              {viewMode === 'enhanced' && 'Enhanced Code Analysis'}
            </h1>
            <p className="text-slate-400">
              {viewMode === 'overview' && 'Get a comprehensive overview of your project'}
              {viewMode === 'files' && 'Browse and analyze individual files'}
              {viewMode === 'smells' && 'Detailed analysis of code smells and issues'}
              {viewMode === 'security' && 'Security vulnerabilities and recommendations'}
              {viewMode === 'enhanced' && 'Advanced metrics, charts, and insights'}
            </p>
          </div>

          {/* Overview Tab */}
          {viewMode === 'overview' && (
            <div className="space-y-6">
              {/* Quick Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                      <FileText className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">Files</h3>
                      <p className="text-slate-400 text-sm">Total files in workspace</p>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-white">{totalFiles}</div>
                </div>

                <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-12 h-12 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                      <AlertTriangle className="w-6 h-6 text-yellow-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">Code Smells</h3>
                      <p className="text-slate-400 text-sm">Issues detected</p>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-white">
                    {analysisResult?.totalSmells || 0}
                  </div>
                </div>

                <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                      <Play className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">Analysis Status</h3>
                      <p className="text-slate-400 text-sm">Ready to analyze</p>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-white">
                    {analysisResult ? 'Complete' : 'Ready'}
                  </div>
                </div>
              </div>

              {/* Analysis Results Summary - Prominently Displayed */}
              {analysisResult && (
                <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                  <h3 className="text-xl font-semibold mb-4 text-white">Analysis Results Summary</h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-slate-700 rounded-lg p-3">
                        <p className="text-sm text-slate-400">Total Smells</p>
                        <p className="text-2xl font-bold text-white">{analysisResult.totalSmells}</p>
                      </div>
                      <div className="bg-slate-700 rounded-lg p-3">
                        <p className="text-sm text-slate-400">Technical Debt</p>
                        <p className="text-2xl font-bold text-white">{analysisResult.totalTechnicalDebt.toFixed(1)}%</p>
                      </div>
                      <div className="bg-slate-700 rounded-lg p-3">
                        <p className="text-sm text-slate-400">Smell Density</p>
                        <p className="text-2xl font-bold text-white">{analysisResult.smellDensity.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h3 className="text-lg font-semibold mb-4 text-white">Quick Actions</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => setViewMode('files')}
                    className="flex items-center space-x-3 p-4 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
                  >
                    <FileText className="w-6 h-6 text-blue-400" />
                    <span className="text-white">Browse Files</span>
                </button>
                  <button
                    onClick={() => setViewMode('enhanced')}
                    className="flex items-center space-x-3 p-4 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
                  >
                    <Zap className="w-6 h-6 text-yellow-400" />
                    <span className="text-white">Enhanced Analysis</span>
                  </button>
        </div>
      </div>
            </div>
          )}

          {/* Files Tab */}
          {viewMode === 'files' && (
            <div className="space-y-6">
              {/* Load Files Section */}
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold text-white">Project Files</h3>
                  <div className="flex items-center space-x-4">
                    <LoadingTimer 
                      isActive={isLoadingFiles}
                      showETA={true}
                      totalItems={totalFiles}
                      processedItems={workspaceFiles.length}
                    />
                    <div className="flex space-x-3">
                      <button
                        onClick={loadFileSummary}
                        disabled={isLoadingFiles}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded-lg transition-colors"
                      >
                        {isLoadingFiles ? 'Loading...' : 'Load File Summary'}
                      </button>
                      <button
                        onClick={loadWorkspaceFiles}
                        disabled={isLoadingFiles}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white rounded-lg transition-colors"
                      >
                        {isLoadingFiles ? 'Loading...' : 'Load Files'}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-slate-400 text-sm">
                    Click "Load File Summary" to see file type counts, then "Load Files" to browse individual files.
                  </p>
                  {loadingTime !== null && (
                    <div className="mt-2 p-3 bg-slate-700 rounded-lg border border-slate-600">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-300">Load Time:</span>
                        <span className="font-mono font-semibold text-green-400">{loadingTime.toFixed(2)}s</span>
                      </div>
                      {timingMetrics && (
                        <div className="mt-2 space-y-1 text-xs text-slate-400">
                          <div className="flex justify-between">
                            <span>Backend Processing:</span>
                            <span className="font-mono">{timingMetrics.totalTimeSeconds?.toFixed(2)}s</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Files Processed:</span>
                            <span className="font-mono">{timingMetrics.filesProcessed || workspaceFiles.length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Processing Rate:</span>
                            <span className="font-mono text-yellow-400">
                              {timingMetrics.filesPerSecond?.toFixed(1) || 'N/A'} files/sec
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Avg Time per File:</span>
                            <span className="font-mono">{timingMetrics.averageTimePerFileMs?.toFixed(1) || 'N/A'}ms</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
            </div>
            
            {/* Search and Filters */}
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold text-white">Files</h3>
                  <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search files..."
                  value={fileSearchTerm}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="pl-10 pr-3 py-2 border border-slate-600 rounded-md text-sm bg-slate-700 text-white placeholder-slate-400"
                />
              </div>
              <select
                value={fileTypeFilter}
                      onChange={(e) => handleFileTypeFilter(e.target.value)}
                      className="px-3 py-2 border border-slate-600 rounded-md text-sm bg-slate-700 text-white"
              >
                <option value="">All Types</option>
                <option value="SOURCE">Source Files</option>
                <option value="TEST">Test Files</option>
                <option value="CONFIG">Config Files</option>
                <option value="RESOURCE">Resource Files</option>
              </select>
                    <button
                      onClick={clearFilters}
                      className="px-3 py-2 text-sm text-slate-300 hover:text-white"
                    >
                      Clear Filters
                    </button>
            </div>
          </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="mb-4 p-4 bg-slate-700 rounded-lg">
                    <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                        <span className="text-slate-300">Show:</span>
                        <select
                          value={pageSize}
                          onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                          className="px-2 py-1 text-sm border border-slate-600 rounded bg-slate-600 text-white"
                        >
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                          <option value={200}>200</option>
                        </select>
                        <span className="text-slate-300">files per page</span>
              </div>

              <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handlePageChange(0)}
                          disabled={currentPage === 0}
                          className="p-2 text-slate-400 hover:text-white disabled:opacity-50"
                        >
                          <ChevronFirst className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handlePageChange(currentPage - 1)}
                          disabled={currentPage === 0}
                          className="p-2 text-slate-400 hover:text-white disabled:opacity-50"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-slate-300">
                          Page {currentPage + 1} of {totalPages}
                        </span>
                        <button
                          onClick={() => handlePageChange(currentPage + 1)}
                          disabled={currentPage >= totalPages - 1}
                          className="p-2 text-slate-400 hover:text-white disabled:opacity-50"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handlePageChange(totalPages - 1)}
                          disabled={currentPage >= totalPages - 1}
                          className="p-2 text-slate-400 hover:text-white disabled:opacity-50"
                        >
                          <ChevronLast className="w-4 h-4" />
                        </button>
              </div>
              </div>
              </div>
                )}

          {/* File List */}
            {isLoadingFiles ? (
                  <div className="text-center py-8">
                    <RefreshCw className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-4" />
                    <p className="text-slate-400 mb-4">Loading files...</p>
                    <LoadingTimer 
                      isActive={true}
                      showETA={true}
                      totalItems={totalFiles}
                      processedItems={workspaceFiles.length}
                      className="justify-center"
                    />
              </div>
                ) : workspaceFiles.length === 0 ? (
                  <div className="text-center py-8">
                    <Folder className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                    <p className="text-slate-400">No files found</p>
              </div>
            ) : (
                  <div className="space-y-2">
                    {workspaceFiles.map((file, index) => (
                      <div key={index} className="bg-slate-700 rounded-lg p-3 border border-slate-600">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => toggleFileExpansion(file.relativePath)}
                                 className="text-slate-400 hover:text-white"
                              >
                                 {expandedFiles.has(file.relativePath) ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </button>
                              <p className="text-sm font-medium text-white truncate">{file.name}</p>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                file.name.endsWith('.java') 
                                  ? 'bg-blue-100 text-blue-800' 
                                  : file.relativePath.includes('/resources/') || file.relativePath.includes('/test/')
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {file.name.endsWith('.java') ? 'JAVA' : 
                                 file.relativePath.includes('/resources/') ? 'RESOURCE' :
                                 file.relativePath.includes('/test/') ? 'TEST' : 'CONFIG'}
                              </span>
                              </div>
                            <p className="text-xs text-slate-400 truncate ml-6">{file.relativePath}</p>
                            
                            {/* Expanded File Details */}
                            {expandedFiles.has(file.relativePath) && (
                              <div className="mt-3 ml-6 space-y-2">
                                <div className="grid grid-cols-2 gap-4 text-xs">
                                  <div>
                                    <span className="text-slate-400">Lines of Code:</span>
                                    <span className="text-white ml-2">{file.metrics.linesOfCode}</span>
                            </div>
                                  <div>
                                    <span className="text-slate-400">Cyclomatic Complexity:</span>
                                    <span className="text-white ml-2">{file.metrics.cyclomaticComplexity}</span>
                          </div>
                                  <div>
                                    <span className="text-slate-400">Methods:</span>
                                    <span className="text-white ml-2">{file.metrics.methodCount}</span>
                            </div>
                                  <div>
                                    <span className="text-slate-400">Classes:</span>
                                    <span className="text-white ml-2">{file.metrics.classCount}</span>
                            </div>
                                  <div>
                                    <span className="text-slate-400">Cognitive Complexity:</span>
                                    <span className="text-white ml-2">{file.metrics.cognitiveComplexity}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-400">Comment Lines:</span>
                                    <span className="text-white ml-2">{file.metrics.commentLines}</span>
                            </div>
                          </div>
                          
                                <div className="flex items-center space-x-2">
                            <button
                              onClick={() => analyzeFile(file.relativePath)}
                                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded"
                                  >
                                    Analyze
                            </button>
                            <button
                              onClick={() => analyzeFileEnhanced(file.relativePath)}
                              disabled={isEnhancedAnalyzing}
                                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 text-white text-xs rounded"
                                  >
                                    {isEnhancedAnalyzing ? 'Analyzing...' : 'Enhanced'}
                                  </button>
                                  <button
                                    onClick={() => loadFileContent(file.relativePath)}
                                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded"
                                  >
                                    View
                            </button>
                          </div>
                        </div>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              file.type === 'SOURCE' ? 'bg-blue-100 text-blue-800' :
                              file.type === 'TEST' ? 'bg-green-100 text-green-800' :
                              file.type === 'CONFIG' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {file.type}
                                </span>
                              </div>
                              </div>
                              </div>
                    ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

          {/* Individual File Analysis */}
          {fileAnalysis && selectedFile && (
            <div className="space-y-6">
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <h3 className="text-xl font-semibold text-white">File Analysis: {selectedFile}</h3>
                    {selectedFile && (
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        selectedFile.endsWith('.java') 
                          ? 'bg-blue-100 text-blue-800' 
                          : selectedFile.includes('/resources/') || selectedFile.includes('/test/')
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {selectedFile.endsWith('.java') ? 'JAVA' : 
                         selectedFile.includes('/resources/') ? 'RESOURCE' :
                         selectedFile.includes('/test/') ? 'TEST' : 'CONFIG'}
                      </span>
            )}
          </div>
                  <button
                    onClick={() => {
                      setFileAnalysis(null);
                      setSelectedFile(null);
                    }}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                    </div>
                    
                {/* Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-slate-700 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-slate-300 mb-1">Lines of Code</h4>
                    <div className="text-2xl font-bold text-white">{fileAnalysis.metrics?.codeLines || 0}</div>
                          </div>
                  <div className="bg-slate-700 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-slate-300 mb-1">Classes</h4>
                    <div className="text-2xl font-bold text-white">{fileAnalysis.metrics?.classCount || 0}</div>
                        </div>
                  <div className="bg-slate-700 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-slate-300 mb-1">Methods</h4>
                    <div className="text-2xl font-bold text-white">{fileAnalysis.metrics?.methodCount || 0}</div>
                        </div>
                  <div className="bg-slate-700 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-slate-300 mb-1">Complexity</h4>
                    <div className="text-2xl font-bold text-white">{fileAnalysis.metrics?.cyclomaticComplexity || 0}</div>
                      </div>
                    </div>
                    
                {/* Visual Charts for Java Files */}
                {selectedFile && selectedFile.endsWith('.java') && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <div className="bg-slate-700 rounded-lg p-4">
                      <h4 className="text-lg font-medium text-white mb-4">File Metrics Visualization</h4>
                      <MetricsBarChart 
                        classes={fileAnalysis.metrics?.classCount || 0}
                        methods={fileAnalysis.metrics?.methodCount || 0}
                        comments={fileAnalysis.metrics?.commentRatio || 0}
                        lines={fileAnalysis.metrics?.codeLines || 0}
                      />
                          </div>
                    <div className="bg-slate-700 rounded-lg p-4">
                      <h4 className="text-lg font-medium text-white mb-4">Quality Score</h4>
                      <div className="flex justify-center">
                        <QualityGauge 
                          score={Math.max(0, 100 - ((fileAnalysis.metrics?.cyclomaticComplexity || 1) * 10))}
                          maxScore={100}
                          label="File Quality"
                        />
                        </div>
                        </div>
                      </div>
                )}

                {/* Code Smells */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg font-semibold text-white">Code Smells ({fileAnalysis.smells?.length || 0})</h4>
                    {fileAnalysis.smells && fileAnalysis.smells.length > 0 && (
                      <div className="flex space-x-2">
                        <span className="text-xs text-slate-400">
                          Critical: {fileAnalysis.smells.filter(s => s.severity === 'CRITICAL').length}
                        </span>
                        <span className="text-xs text-slate-400">
                          Major: {fileAnalysis.smells.filter(s => s.severity === 'MAJOR').length}
                        </span>
                        <span className="text-xs text-slate-400">
                          Minor: {fileAnalysis.smells.filter(s => s.severity === 'MINOR').length}
                        </span>
                          </div>
                    )}
                        </div>
                  {fileAnalysis.smells && fileAnalysis.smells.length > 0 ? (
                    <div className="space-y-3">
                      {fileAnalysis.smells.map((smell, index) => (
                        <div key={index} className="bg-slate-700 rounded-lg p-4 border border-slate-600 hover:border-slate-500 transition-colors">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center space-x-3">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                smell.severity === 'CRITICAL' ? 'bg-red-500 text-white' :
                                smell.severity === 'MAJOR' ? 'bg-orange-500 text-white' :
                                smell.severity === 'MINOR' ? 'bg-yellow-500 text-white' :
                                'bg-green-500 text-white'
                              }`}>
                                {smell.severity}
                              </span>
                              <span className="text-sm font-medium text-white">{smell.title}</span>
                              <span className="text-xs text-slate-400 bg-slate-600 px-2 py-1 rounded">({smell.type})</span>
                        </div>
                            <div className="text-right">
                              <span className="text-xs text-slate-400">Lines {smell.startLine}-{smell.endLine}</span>
                              <div className="text-xs text-slate-500 mt-1">Category: {smell.category}</div>
                      </div>
                    </div>
                          <p className="text-sm text-slate-300 mb-3 leading-relaxed">{smell.description}</p>
                          
                          {/* Refactoring Suggestions */}
                          {smell.refactoringSuggestions && smell.refactoringSuggestions.length > 0 && (
                            <div className="mt-3">
                              <h5 className="text-xs font-medium text-slate-400 mb-2">Refactoring Suggestions:</h5>
                              <div className="flex flex-wrap gap-2">
                                {smell.refactoringSuggestions.map((suggestion, idx) => (
                                  <span key={idx} className="px-3 py-1 bg-blue-500 text-white text-xs rounded-full">
                                    {suggestion}
                                  </span>
                        ))}
                      </div>
                    </div>
                          )}
                          
                          {/* Impact Assessment */}
                          <div className="mt-3 pt-3 border-t border-slate-600">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400">Impact: </span>
                              <span className={`font-medium ${
                                smell.severity === 'CRITICAL' ? 'text-red-400' :
                                smell.severity === 'MAJOR' ? 'text-orange-400' :
                                smell.severity === 'MINOR' ? 'text-yellow-400' :
                                'text-green-400'
                              }`}>
                                {smell.severity === 'CRITICAL' ? 'High - Immediate attention required' :
                                 smell.severity === 'MAJOR' ? 'Medium - Should be addressed soon' :
                                 smell.severity === 'MINOR' ? 'Low - Consider for future refactoring' :
                                 'Minimal - Good to have'}
                              </span>
                    </div>
                    </div>
                  </div>
                      ))}
                </div>
                  ) : (
                    <div className="text-center py-8 bg-slate-700 rounded-lg border border-slate-600">
                      <div className="text-4xl mb-2">🎉</div>
                      <p className="text-green-400 font-medium">No code smells detected!</p>
                      <p className="text-slate-400 text-sm mt-1">This file follows good coding practices.</p>
            </div>
          )}
                </div>

                {/* Refactoring Plan */}
                <div className="mb-6">
                  <h4 className="text-lg font-semibold text-white mb-3">Refactoring Plan & Recommendations</h4>
                  {fileAnalysis.refactoringPlan && Object.keys(fileAnalysis.refactoringPlan).length > 0 ? (
                    <div className="space-y-4">
                      {Object.entries(fileAnalysis.refactoringPlan).map(([category, suggestions]) => (
                        <div key={category} className="bg-slate-700 rounded-lg p-4 border border-slate-600">
                          <div className="flex items-center space-x-2 mb-3">
                            <h5 className="text-sm font-medium text-slate-300">{category}</h5>
                            <span className="text-xs text-slate-500 bg-slate-600 px-2 py-1 rounded">
                              {suggestions.length} suggestions
                                    </span>
                                  </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {suggestions.map((suggestion, idx) => (
                              <div key={idx} className="flex items-start space-x-2 p-2 bg-slate-600 rounded">
                                <span className="text-blue-400 text-xs mt-0.5">•</span>
                                <span className="text-xs text-slate-200 leading-relaxed">{suggestion}</span>
                              </div>
                            ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                    <div className="bg-slate-700 rounded-lg p-6 border border-slate-600 text-center">
                      <div className="text-2xl mb-2">✨</div>
                      <p className="text-green-400 font-medium">No refactoring needed!</p>
                      <p className="text-slate-400 text-sm mt-1">This file is well-structured and follows best practices.</p>
                            </div>
                          )}
                  
                  {/* General Recommendations */}
                  <div className="mt-4 bg-slate-700 rounded-lg p-4 border border-slate-600">
                    <h5 className="text-sm font-medium text-slate-300 mb-3">General Recommendations</h5>
                    <div className="space-y-2">
                      <div className="flex items-start space-x-2">
                        <span className="text-green-400 text-xs mt-1">✓</span>
                        <span className="text-xs text-slate-300">Consider adding unit tests for better code coverage</span>
                        </div>
                      <div className="flex items-start space-x-2">
                        <span className="text-green-400 text-xs mt-1">✓</span>
                        <span className="text-xs text-slate-300">Add Javadoc comments for public methods and classes</span>
                    </div>
                      <div className="flex items-start space-x-2">
                        <span className="text-green-400 text-xs mt-1">✓</span>
                        <span className="text-xs text-slate-300">Review code complexity and consider breaking down large methods</span>
                    </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Code Smells Tab */}
          {viewMode === 'smells' && (
            <div className="space-y-6">
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h3 className="text-xl font-semibold mb-4 text-white">Code Smells Analysis</h3>
                  {analysisResult ? (
                    <div className="space-y-4">
                     {analysisResult.fileAnalyses.map((fileAnalysis, index) => (
                       <div key={index} className="bg-slate-700 rounded-lg p-4 border border-slate-600">
                         <div className="flex items-start justify-between">
                            <div className="flex-1">
                             <h4 className="text-lg font-semibold text-white mb-2">{fileAnalysis.filePath}</h4>
                             <p className="text-slate-300 mb-3">Technical Debt Score: {fileAnalysis.technicalDebtScore.toFixed(2)}</p>
                             
                             {fileAnalysis.smells.length > 0 ? (
                               <div className="space-y-2">
                                 {fileAnalysis.smells.slice(0, 3).map((smell, smellIndex) => (
                                   <div key={smellIndex} className="bg-slate-600 rounded p-2">
                                     <div className="flex items-center space-x-2 mb-1">
                                       <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                         smell.severity === 'HIGH' ? 'bg-red-100 text-red-800' :
                                         smell.severity === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                                         'bg-green-100 text-green-800'
                                       }`}>
                              {smell.severity}
                            </span>
                                       <span className="text-sm font-medium text-white">{smell.type}</span>
                          </div>
                                     <p className="text-xs text-slate-300">{smell.description}</p>
                                     <p className="text-xs text-slate-400">Lines: {smell.startLine}-{smell.endLine}</p>
                                   </div>
                                 ))}
                                 {fileAnalysis.smells.length > 3 && (
                                   <p className="text-xs text-slate-400">+{fileAnalysis.smells.length - 3} more smells...</p>
                                 )}
                              </div>
                             ) : (
                               <p className="text-green-400 text-sm">No code smells detected</p>
                             )}
                           </div>
                                                     <div className="flex items-center space-x-2">
                            <button 
                              onClick={() => {
                                setFileAnalysis(fileAnalysis);
                                setSelectedFile(fileAnalysis.filePath);
                              }}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
                            >
                              View Details
                            </button>
                          </div>
                         </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                  <div className="text-center py-8">
                    <AlertTriangle className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                    <p className="text-slate-400">No code smells detected yet. Run analysis to find issues.</p>
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* Security Tab */}
          {viewMode === 'security' && (
            <div className="space-y-6">
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h3 className="text-xl font-semibold mb-4 text-white">Security Analysis</h3>
                <div className="text-center py-8">
                  <Shield className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                  <p className="text-slate-400">Security analysis features coming soon...</p>
                </div>
              </div>
            </div>
          )}

          {/* Enhanced Analysis Tab */}
          {viewMode === 'enhanced' && (
            <div className="space-y-6">
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h3 className="text-xl font-semibold mb-4 text-white">Enhanced Code Analysis</h3>
                  {enhancedAnalysis ? (
                    <div className="space-y-6">
                    {/* File Overview */}
                    <div className="bg-slate-700 rounded-lg p-4 mb-6">
                      <h4 className="text-lg font-medium text-white mb-3">File Overview</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-400 mb-1">{enhancedAnalysis.metrics.classCount || 0}</div>
                          <div className="text-sm text-slate-300">Classes</div>
                            </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-400 mb-1">{enhancedAnalysis.metrics.methodCount || 0}</div>
                          <div className="text-sm text-slate-300">Methods</div>
                            </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-purple-400 mb-1">{enhancedAnalysis.metrics.commentLines || 0}</div>
                          <div className="text-sm text-slate-300">Comments</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-yellow-400 mb-1">{enhancedAnalysis.metrics.linesOfCode || 0}</div>
                          <div className="text-sm text-slate-300">Lines of Code</div>
                        </div>
                          </div>
                        </div>
                        
                    {/* Visual Charts Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                      {/* Code Smells Pie Chart */}
                      <div className="bg-slate-700 rounded-lg p-4">
                        <h4 className="text-lg font-medium text-white mb-4">Code Smells Distribution</h4>
                        <CodeSmellsPieChart 
                          critical={enhancedAnalysis.metrics.criticalIssues || 0}
                          major={enhancedAnalysis.metrics.majorIssues || 0}
                          minor={enhancedAnalysis.metrics.minorIssues || 0}
                        />
                            </div>

                      {/* Metrics Bar Chart */}
                      <div className="bg-slate-700 rounded-lg p-4">
                        <h4 className="text-lg font-medium text-white mb-4">File Metrics Comparison</h4>
                        <MetricsBarChart 
                          classes={enhancedAnalysis.metrics.classCount || 0}
                          methods={enhancedAnalysis.metrics.methodCount || 0}
                          comments={enhancedAnalysis.metrics.commentLines || 0}
                          lines={enhancedAnalysis.metrics.linesOfCode || 0}
                        />
                            </div>
                    </div>

                    {/* Quality Score Gauge */}
                    <div className="bg-slate-700 rounded-lg p-4 mb-6">
                      <h4 className="text-lg font-medium text-white mb-4 text-center">Overall Quality Score</h4>
                      <div className="flex justify-center">
                        <QualityGauge 
                          score={enhancedAnalysis.metrics.overallScore || 0}
                          maxScore={100}
                          label="Quality Score"
                        />
                          </div>
                        </div>
                        
                    {/* Metrics Overview with Visual Charts */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div className="bg-slate-700 rounded-lg p-4">
                        <h4 className="text-sm font-medium text-slate-300 mb-2">Maintainability Index</h4>
                        <div className="text-2xl font-bold text-white mb-2">
                          {enhancedAnalysis.metrics.maintainabilityIndex.toFixed(1)}
                            </div>
                        <div className="w-full bg-slate-600 rounded-full h-2">
                          <div 
                            className="bg-blue-500 h-2 rounded-full transition-all duration-300" 
                            style={{ width: `${Math.min(100, Math.max(0, enhancedAnalysis.metrics.maintainabilityIndex * 10))}%` }}
                          ></div>
                            </div>
                        <p className="text-xs text-slate-400 mt-1">Higher is better</p>
                          </div>
                      
                      <div className="bg-slate-700 rounded-lg p-4">
                        <h4 className="text-sm font-medium text-slate-300 mb-2">Technical Debt Ratio</h4>
                        <div className="text-2xl font-bold text-white mb-2">
                          {enhancedAnalysis.metrics.technicalDebtRatio.toFixed(1)}%
                        </div>
                        <div className="w-full bg-slate-600 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full transition-all duration-300 ${
                              enhancedAnalysis.metrics.technicalDebtRatio > 20 ? 'bg-red-500' :
                              enhancedAnalysis.metrics.technicalDebtRatio > 10 ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(100, enhancedAnalysis.metrics.technicalDebtRatio * 5)}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Lower is better</p>
                      </div>

                      <div className="bg-slate-700 rounded-lg p-4">
                        <h4 className="text-sm font-medium text-slate-300 mb-2">Overall Score</h4>
                        <div className="text-2xl font-bold text-white mb-2">
                          {enhancedAnalysis.metrics.overallScore}/100
                            </div>
                        <div className="w-full bg-slate-600 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full transition-all duration-300 ${
                              enhancedAnalysis.metrics.overallScore > 80 ? 'bg-green-500' :
                              enhancedAnalysis.metrics.overallScore > 60 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${enhancedAnalysis.metrics.overallScore}%` }}
                          ></div>
                            </div>
                        <p className="text-xs text-slate-400 mt-1">Quality rating</p>
                            </div>
                            </div>

                    {/* Code Smells Breakdown */}
                    <div className="bg-slate-700 rounded-lg p-4">
                      <h4 className="text-lg font-medium text-white mb-4">Code Smells Breakdown</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-red-400 mb-1">{enhancedAnalysis.metrics.criticalIssues}</div>
                          <div className="text-sm text-slate-300">Critical Issues</div>
                          <div className="text-xs text-slate-400 mt-1">Immediate attention required</div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-orange-400 mb-1">{enhancedAnalysis.metrics.majorIssues}</div>
                          <div className="text-sm text-slate-300">Major Issues</div>
                          <div className="text-xs text-slate-400 mt-1">Should be addressed soon</div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-yellow-400 mb-1">{enhancedAnalysis.metrics.minorIssues}</div>
                          <div className="text-sm text-slate-300">Minor Issues</div>
                          <div className="text-xs text-slate-400 mt-1">Consider for future refactoring</div>
                          </div>
                        </div>

                      {/* Visual Progress Bars for Issues */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-300">Critical</span>
                          <span className="text-xs text-slate-400">{enhancedAnalysis.metrics.criticalIssues}</span>
                            </div>
                        <div className="w-full bg-slate-600 rounded-full h-2">
                          <div 
                            className="bg-red-500 h-2 rounded-full transition-all duration-300" 
                            style={{ width: `${Math.min(100, (enhancedAnalysis.metrics.criticalIssues / Math.max(1, enhancedAnalysis.metrics.codeSmells)) * 100)}%` }}
                          ></div>
                            </div>
                        
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-300">Major</span>
                          <span className="text-xs text-slate-400">{enhancedAnalysis.metrics.majorIssues}</span>
                            </div>
                        <div className="w-full bg-slate-600 rounded-full h-2">
                          <div 
                            className="bg-orange-500 h-2 rounded-full transition-all duration-300" 
                            style={{ width: `${Math.min(100, (enhancedAnalysis.metrics.majorIssues / Math.max(1, enhancedAnalysis.metrics.codeSmells)) * 100)}%` }}
                          ></div>
                            </div>
                        
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-300">Minor</span>
                          <span className="text-xs text-slate-400">{enhancedAnalysis.metrics.minorIssues}</span>
                        </div>
                        <div className="w-full bg-slate-600 rounded-full h-2">
                          <div 
                            className="bg-yellow-500 h-2 rounded-full transition-all duration-300" 
                            style={{ width: `${Math.min(100, (enhancedAnalysis.metrics.minorIssues / Math.max(1, enhancedAnalysis.metrics.codeSmells)) * 100)}%` }}
                          ></div>
                          </div>
                        </div>
                      </div>

                      {/* Quality Insights */}
                     <div className="bg-slate-700 rounded-lg p-4">
                       <h4 className="text-lg font-medium text-white mb-3">Quality Insights</h4>
                          <div className="space-y-3">
                         <div className="flex items-center justify-between">
                           <span className="text-slate-300">Overall Score:</span>
                           <span className="font-medium text-white">{enhancedAnalysis.qualityInsights.overallScore.toFixed(1)}</span>
                            </div>
                         <div className="flex items-center justify-between">
                           <span className="text-slate-300">Quality Category:</span>
                           <span className="font-medium text-white">{enhancedAnalysis.qualityInsights.qualityCategory}</span>
                                </div>
                         <div className="flex items-center justify-between">
                           <span className="text-slate-300">Needs Attention:</span>
                           <span className={`font-medium ${enhancedAnalysis.qualityInsights.needsAttention ? 'text-red-400' : 'text-green-400'}`}>
                             {enhancedAnalysis.qualityInsights.needsAttention ? 'Yes' : 'No'}
                           </span>
                              </div>
                         <div className="flex items-center justify-between">
                           <span className="text-slate-300">Refactoring Priority:</span>
                           <span className="font-medium text-white">{enhancedAnalysis.qualityInsights.refactoringPriority}/10</span>
                                </div>
                              </div>
                          </div>

                      {/* Recommendations */}
                     <div className="bg-slate-700 rounded-lg p-4">
                       <h4 className="text-lg font-medium text-white mb-3">Recommendations</h4>
                          <div className="space-y-3">
                         <div className="flex items-center justify-between">
                           <span className="text-slate-300">Priority:</span>
                           <span className="font-medium text-white">{enhancedAnalysis.recommendations.priority}/10</span>
                            </div>
                         <div className="flex items-center justify-between">
                           <span className="text-slate-300">Estimated Effort:</span>
                           <span className="font-medium text-white">{enhancedAnalysis.recommendations.estimatedEffort} hours</span>
                         </div>
                         <div className="mt-3">
                           <h5 className="text-sm font-medium text-white mb-2">Recommended Actions:</h5>
                           <div className="space-y-2">
                             {Object.entries(enhancedAnalysis.recommendations.actions).map(([key, action], index) => (
                               <div key={index} className="flex items-start space-x-2">
                                 <Lightbulb className="w-4 h-4 text-yellow-400 mt-0.5" />
                                 <div>
                                   <p className="text-white text-sm font-medium">{key}</p>
                                   <p className="text-slate-300 text-xs">{action}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                       </div>
                     </div>
                    </div>
                  ) : (
                  <div className="text-center py-8">
                    <Zap className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                    <p className="text-slate-400">Select a file and run enhanced analysis to see detailed insights.</p>
                    </div>
                  )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* File Viewer Modal */}
      {showFileViewer && selectedFileContent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg w-4/5 h-4/5 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">File Content</h3>
              <button
                onClick={() => setShowFileViewer(false)}
                className="text-slate-400 hover:text-white"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-sm text-slate-300 whitespace-pre-wrap">{selectedFileContent}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
