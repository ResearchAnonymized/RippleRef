'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Code, Zap, FileText, AlertTriangle, CheckCircle, Info, XCircle,
  BarChart3, Target, Lightbulb, Search, Filter, Download, RefreshCw,
  Folder, PieChart, Eye, ChevronRight, ChevronDown, Clock,
  TrendingUp, GitBranch, Settings, Play, StopCircle, AlertCircle,
  CheckCircle2, MinusCircle, PlusCircle, ExternalLink, Copy, Edit3,
  Trash2, Star, Activity, Layers, Database, Cpu, HardDrive, Network,
  Lock, Unlock, Bug, Wrench, BookOpen, FileCode, GitCommit, Calendar,
  User, Users, Globe, Server, Monitor, Smartphone, Tablet, TestTube,
  ChevronLeft, ChevronFirst, ChevronLast, ChevronUp, X, Grid, List, Maximize2,
  Minimize2, MoreHorizontal, ArrowUpDown, Filter as FilterIcon, ArrowLeft, Brain,
  Wand2, FolderGit2, FileSpreadsheet, GitCompare, Sparkles
} from 'lucide-react';
import { apiClient, FileInfo, Assessment, Plan, DependencyGraphData, FileDependencyAnalysis } from '../api/client';
import { BrandName } from './BrandLogo';
import { CodeSmellsPieChart, MetricsBarChart, QualityGauge } from './Charts';
import DependencyGraph from './DependencyGraph';
import DependencyMetrics from './DependencyMetrics';
import FilterSidebar from './FilterSidebar';
import { SkeletonCard, SkeletonChart, SkeletonFileList, SkeletonCodeSmell, FileAnalysisSkeleton, CodeSmellListSkeleton } from './SkeletonLoader';
import CodePreview from './CodePreview';
import CodeViewer from './CodeViewer';
import ErrorBoundary from './ErrorBoundary';
import RefactoringMonitor from './RefactoringMonitor';
import ControlledRefactoring from './ControlledRefactoring';
import RefactoringOperations from './RefactoringOperations';
// SecurityAnalysisDashboard removed from navigation (file preserved for backup)
// import SecurityAnalysisDashboard from './SecurityAnalysisDashboard';
import ProjectHub, { projectHubUtils } from './ProjectHub';
import CodeSmellsDashboard from './CodeSmellsDashboard';
import BatchRefactoring from './BatchRefactoring';
import BaselineComparisonPanel from './BaselineComparisonPanel';
import FileImpactDependencyGraph from './FileImpactDependencyGraph';
import {
  mapProgressFiles,
  isFileAnalyzed,
  getRefactoringOutcomeFiles,
  normalizeFilePath,
  countRefactoredFiles,
  type FileProgressMap,
} from '../lib/fileActivity';
import { runFullWorkspacePmdScan } from '../lib/bootstrapWorkspacePmd';
import SavedRefactoredFilesPanel, { type RefactoredFileEntry } from './SavedRefactoredFilesPanel';
import SavedExcelExportsPanel from './SavedExcelExportsPanel';
import ProjectRefactoringExcelExportModal from './ProjectRefactoringExcelExportModal';
import CrossProjectExcelExportModal from './CrossProjectExcelExportModal';
import FileResearchReportModal from './FileResearchReportModal';
import { isRefineDemo } from '../lib/refineDemoMode';

/** Research-only UI; off in REFINE production (saved Excel panels remain on dashboard). */
const ENABLE_BASELINE_NAV =
  !isRefineDemo() && process.env.NEXT_PUBLIC_ENABLE_BASELINE_COMPARISON === '1';
const ENABLE_RIPPLE_REF_NAV =
  !isRefineDemo() && process.env.NEXT_PUBLIC_ENABLE_RIPPLE_REF_STUDY === '1';
const REFINE_DEMO = isRefineDemo();
import {
  buildWorkspaceStudyCsv,
  defaultWorkspaceStudyFilename,
  downloadWorkspaceStudyCsv,
} from '../lib/exportWorkspaceStudyCsv';
import {
  collectPmdCategories,
  pmdCategoryBadgeClass,
  smellPmdCategory,
  smellRuleName,
} from '../lib/pmdSmellCategory';
import {
  effectivePmdCount,
  fileStaticSmellCount,
  sortFileInfos,
  type FileListSortKey,
} from '../lib/fileListSort';

interface ImprovedDashboardProps {
  workspaceId: string;
  workspaceName?: string;
  files: FileInfo[];
  assessment: Assessment | null;
  plan: Plan | null;
  onAnalysisComplete?: () => void;
  setCurrentWorkspace?: (workspace: any) => void;
  onProjectResume?: (workspaceId: string) => void | Promise<void>;
  currentUserId?: string;
  currentUserName?: string;
  onCloneProject?: (gitUrl: string, branch: string) => void;
  onUploadProject?: (files: File[]) => void | Promise<void>;
  /** Increment to open Project Hub with upload/clone panel (keeps existing projects). */
  openNewProjectTick?: number;
  /** Reload files + assessment from parent after a full PMD scan. */
  onReloadWorkspace?: () => Promise<void>;
}

export default function ImprovedDashboard({ 
  workspaceId,
  workspaceName,
  files, 
  assessment, 
  plan, 
  onAnalysisComplete,
  setCurrentWorkspace,
  onProjectResume,
  currentUserId,
  currentUserName,
  onCloneProject,
  onUploadProject,
  openNewProjectTick,
  onReloadWorkspace,
}: ImprovedDashboardProps) {
  // Default to 'projects' view if no workspace is loaded yet
  const [activeView, setActiveView] = useState<'overview' | 'files' | 'analysis' | 'dependencies' | 'refactoring' | 'batch' | 'baseline' | 'monitor' | 'projects'>(workspaceId ? 'overview' : 'projects');
  const [rippleRefFocus, setRippleRefFocus] = useState(false);
  const [maRefFocus, setMaRefFocus] = useState(false);
  const lastNewProjectTick = useRef(0);

  const openRippleRefStudy = useCallback(() => {
    setRippleRefFocus(true);
    setMaRefFocus(false);
    setActiveView('projects');
    window.setTimeout(() => {
      document.getElementById('ripple-ref-study')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }, []);

  const openMaRefStudy = useCallback(() => {
    setMaRefFocus(true);
    setRippleRefFocus(false);
    setActiveView('projects');
    window.setTimeout(() => {
      document.getElementById('ma-ref-study')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }, []);

  useEffect(() => {
    if (!openNewProjectTick || openNewProjectTick === lastNewProjectTick.current) return;
    lastNewProjectTick.current = openNewProjectTick;
    setActiveView('projects');
  }, [openNewProjectTick]);
  const [refactoringMode, setRefactoringMode] = useState<'agentic' | 'operations'>('agentic');
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [fileAnalysis, setFileAnalysis] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileAnalysisRef = useRef<any>(null);
  const [fileViewMode, setFileViewMode] = useState<'grid' | 'list'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState('');
  const [fileStatusFilter, setFileStatusFilter] = useState<'' | 'pending' | 'analyzed' | 'refactored' | 'rejected' | 'error'>('');
  const [showOnlyCodeSmellsFiles, setShowOnlyCodeSmellsFiles] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Method-Level Smells', 'Code Structure Smells']));
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<FileListSortKey>('size');
  const [isExporting, setIsExporting] = useState(false);
  const [isRunningFullAnalysis, setIsRunningFullAnalysis] = useState(false);
  const [fullAnalysisStatus, setFullAnalysisStatus] = useState<string | null>(null);
  const [refactoringProgressCollapsed, setRefactoringProgressCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const stored = localStorage.getItem('refactai-progress-panel-collapsed');
      if (stored === '1') return true;
      if (stored === '0') return false;
    } catch {
      /* ignore */
    }
    return true;
  });
  const [fileBrowserChromeCollapsed, setFileBrowserChromeCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const stored = localStorage.getItem('refactai-file-browser-chrome-collapsed');
      if (stored === '1') return true;
      if (stored === '0') return false;
    } catch {
      /* ignore */
    }
    return true;
  });
  const toggleFileBrowserChrome = useCallback(() => {
    setFileBrowserChromeCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('refactai-file-browser-chrome-collapsed', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const [currentView, setCurrentView] = useState<'files' | 'dashboard'>('files');
  const [showExcelExportModal, setShowExcelExportModal] = useState(false);
  const [showCrossProjectExcelModal, setShowCrossProjectExcelModal] = useState(false);
  const [excelExportsRefreshKey, setExcelExportsRefreshKey] = useState(0);
  const bumpExcelExportsRefresh = useCallback(() => {
    setExcelExportsRefreshKey((k) => k + 1);
  }, []);

  // Per-file refactoring progress (loaded from backend)
  const [fileProgress, setFileProgress] = useState<FileProgressMap>({});
  /** Paths with saved full report archives (used to surface rejected runs missing from file-status). */
  const [savedReportPaths, setSavedReportPaths] = useState<Set<string>>(new Set());
  const pendingOpenRefactored = useRef<'first' | string | null>(null);
  const pendingOpenExcelExport = useRef(false);

  const reloadFileProgress = useCallback(() => {
    if (!workspaceId) return Promise.resolve();
    return Promise.all([
      apiClient.getProjectProgress(workspaceId).then((prog) => {
        setFileProgress(mapProgressFiles(prog.files as Array<Record<string, unknown>>));
      }),
      apiClient.listSavedRefactoringReports(workspaceId).then((list) => {
        setSavedReportPaths(new Set((list.reports ?? []).map((r) => r.filePath)));
      }),
    ]).catch(() => { /* keep existing map */ });
  }, [workspaceId]);

  const exportWorkspaceStudyCsv = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const prog = await apiClient.getProjectProgress(workspaceId);
      const iso = new Date().toISOString();
      const csv = buildWorkspaceStudyCsv({
        workspaceId,
        exportedAtIso: iso,
        summary: {
          totalFiles: prog.totalFiles,
          analyzed: prog.analyzed,
          refactored: prog.refactored,
          rejected: prog.rejected,
          pending: prog.pending,
          progressPercent: prog.progressPercent,
        },
        files: prog.files ?? [],
      });
      downloadWorkspaceStudyCsv(defaultWorkspaceStudyFilename(workspaceId, iso), csv);
    } catch (e) {
      console.error('Workspace study CSV export failed', e);
    }
  }, [workspaceId]);

  /** PMD totals from Java files only (matches Run Analysis scan scope). */
  const javaFilesInList = useMemo(
    () => files.filter((f) => f.name?.endsWith('.java')),
    [files]
  );
  const pmdJavaWithCounts = useMemo(
    () => javaFilesInList.filter((f) => effectivePmdCount(f, fileProgress) !== null).length,
    [javaFilesInList, fileProgress]
  );
  const pmdTotalSmells = useMemo(
    () => javaFilesInList.reduce((sum, f) => sum + (effectivePmdCount(f, fileProgress) ?? 0), 0),
    [javaFilesInList, fileProgress]
  );
  const pmdFilesWithSmells = useMemo(
    () => javaFilesInList.filter((f) => (effectivePmdCount(f, fileProgress) ?? 0) > 0).length,
    [javaFilesInList, fileProgress]
  );
  
  // Code smell filter states
  const [smellSearchTerm, setSmellSearchTerm] = useState('');
  const [smellSeverityFilter, setSmellSeverityFilter] = useState('');
  const [smellCategoryFilter, setSmellCategoryFilter] = useState('');
  
  // Advanced filtering states
  const [showFilterSidebar, setShowFilterSidebar] = useState(false);
  const [activeFilters, setActiveFilters] = useState({
    severities: [] as string[],
    smellTypes: [] as string[],
    fileTypes: [] as string[],
    searchTerm: '',
    quickFilters: [] as string[]
  });
  
  // Dependency analysis states
  const [dependencyGraph, setDependencyGraph] = useState<DependencyGraphData | null>(null);
  const [fileDependencyAnalysis, setFileDependencyAnalysis] = useState<FileDependencyAnalysis | null>(null);
  const [loadingDependencies, setLoadingDependencies] = useState(false);

  /** Convert API dependency graph into nodes expected by canvas DependencyGraph */
  const projectGraphCanvasNodes = useMemo(() => {
    if (!dependencyGraph?.nodes?.length) return [];
    const depsBySource = new Map<string, string[]>();
    const dependentsByTarget = new Map<string, string[]>();
    for (const e of dependencyGraph.edges || []) {
      if (!depsBySource.has(e.source)) depsBySource.set(e.source, []);
      depsBySource.get(e.source)!.push(e.target);
      if (!dependentsByTarget.has(e.target)) dependentsByTarget.set(e.target, []);
      dependentsByTarget.get(e.target)!.push(e.source);
    }
    return dependencyGraph.nodes.map((n) => {
      const id = n.path || n.id;
      return {
        id,
        name: n.label || id.split('/').pop() || id,
        type: 'class' as const,
        package: id.includes('/') ? id.split('/').slice(0, -1).join('.') : '',
        dependencies: depsBySource.get(id) || [],
        dependents: dependentsByTarget.get(id) || [],
        complexity: 0,
        linesOfCode: 0,
        isModified: false,
      };
    });
  }, [dependencyGraph]);
  
  // Code preview states
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [showFileResearchReport, setShowFileResearchReport] = useState(false);
  const [showFileViewer, setShowFileViewer] = useState(false);
  const [fileContent, setFileContent] = useState<string>('');
  const [loadingFileContent, setLoadingFileContent] = useState(false);
  const [fileCodeSmells, setFileCodeSmells] = useState<any[]>([]);
  const [currentPreviewFile, setCurrentPreviewFile] = useState<FileInfo | null>(null);
  
  // Load file content for preview
  const loadFileContent = async (file: FileInfo) => {
    setLoadingFileContent(true);
    
    // Clear any existing analysis data to force fresh analysis
    setFileAnalysis(null);
    setFileCodeSmells([]);
    fileAnalysisRef.current = null;
    
    try {
      // Load file content
      const response = await apiClient.getFileContent(workspaceId, file.relativePath);
      setFileContent(response.content);
      setCurrentPreviewFile(file);
      
      // Load Enhanced Analysis data (used for metrics/details only)
      try {
        console.log('Loading Enhanced Analysis for file:', file.relativePath);
        
        // Try Enhanced Analysis first for accurate data
        // Add cache-busting timestamp to ensure fresh analysis
        const timestamp = Date.now();
        const analysisResponse = await apiClient.analyzeFileEnhanced(workspaceId, file.relativePath);
        console.log('✅ Enhanced analysis loaded:', analysisResponse);
        console.log('🔍 Analysis timestamp:', timestamp);
        
        // Static smells = PMD via /workspace-enhanced-analysis (same as file-list counts).
        // Do not replace with assessment evidences here — those use a different engine (Fowler-style IDs).
        setFileAnalysis(analysisResponse);
        setFileCodeSmells(analysisResponse.codeSmells || []);
        
      } catch (analysisError) {
        console.warn('⚠️ PMD enhanced analysis failed:', analysisError);
        setFileAnalysis(null);
        setFileCodeSmells([]);
      }
      
      setShowCodePreview(true);
    } catch (error) {
      console.error('Failed to load file content:', error);
    } finally {
      setLoadingFileContent(false);
    }
  };

  const refactoredFileEntries = useMemo((): RefactoredFileEntry[] => {
    const matched = getRefactoringOutcomeFiles(files, fileProgress);
    const entries: RefactoredFileEntry[] = matched.map((f) => ({
      file: f,
      activity: f.activity,
    }));
    const seen = new Set(entries.map((e) => e.file.relativePath));
    for (const [path, activity] of Object.entries(fileProgress)) {
      if (
        (activity.status !== 'refactored' && activity.status !== 'rejected') ||
        seen.has(path)
      ) {
        continue;
      }
      entries.push({
        file: {
          name: path.split('/').pop() || path,
          relativePath: path,
          type: 'SOURCE',
          metrics: {
            linesOfCode: 0,
            cyclomaticComplexity: 0,
            cognitiveComplexity: 0,
            methodCount: 0,
            classCount: 0,
            commentLines: 0,
            blankLines: 0,
          },
          findings: 0,
          codeSmells: 0 as any,
          lastModified: activity.lastRefactorAt ?? Date.now(),
        },
        activity,
      });
    }
    // Archived reports without file-status (e.g. rejected before persist fix)
    for (const path of savedReportPaths) {
      if (seen.has(path)) continue;
      const fp = fileProgress[path];
      if (fp?.status === 'refactored') continue;
      entries.push({
        file: {
          name: path.split('/').pop() || path,
          relativePath: path,
          type: 'SOURCE',
          metrics: {
            linesOfCode: 0,
            cyclomaticComplexity: 0,
            cognitiveComplexity: 0,
            methodCount: 0,
            classCount: 0,
            commentLines: 0,
            blankLines: 0,
          },
          findings: 0,
          codeSmells: 0 as any,
          lastModified: Date.now(),
        },
        activity: fp ?? {
          status: 'rejected',
          smellsBefore: 0,
          smellsAfter: 0,
          humanVerdict: null,
          lastRefactorAt: Date.now(),
        },
      });
    }
    entries.sort(
      (a, b) =>
        (b.activity.lastRefactorAt ?? b.activity.savedToProjectAt ?? 0) -
        (a.activity.lastRefactorAt ?? a.activity.savedToProjectAt ?? 0)
    );
    return entries;
  }, [files, fileProgress, savedReportPaths]);

  const openRefactoredFile = useCallback(
    async (relativePath: string) => {
      const t = normalizeFilePath(relativePath);
      let file =
        files.find((f) => normalizeFilePath(f.relativePath) === t) ||
        files.find((f) => normalizeFilePath(f.relativePath).endsWith('/' + t.split('/').pop())) ||
        null;
      if (!file) {
        file = {
          name: t.split('/').pop() || t,
          relativePath: relativePath,
          type: 'SOURCE',
          metrics: {
            linesOfCode: 0,
            cyclomaticComplexity: 0,
            cognitiveComplexity: 0,
            methodCount: 0,
            classCount: 0,
            commentLines: 0,
            blankLines: 0,
          },
          findings: 0,
          codeSmells: 0 as any,
          lastModified: Date.now(),
        };
      }
      const activity = fileProgress[normalizeFilePath(relativePath)] ?? fileProgress[relativePath];
      setActiveView('files');
      setFileStatusFilter(
        activity?.status === 'rejected' ? 'rejected' : 'refactored'
      );
      setSelectedFile(file);
      await loadFileContent(file);
    },
    [files, fileProgress]
  );

  const showRefactoredInFileList = useCallback(() => {
    setActiveView('files');
    setFileStatusFilter('');
    setCurrentPage(0);
  }, []);

  useEffect(() => {
    if (!pendingOpenRefactored.current || !workspaceId) return;
    if (refactoredFileEntries.length === 0) return;
    const token = pendingOpenRefactored.current;
    pendingOpenRefactored.current = null;
    const path =
      token === 'first'
        ? refactoredFileEntries[0].file.relativePath
        : token;
    void openRefactoredFile(path);
  }, [workspaceId, refactoredFileEntries, openRefactoredFile]);

  useEffect(() => {
    if (!pendingOpenExcelExport.current || !workspaceId) return;
    pendingOpenExcelExport.current = false;
    setShowExcelExportModal(true);
  }, [workspaceId]);

  /** Full-project PMD scan + optional legacy assess/plan (triggered by Run Analysis). */
  const runFullProjectAnalysis = useCallback(async () => {
    if (!workspaceId || isRunningFullAnalysis) return;
    setIsRunningFullAnalysis(true);
    setFullAnalysisStatus(null);
    try {
      let javaSources = files.filter((f) => f.name?.endsWith('.java')).length;
      try {
        const summary = await apiClient.getWorkspaceFileSummary(workspaceId);
        // All .java files in workspace (file browser SOURCE count), not Maven src/main/java only.
        javaSources = summary.sourceFiles ?? javaSources;
      } catch {
        /* use file list estimate */
      }

      if (javaSources <= 0) {
        alert('No Java files found in this workspace.');
        return;
      }

      setFullAnalysisStatus(
        `Running PMD on ${javaSources} Java file(s) in workspace… (batched; may take 10–90+ min on large trees — keep the backend Terminal open)`
      );
      const scan = await runFullWorkspacePmdScan(workspaceId, javaSources, (done, total) => {
        setFullAnalysisStatus(
          `Running PMD… ${done.toLocaleString()} / ${total.toLocaleString()} Java files scanned`
        );
      });
      console.log('PMD workspace scan:', scan);

      if (javaSources <= 800) {
        setFullAnalysisStatus('Running project assessment…');
        try {
          await apiClient.assessProject(workspaceId);
          await apiClient.generatePlan(workspaceId);
        } catch (assessErr) {
          console.warn('Assessment/plan after PMD scan:', assessErr);
        }
      }

      setFullAnalysisStatus('Refreshing file list…');
      if (onReloadWorkspace) {
        await onReloadWorkspace();
      }
      await reloadFileProgress();

      const msg = scan.truncated
        ? `PMD scan completed for ${scan.filesScanned} of ${scan.totalJavaSourceFiles} Java files.`
        : `PMD scan complete: ${scan.filesScanned} of ${scan.totalJavaSourceFiles} Java files, ${scan.totalSmells} smell(s) total. Sort by smells to review.`;
      setFullAnalysisStatus(msg);
    } catch (error) {
      console.error('Full project analysis failed:', error);
      const detail = error instanceof Error ? error.message : String(error);
      alert(
        `Analysis failed: ${detail}\n\nLarge projects can take 5–30+ minutes. Keep all Terminal windows open.\nIf the backend log shows "scan complete", refresh the file list — smells may already be saved.`
      );
      setFullAnalysisStatus(null);
    } finally {
      setIsRunningFullAnalysis(false);
    }
  }, [
    workspaceId,
    isRunningFullAnalysis,
    files,
    onReloadWorkspace,
    reloadFileProgress,
  ]);

  // Start analysis with a specific workspace (Project Hub — includes PMD + assess for small projects)
  const startAnalysisWithWorkspace = async (workspace: { id: string }) => {
    if (!workspace?.id) return;
    if (workspace.id !== workspaceId) {
      await onProjectResume?.(workspace.id);
      return;
    }
    await runFullProjectAnalysis();
  };

  // Load dependency analysis data
  const loadDependencyGraph = async () => {
    setLoadingDependencies(true);
    try {
      const data = await apiClient.getDependencyGraph(workspaceId);
      setDependencyGraph(data);
    } catch (error) {
      console.error('Failed to load dependency graph:', error);
    } finally {
      setLoadingDependencies(false);
    }
  };

  const loadFileDependencyAnalysis = async (filePath: string) => {
    try {
      const analysis = await apiClient.analyzeFileDependencies(workspaceId, filePath);
      setFileDependencyAnalysis(analysis);
    } catch (error) {
      console.error('Failed to load file dependency analysis:', error);
    }
  };

  // Listen for associated-file open events from child components (e.g., ControlledRefactoring)
  useEffect(() => {
    const handler = (e: any) => {
      try {
        const targetPath: string | undefined = e?.detail?.filePath;
        if (!targetPath) return;
        // Find best match from known files
        const norm = (p: string) => String(p || '').replace(/\\\\/g, '/').toLowerCase();
        const t = norm(targetPath);
        const file =
          files.find(f => norm(f.relativePath) === t) ||
          files.find(f => norm(f.relativePath).endsWith('/' + t.split('/').pop())) ||
          null;
        if (file) {
          setSelectedFile(file);
          setActiveView('analysis');
          setFileAnalysis(null);
          setTimeout(() => analyzeFile(), 100);
        } else {
          console.warn('Associated file not found in workspace files:', targetPath);
          // Fallback: attempt to open by path directly and analyze
          (async () => {
            try {
              const contentResp = await apiClient.getFileContent(workspaceId, targetPath);
              const pseudoFile: FileInfo = {
                name: targetPath.split('/').pop() || targetPath,
                relativePath: targetPath,
                type: 'SOURCE',
                metrics: {
                  linesOfCode: (contentResp?.content || '').split('\\n').length,
                  cyclomaticComplexity: 0,
                  cognitiveComplexity: 0,
                  methodCount: 0,
                  classCount: 0,
                  commentLines: 0,
                  blankLines: 0,
                },
                findings: 0,
                codeSmells: 0 as any,
                lastModified: Date.now(),
              };
              setSelectedFile(pseudoFile);
              setActiveView('analysis');
              setFileAnalysis(null);
              setTimeout(() => analyzeFile(), 100);
            } catch (openErr) {
              console.error('Failed to open associated file content:', openErr);
            }
          })();
        }
      } catch (err) {
        console.error('Failed to open associated file:', err);
      }
    };
    window.addEventListener('refactai-open-associated-file', handler as EventListener);
    return () => window.removeEventListener('refactai-open-associated-file', handler as EventListener);
  }, [files]);

  // File analysis function
  const analyzeFile = async () => {
    if (!selectedFile) return;

    setSmellSeverityFilter('');
    setIsAnalyzing(true);
    
    // Clear any existing analysis data to force fresh analysis
    setFileAnalysis(null);
    setFileCodeSmells([]);
    fileAnalysisRef.current = null;
    
    // Force clear browser cache for this analysis
    if (typeof window !== 'undefined') {
      // Clear any localStorage cache
      Object.keys(localStorage).forEach(key => {
        if (key.includes('analysis') || key.includes('codeSmells')) {
          localStorage.removeItem(key);
        }
      });
    }
    
    try {
      console.log('🔍 Starting FRESH file analysis for:', selectedFile.relativePath);
      
      // Always reload file content for the selected path (never reuse another file's buffer)
      apiClient
        .getFileContent(workspaceId, selectedFile.relativePath)
        .then((resp) => setFileContent(resp.content || ''))
        .catch((err) => console.warn('Failed to preload file content:', err));
      
      // Always use enhanced analysis for comprehensive detection
      console.log('🔍 Using enhanced analysis for comprehensive code smell detection...');
      const timestamp = Date.now();
      const analysisResult = await apiClient.analyzeFileEnhanced(workspaceId, selectedFile.relativePath);
      console.log('✅ Enhanced analysis result:', analysisResult);
      console.log('🔍 Analysis timestamp:', timestamp);
      
      // Transform the backend data to match our UI structure
      console.log('🔍 Raw analysis result:', analysisResult);
      console.log('🔍 Code smells from result:', (analysisResult as any)?.codeSmells?.length || 0);
      console.log('🔍 Analysis result keys:', analysisResult ? Object.keys(analysisResult) : 'NO_RESULT');
      console.log('🔍 Code smells type:', typeof (analysisResult as any)?.codeSmells);
      console.log('🔍 Code smells array:', (analysisResult as any)?.codeSmells);
      
      // Debug the raw data structure
      const rawCodeSmells = (analysisResult as any)?.codeSmells;
      console.log('🔍 Raw codeSmells:', rawCodeSmells);
      console.log('🔍 Raw codeSmells length:', rawCodeSmells?.length);
      console.log('🔍 Raw codeSmells type:', typeof rawCodeSmells);
      console.log('🔍 Raw codeSmells is array:', Array.isArray(rawCodeSmells));
      
      const transformedAnalysis = {
        filePath: selectedFile.relativePath,
        // Preserve Enhanced Analysis data
        linesOfCode: (analysisResult as any)?.linesOfCode || 0,
        complexity: (analysisResult as any)?.complexity || 0,
        maintainability: (analysisResult as any)?.maintainability || 0,
        testability: (analysisResult as any)?.testability || 0,
        metrics: analysisResult.metrics || selectedFile.metrics,
        codeSmells: rawCodeSmells || [],
        qualityInsights: (analysisResult as any)?.qualityInsights || null,
        recommendations: (analysisResult as any)?.recommendations || null,
        categories: {
          'Class-Level Smells': ((analysisResult as any)?.codeSmells || []).filter((smell: any) =>
            smell.category === 'BLOATER' && (smell.type === 'LARGE_CLASS' || smell.type === 'DATA_CLASS' || smell.type === 'LAZY_CLASS')
          ).map((smell: any) => ({
            id: `${smell.type}-${smell.startLine}`,
            name: smell.title,
            description: smell.description,
            severity: smell.severity,
            suggestion: smell.recommendation,
            explanation: `This ${smell.type.toLowerCase().replace(/_/g, ' ')} affects class design and maintainability.`,
            impact: smell.severity === 'CRITICAL' ? 'High' : smell.severity === 'MAJOR' ? 'Medium' : 'Low'
          })),
          'Method-Level Smells': ((analysisResult as any)?.codeSmells || []).filter((smell: any) =>
            smell.category === 'BLOATER' && (smell.type === 'LONG_METHOD' || smell.type === 'LONG_PARAMETER_LIST') ||
            smell.category === 'CHANGE_PREVENTER' && smell.type === 'SHOTGUN_SURGERY' ||
            smell.category === 'DISPENSABLE' && smell.type === 'DUPLICATE_CODE'
          ).map((smell: any) => ({
            id: `${smell.type}-${smell.startLine}`,
            name: smell.title,
            description: smell.description,
            severity: smell.severity,
            suggestion: smell.recommendation,
            explanation: `This ${smell.type.toLowerCase().replace(/_/g, ' ')} impacts method design and code maintainability.`,
            impact: smell.severity === 'CRITICAL' ? 'High' : smell.severity === 'MAJOR' ? 'Medium' : 'Low'
          })),
          'Code Structure Smells': ((analysisResult as any)?.codeSmells || []).filter((smell: any) =>
            smell.category === 'DISPENSABLE' && (smell.type === 'COMMENTS' || smell.type === 'DEAD_CODE') ||
            smell.category === 'BLOATER' && smell.type === 'PRIMITIVE_OBSESSION'
          ).map((smell: any) => ({
            id: `${smell.type}-${smell.startLine}`,
            name: smell.title,
            description: smell.description,
            severity: smell.severity,
            suggestion: smell.recommendation,
            explanation: `This ${smell.type.toLowerCase().replace(/_/g, ' ')} affects code structure and readability.`,
            impact: smell.severity === 'CRITICAL' ? 'High' : smell.severity === 'MAJOR' ? 'Medium' : 'Low'
          })),
          'Design & Architecture Smells': ((analysisResult as any)?.codeSmells || []).filter((smell: any) =>
            smell.category === 'COUPLER' && smell.type === 'FEATURE_ENVY' ||
            smell.category === 'CHANGE_PREVENTER' && smell.type === 'DIVERGENT_CHANGE'
          ).map((smell: any) => ({
            id: `${smell.type}-${smell.startLine}`,
            name: smell.title,
            description: smell.description,
            severity: smell.severity,
            suggestion: smell.recommendation,
            explanation: `This ${smell.type.toLowerCase().replace(/_/g, ' ')} affects design and architecture patterns.`,
            impact: smell.severity === 'CRITICAL' ? 'High' : smell.severity === 'MAJOR' ? 'Medium' : 'Low'
          })),
          'Concurrency & Performance Smells': ((analysisResult as any)?.codeSmells || []).filter((smell: any) =>
            smell.category === 'COUPLER' && smell.type === 'THREAD_SAFETY' ||
            smell.category === 'BLOATER' && smell.type === 'EXCESSIVE_OBJECT_CREATION'
          ).map((smell: any) => ({
            id: `${smell.type}-${smell.startLine}`,
            name: smell.title,
            description: smell.description,
            severity: smell.severity,
            suggestion: smell.recommendation,
            explanation: `This ${smell.type.toLowerCase().replace(/_/g, ' ')} affects concurrency and performance.`,
            impact: smell.severity === 'CRITICAL' ? 'High' : smell.severity === 'MAJOR' ? 'Medium' : 'Low'
          })),
          'Testability Smells': ((analysisResult as any)?.codeSmells || []).filter((smell: any) =>
            smell.category === 'DISPENSABLE' && smell.type === 'HARD_TO_TEST' ||
            smell.category === 'BLOATER' && smell.type === 'MISSING_UNIT_TESTS'
          ).map((smell: any) => ({
            id: `${smell.type}-${smell.startLine}`,
            name: smell.title,
            description: smell.description,
            severity: smell.severity,
            suggestion: smell.recommendation,
            explanation: `This ${smell.type.toLowerCase().replace(/_/g, ' ')} affects code testability and quality assurance.`,
            impact: smell.severity === 'CRITICAL' ? 'High' : smell.severity === 'MAJOR' ? 'Medium' : 'Low'
          }))
        }
      };
      
      // Update both state and ref immediately
      setFileAnalysis(transformedAnalysis);
      fileAnalysisRef.current = transformedAnalysis;
      
      console.log('✅ File analysis completed successfully');
      console.log('📊 Transformed analysis:', transformedAnalysis);
      console.log('📊 Transformed analysis codeSmells length:', transformedAnalysis.codeSmells?.length || 0);
      console.log('📊 Transformed analysis keys:', Object.keys(transformedAnalysis));
      console.log('📊 Setting file analysis state to:', transformedAnalysis);
      console.log('📊 File analysis ref updated to:', fileAnalysisRef.current);
      void reloadFileProgress();
    } catch (error) {
      console.error('❌ Failed to analyze file:', error);
      
      // Create a fallback analysis with basic file info
      const fallbackAnalysis = {
        filePath: selectedFile.relativePath,
        metrics: selectedFile.metrics || {
          linesOfCode: 0,
          methodCount: 0,
          classCount: 0,
          complexity: 0
        },
        codeSmells: [],
        categories: {
          'No Analysis Available': [{
            id: 'no-analysis',
            name: 'Analysis Failed',
            description: 'Unable to analyze this file. This might be due to file format or backend issues.',
            severity: 'MINOR',
            suggestion: 'Try refreshing the page or check the console for errors.',
            explanation: 'The file analysis service is currently unavailable.',
            impact: 'Low'
          }]
        }
      };
      
      setFileAnalysis(fallbackAnalysis);
      
      // Show user-friendly error message
      console.warn('⚠️ Using fallback analysis due to error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Auto-analyze when a file is selected
  useEffect(() => {
    if (selectedFile) {
      console.log('🔄 File selected, starting analysis for:', selectedFile.relativePath);
      console.log('🔄 Current activeView:', activeView);
      // Clear stale buffer so refactor/metrics never use the previous file's text
      setFileContent('');
      setFileCodeSmells([]);
      setFileAnalysis(null);
      analyzeFile();
      loadFileDependencyAnalysis(selectedFile.relativePath);
      apiClient
        .getFileContent(workspaceId, selectedFile.relativePath)
        .then((resp) => setFileContent(resp.content || ''))
        .catch((err) => console.warn('Failed to load file content on select:', err));
    }
  }, [selectedFile]);

  // Also trigger analysis when switching to analysis view with a selected file
  useEffect(() => {
    if (activeView === 'analysis' && selectedFile && !fileAnalysis) {
      console.log('🔄 Switched to analysis view, starting analysis for:', selectedFile.relativePath);
      setFileAnalysis(null);
      analyzeFile();
    }
  }, [activeView, selectedFile]);

  // Debug file analysis state changes
  useEffect(() => {
    console.log('🔍 File analysis state changed:', fileAnalysis);
    if (fileAnalysis) {
      console.log('🎯 File analysis is now available with:', {
        codeSmells: fileAnalysis.codeSmells?.length || 0,
        metrics: fileAnalysis.metrics ? Object.keys(fileAnalysis.metrics).length : 0,
        qualityInsights: (fileAnalysis as any).qualityInsights ? 'Yes' : 'No'
      });
    }
  }, [fileAnalysis]);

  // Load dependency graph when dependencies view is selected
  useEffect(() => {
    if (activeView === 'dependencies' && !dependencyGraph) {
      loadDependencyGraph();
    }
  }, [activeView, dependencyGraph]);

  // Keyboard shortcut to close analysis (Escape key)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedFile) {
        setSelectedFile(null);
        setFileAnalysis(null);
        setActiveView('overview');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedFile]);

  // Load per-file activity from backend (survives refresh)
  useEffect(() => {
    void reloadFileProgress();
  }, [reloadFileProgress]);

  // File type statistics
  const fileStats = useMemo(() => {
    const javaFiles = files.filter(f => f.name.endsWith('.java'));
    const resourceFiles = files.filter(f => f.relativePath.includes('/resources/'));
    const testFiles = files.filter(f => f.relativePath.includes('/test/'));
    const configFiles = files.filter(f => f.name.match(/\.(xml|yml|yaml|properties|json)$/));
    
    return {
      total: files.length,
      java: javaFiles.length,
      resources: resourceFiles.length,
      tests: testFiles.length,
      config: configFiles.length
    };
  }, [files]);

  // Filtered and sorted files
  const filteredFiles = useMemo(() => {
    
    const filtered = files.filter(file => {
      // Advanced search filter
      const matchesAdvancedSearch = !activeFilters.searchTerm || 
        file.name.toLowerCase().includes(activeFilters.searchTerm.toLowerCase()) ||
        file.relativePath.toLowerCase().includes(activeFilters.searchTerm.toLowerCase());
      
      // Legacy search filter (for backward compatibility)
      const matchesSearch = file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           file.relativePath.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Advanced file type filter
      const matchesAdvancedFileType = activeFilters.fileTypes.length === 0 || 
        activeFilters.fileTypes.some(type => file.name.endsWith(type));
      
      // Legacy file type filter
      const matchesType = !fileTypeFilter || 
        (fileTypeFilter === 'java' && file.name.endsWith('.java')) ||
        (fileTypeFilter === 'resources' && file.relativePath.includes('/resources/')) ||
        (fileTypeFilter === 'tests' && file.relativePath.includes('/test/')) ||
        (fileTypeFilter === 'config' && file.name.match(/\.(xml|yml|yaml|properties|json)$/));
      
      // PMD smell filter (file list + file-status after Run Analysis)
      const pmdCount = effectivePmdCount(file, fileProgress);
      const matchesCodeSmells =
        !showOnlyCodeSmellsFiles ||
        (file.name.endsWith('.java') && pmdCount !== null && pmdCount > 0);

      // Sidebar smell-type filters target legacy assessment IDs; for the file list, any PMD hit qualifies
      const matchesAdvancedCodeSmells = (() => {
        if (activeFilters.smellTypes.length === 0 && activeFilters.severities.length === 0) {
          return true;
        }
        return pmdCount !== null && pmdCount > 0;
      })();
      
      // Status filter (pending / refactored / rejected / error)
      const matchesStatus = (() => {
        if (!fileStatusFilter) return true;
        const fp = fileProgress[file.relativePath];
        if (fileStatusFilter === 'pending') {
          return !fp || (fp.status === 'pending' && !isFileAnalyzed(fp));
        }
        if (fileStatusFilter === 'analyzed') {
          return isFileAnalyzed(fp) && fp?.status !== 'refactored' && fp?.status !== 'rejected';
        }
        return fp?.status === fileStatusFilter;
      })();

      return matchesSearch && matchesType && matchesCodeSmells && 
             matchesAdvancedSearch && matchesAdvancedFileType && matchesAdvancedCodeSmells && matchesStatus;
    });


    return sortFileInfos(filtered, sortBy, fileProgress);
  }, [files, searchTerm, fileTypeFilter, fileStatusFilter, showOnlyCodeSmellsFiles, sortBy, assessment, activeFilters, fileProgress]);

  // Paginated files
  const paginatedFiles = useMemo(() => {
    const start = currentPage * pageSize;
    return filteredFiles.slice(start, start + pageSize);
  }, [filteredFiles, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredFiles.length / pageSize);

  const toggleFileExpansion = (filePath: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(filePath)) {
      newExpanded.delete(filePath);
    } else {
      newExpanded.add(filePath);
    }
    setExpandedFiles(newExpanded);
  };

  // CSV Export Functions
  const generateCSVContent = () => {
    const headers = [
      'File Path',
      'File Name', 
      'File Type',
      'Lines of Code',
      'Classes',
      'Methods',
      'Complexity',
      'Code Smells Count',
      'Code Smell Types',
      'Long Method Count',
      'God Class Count',
      'Duplicate Code Count',
      'Complex Method Count',
      'Long Parameter List Count',
      'Feature Envy Count',
      'Data Clumps Count',
      'Primitive Obsession Count',
      'Switch Statements Count',
      'Temporary Field Count',
      'Lazy Class Count',
      'Middle Man Count',
      'Speculative Generality Count',
      'Message Chains Count',
      'Inappropriate Intimacy Count',
      'Shotgun Surgery Count',
      'Divergent Change Count',
      'Parallel Inheritance Count',
      'Excessive Comments Count',
      'Dead Code Count',
      'Large Class Count',
      'Data Class Count',
      'Magic Numbers Count',
      'String Constants Count',
      'Inconsistent Naming Count',
      'Nested Conditionals Count',
      'Flag Arguments Count',
      'Try-Catch Hell Count',
      'Null Abuse Count',
      'Type Embedded Name Count',
      'Refused Bequest Count',
      'Empty Catch Block Count',
      'Resource Leak Count',
      'Raw Types Count',
      'Circular Dependencies Count',
      'Long Line Count',
      'String Concatenation Count',
      'Generic Exception Count',
      'Single Letter Vars Count',
      'Hardcoded Credentials Count',
      'Critical Issues',
      'Major Issues',
      'Minor Issues'
    ];

    const rows = filteredFiles.map(file => {
      // Get code smells for this file
      const evidencesForFile = (assessment?.evidences || []).filter((e: any) => {
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

      // Count smells by type
      const smellTypeCounts = evidencesForFile.reduce((acc: any, e: any) => {
        const type = e.detectorId || e.summary || 'Unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});

      // Count by severity
      const severityCounts = evidencesForFile.reduce((acc: any, e: any) => {
        const severity = e.severity || 'UNKNOWN';
        acc[severity] = (acc[severity] || 0) + 1;
        return acc;
      }, {});

      const fileType = file.name.split('.').pop() || 'unknown';
      const smellTypes = Object.keys(smellTypeCounts).join('; ');
      
      return [
        file.relativePath,
        file.name,
        fileType,
        file.metrics?.linesOfCode || 0,
        file.metrics?.classCount || 0,
        file.metrics?.methodCount || 0,
        file.metrics?.cyclomaticComplexity || 0,
        evidencesForFile.length,
        smellTypes,
        smellTypeCounts['design.long-method'] || 0,
        smellTypeCounts['design.god-class'] || 0,
        smellTypeCounts['design.duplicate-code'] || 0,
        smellTypeCounts['design.complex-method'] || 0,
        smellTypeCounts['design.long-parameter-list'] || 0,
        smellTypeCounts['design.feature-envy'] || 0,
        smellTypeCounts['design.data-clumps'] || 0,
        smellTypeCounts['design.primitive-obsession'] || 0,
        smellTypeCounts['design.switch-statements'] || 0,
        smellTypeCounts['design.temporary-field'] || 0,
        smellTypeCounts['design.lazy-class'] || 0,
        smellTypeCounts['design.middle-man'] || 0,
        smellTypeCounts['design.speculative-generality'] || 0,
        smellTypeCounts['design.message-chains'] || 0,
        smellTypeCounts['design.inappropriate-intimacy'] || 0,
        smellTypeCounts['design.shotgun-surgery'] || 0,
        smellTypeCounts['design.divergent-change'] || 0,
        smellTypeCounts['design.parallel-inheritance'] || 0,
        smellTypeCounts['design.excessive-comments'] || 0,
        smellTypeCounts['design.dead-code'] || 0,
        smellTypeCounts['design.large-class'] || 0,
        smellTypeCounts['design.data-class'] || 0,
        smellTypeCounts['design.magic-numbers'] || 0,
        smellTypeCounts['design.string-constants'] || 0,
        smellTypeCounts['design.inconsistent-naming'] || 0,
        smellTypeCounts['design.nested-conditionals'] || 0,
        smellTypeCounts['design.flag-arguments'] || 0,
        smellTypeCounts['design.try-catch-hell'] || 0,
        smellTypeCounts['design.null-abuse'] || 0,
        smellTypeCounts['design.type-embedded-name'] || 0,
        smellTypeCounts['design.refused-bequest'] || 0,
        smellTypeCounts['design.empty-catch-block'] || 0,
        smellTypeCounts['design.resource-leak'] || 0,
        smellTypeCounts['design.raw-types'] || 0,
        smellTypeCounts['design.circular-dependencies'] || 0,
        smellTypeCounts['design.long-line'] || 0,
        smellTypeCounts['design.string-concatenation'] || 0,
        smellTypeCounts['design.generic-exception'] || 0,
        smellTypeCounts['design.single-letter-vars'] || 0,
        smellTypeCounts['design.hardcoded-credentials'] || 0,
        severityCounts['CRITICAL'] || 0,
        severityCounts['MAJOR'] || 0,
        severityCounts['MINOR'] || 0
      ];
    });

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

    return csvContent;
  };

  const exportToCSV = async () => {
    setIsExporting(true);
    try {
      const csvContent = generateCSVContent();
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `refactai-${workspaceId}-${timestamp}-analysis-report.csv`;
      link.setAttribute('download', filename);
      
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log('CSV export completed:', filename);
    } catch (error) {
      console.error('CSV export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const toggleCategoryExpansion = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  // Filter code smells based on search and filter criteria
  const filterCodeSmells = (smells: any[]) => {
    return smells.filter(smell => {
      const ruleName = smellRuleName(smell);
      const suggestion = smell.recommendation || smell.suggestion || '';
      const matchesSearch = !smellSearchTerm ||
        ruleName.toLowerCase().includes(smellSearchTerm.toLowerCase()) ||
        (smell.description || '').toLowerCase().includes(smellSearchTerm.toLowerCase()) ||
        suggestion.toLowerCase().includes(smellSearchTerm.toLowerCase()) ||
        smellPmdCategory(smell).toLowerCase().includes(smellSearchTerm.toLowerCase());

      const matchesSeverity = !smellSeverityFilter || smell.severity === smellSeverityFilter;
      const matchesCategory = !smellCategoryFilter || smellPmdCategory(smell) === smellCategoryFilter;

      return matchesSearch && matchesSeverity && matchesCategory;
    });
  };

  const filterCategories = (categories: Record<string, any[]>) => {
    if (!smellCategoryFilter) {
      const out: Record<string, any[]> = {};
      for (const [category, smells] of Object.entries(categories)) {
        const filtered = filterCodeSmells(smells);
        if (filtered.length > 0) out[category] = filtered;
      }
      return out;
    }
    const filtered: Record<string, any[]> = {};
    for (const [category, smells] of Object.entries(categories)) {
      if (category === smellCategoryFilter) {
        const list = filterCodeSmells(smells);
        if (list.length > 0) filtered[category] = list;
      }
    }
    return filtered;
  };

  const getFileTypeIcon = (file: FileInfo) => {
    if (file.name.endsWith('.java')) return <FileCode className="w-4 h-4 text-blue-400" />;
    if (file.relativePath.includes('/resources/')) return <Database className="w-4 h-4 text-yellow-400" />;
    if (file.relativePath.includes('/test/')) return <TestTube className="w-4 h-4 text-green-400" />;
    if (file.name.match(/\.(xml|yml|yaml|properties|json)$/)) return <Settings className="w-4 h-4 text-purple-400" />;
    return <FileText className="w-4 h-4 text-gray-400" />;
  };

  const getFileTypeBadge = (file: FileInfo) => {
    if (file.name.endsWith('.java')) return { text: 'JAVA', color: 'bg-blue-100 text-blue-800' };
    if (file.relativePath.includes('/resources/')) return { text: 'RESOURCE', color: 'bg-yellow-100 text-yellow-800' };
    if (file.relativePath.includes('/test/')) return { text: 'TEST', color: 'bg-green-100 text-green-800' };
    if (file.name.match(/\.(xml|yml|yaml|properties|json)$/)) return { text: 'CONFIG', color: 'bg-purple-100 text-purple-800' };
    return { text: 'OTHER', color: 'bg-gray-100 text-gray-800' };
  };

  // File Analysis View Component
  const FileAnalysisView = ({ file }: { file: FileInfo }) => {
    // Check if file is suitable for Java code analysis
    const isJavaFile = file.name.endsWith('.java') || file.relativePath.includes('/java/');
    
    if (!isJavaFile) {
      return (
        <div className="h-full overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center">
              <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-yellow-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">File Type Not Supported</h3>
              <p className="text-slate-300 mb-4">
                Code smell analysis is only available for Java files (.java). 
                This file ({file.name}) cannot be analyzed for Java-specific code smells.
              </p>
              <div className="bg-slate-700/50 rounded-lg p-4 text-left">
                <h4 className="text-white font-medium mb-2">Supported File Types:</h4>
                <ul className="text-slate-300 text-sm space-y-1">
                  <li>• Java source files (.java)</li>
                  <li>• Files in Java source directories</li>
                </ul>
              </div>
              <div className="mt-6">
                <button
                  onClick={() => setActiveView('files')}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  Browse Java Files
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    // Category name mapping for user-friendly display
    const getCategoryDisplayName = (category: string) => {
      const categoryMap: { [key: string]: { display: string; technical: string; description: string } } = {
        'BLOATER': {
          display: 'Large Code Blocks',
          technical: 'Bloater',
          description: 'Methods, classes, or parameters that have grown too large'
        },
        'DISPENSABLE': {
          display: 'Unused Code',
          technical: 'Dispensable',
          description: 'Dead code, unused variables, or redundant functionality'
        },
        'CHANGE_PREVENTER': {
          display: 'Hard to Modify',
          technical: 'Change Preventer',
          description: 'Code that is difficult to change without affecting other parts'
        },
        'HIERARCHY_ISSUE': {
          display: 'Inheritance Problems',
          technical: 'Hierarchy Issue',
          description: 'Issues with class inheritance and object-oriented design'
        },
        'ENCAPSULATION_ISSUE': {
          display: 'Data Exposure',
          technical: 'Encapsulation Issue',
          description: 'Improper data hiding and encapsulation violations'
        },
        'TESTING_ISSUE': {
          display: 'Test Problems',
          technical: 'Testing Issue',
          description: 'Issues with testability and test coverage'
        },
        'COUPLING_ISSUE': {
          display: 'Tight Coupling',
          technical: 'Coupling Issue',
          description: 'Classes that are too dependent on each other'
        },
        'COHESION_ISSUE': {
          display: 'Low Cohesion',
          technical: 'Cohesion Issue',
          description: 'Classes or methods that do too many different things'
        },
        'COUPLER': {
          display: 'Tight Coupling',
          technical: 'Coupler',
          description: 'Classes that are too dependent on each other'
        }
      };
      
      const pmdDescriptions: Record<string, string> = {
        'Best Practices': 'Unused code, unnecessary constructs, and recommended Java habits',
        'Code Style': 'Naming, formatting, and stylistic consistency',
        Documentation: 'Comments, Javadoc, and documented empty constructs',
        Design: 'Object-oriented design and API shape',
        'Error Prone': 'Constructs that are easy to misuse or bug-prone',
        Multithreading: 'Concurrency and thread-safety rules',
        Performance: 'Performance-related anti-patterns',
        Security: 'Security-sensitive patterns',
        Testing: 'JUnit and test-quality rules',
        Other: 'Rules outside a known PMD bucket',
      };

      return categoryMap[category] || {
        display: category,
        technical: pmdDescriptions[category] ? 'PMD ruleset' : category,
        description: pmdDescriptions[category] || 'Code quality issue',
      };
    };

    const organizeCodeSmellsByCategory = (codeSmells: any[]) => {
      const categories: Record<string, any[]> = {};
      for (const smell of codeSmells) {
        const category = smellPmdCategory(smell);
        if (!categories[category]) categories[category] = [];
        categories[category].push(smell);
      }
      return categories;
    };


    const getSeverityColor = (severity: string) => {
      switch (severity) {
        case 'CRITICAL': return 'text-red-100 bg-red-500/20 border-red-500/50 shadow-red-500/20';
        case 'MAJOR': return 'text-orange-100 bg-orange-500/20 border-orange-500/50 shadow-orange-500/20';
        case 'MINOR': return 'text-yellow-100 bg-yellow-500/20 border-yellow-500/50 shadow-yellow-500/20';
        default: return 'text-gray-100 bg-gray-500/20 border-gray-500/50 shadow-gray-500/20';
      }
    };

    const getSeverityIcon = (severity: string) => {
      switch (severity) {
        case 'CRITICAL': return <AlertTriangle className="w-3 h-3" />;
        case 'MAJOR': return <AlertCircle className="w-3 h-3" />;
        case 'MINOR': return <Info className="w-3 h-3" />;
        default: return <Info className="w-3 h-3" />;
      }
    };

    return (
      <div className="space-y-6">
        {/* File Header */}
        <div className="bg-slate-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <h2 className="text-xl font-semibold text-white">File Analysis</h2>
              <span className={`px-2 py-1 rounded text-xs font-medium ${getFileTypeBadge(file).color}`}>
                {getFileTypeBadge(file).text}
              </span>
            </div>
            <button
              onClick={() => setSelectedFile(null)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="mb-4">
            <h3 className="text-lg font-medium text-white">{file.name}</h3>
            <p className="text-sm text-slate-400">{file.relativePath}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-700 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-blue-400">{file.metrics.linesOfCode}</div>
              <div className="text-xs text-slate-300">Lines of Code</div>
            </div>
            <div className="bg-slate-700 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-green-400">{file.metrics.classCount}</div>
              <div className="text-xs text-slate-300">Classes</div>
            </div>
            <div className="bg-slate-700 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-yellow-400">{file.metrics.methodCount}</div>
              <div className="text-xs text-slate-300">Methods</div>
            </div>
            <div className="bg-slate-700 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-purple-400">{file.metrics.cyclomaticComplexity}</div>
              <div className="text-xs text-slate-300">Complexity</div>
            </div>
          </div>

          {/* File-Specific Charts Section */}
          {fileAnalysis && (
            <div className="space-y-6 mb-6">
              {/* Row 1: File Code Smells Analysis */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                  <div className="flex items-center mb-4">
                    <AlertTriangle className="w-5 h-5 text-red-400 mr-2" />
                    <h3 className="text-lg font-semibold text-white">File Code Smells by Severity</h3>
                  </div>
                  <div className="h-64 relative">
                    <CodeSmellsPieChart 
                      critical={fileAnalysis.codeSmells?.filter((s: any) => s.severity === 'CRITICAL').length || 0}
                      major={fileAnalysis.codeSmells?.filter((s: any) => s.severity === 'MAJOR').length || 0}
                      minor={fileAnalysis.codeSmells?.filter((s: any) => s.severity === 'MINOR').length || 0}
                    />
                  </div>
                </div>
                
                <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                  <div className="flex items-center mb-4">
                    <Bug className="w-5 h-5 text-orange-400 mr-2" />
                    <h3 className="text-lg font-semibold text-white">File Code Smells by Category</h3>
                  </div>
                  <div className="h-64 relative">
                    {fileAnalysis.codeSmells && fileAnalysis.codeSmells.length > 0 ? (
                      <div className="space-y-3">
                        {Object.entries(organizeCodeSmellsByCategory(fileAnalysis.codeSmells)).map(([category, smells]: [string, any[]]) => {
                          const categoryInfo = getCategoryDisplayName(category);
                          return (
                            <div key={category} className="flex items-center justify-between">
                              <div className="flex flex-col">
                                <span className="text-slate-300 text-sm font-medium">{categoryInfo.display}</span>
                                <span className="text-slate-500 text-xs">a.k.a {categoryInfo.technical}</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="w-20 bg-slate-700 rounded-full h-2">
                                  <div 
                                    className="bg-gradient-to-r from-orange-400 to-red-500 h-2 rounded-full"
                                    style={{ width: `${Math.min(100, (smells.length / Math.max(...Object.values(organizeCodeSmellsByCategory(fileAnalysis.codeSmells)).map((s: any[]) => s.length))) * 100)}%` }}
                                  />
                                </div>
                                <span className="text-white font-semibold text-sm w-8 text-right">{smells.length}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-400">
                        <div className="text-center">
                          <Bug className="w-12 h-12 mx-auto mb-2 opacity-50" />
                          <p>No code smells found in this file</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 2: File Metrics and Quality */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                  <div className="flex items-center mb-4">
                    <BarChart3 className="w-5 h-5 text-green-400 mr-2" />
                    <h3 className="text-lg font-semibold text-white">File Metrics</h3>
                  </div>
                  <div className="h-64 relative">
                    <MetricsBarChart 
                      classes={file.metrics.classCount}
                      methods={file.metrics.methodCount}
                       comments={file.metrics.commentLines || 0}
                      lines={file.metrics.linesOfCode}
                    />
                  </div>
                </div>
                
                <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                  <div className="flex items-center mb-4">
                    <Target className="w-5 h-5 text-purple-400 mr-2" />
                    <h3 className="text-lg font-semibold text-white">File Quality Score</h3>
                  </div>
                  <div className="h-64 flex items-center justify-center">
                    <div className="w-32 h-32">
                       <QualityGauge 
                         score={fileAnalysis.metrics?.overallScore || Math.max(0, 100 - (fileAnalysis.codeSmells?.length || 0) * 10)}
                         maxScore={100}
                         label="Quality Score"
                       />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quality Gauge */}
          {fileAnalysis && (
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <Target className="w-5 h-5 mr-2 text-purple-400" />
                Code Quality Score
              </h3>
              <div className="flex justify-center">
                <div className="w-48 h-48">
                  <QualityGauge 
                    score={Math.max(0, 100 - (fileAnalysis.codeSmells?.length || 0) * 10)}
                    maxScore={100}
                    label="Quality Score"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex space-x-3">
            <button
              onClick={analyzeFile}
              disabled={isAnalyzing}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 inline animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Code className="w-4 h-4 mr-2 inline" />
                  Analyze File
                </>
              )}
            </button>
            
            <button
              onClick={() => loadFileContent(file)}
              disabled={loadingFileContent}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center"
            >
              {loadingFileContent ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-2" />
                  View Code
                </>
              )}
            </button>
            
            {fileAnalysis && (
              <button
                onClick={() => {
                  const exportData = {
                    file: file.name,
                    path: file.relativePath,
                    metrics: file.metrics,
                    codeSmells: fileAnalysis.codeSmells || [],
                    categories: fileAnalysis.categories,
                    timestamp: new Date().toISOString()
                  };
                  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${file.name.replace(/\.[^/.]+$/, '')}_analysis.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </button>
            )}
          </div>
        </div>

        {/* Analysis Results */}
        {isAnalyzing ? (
          <div className="space-y-6">
            <FileAnalysisSkeleton />
            <CodeSmellListSkeleton />
          </div>
        ) : fileAnalysis && (
          <div className="space-y-6">
            {/* Code Smell Filters */}
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div className="flex items-center space-x-4">
                <div className="flex-1 relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search code smells..."
                    value={smellSearchTerm}
                    onChange={(e) => setSmellSearchTerm(e.target.value)}
                    className="w-full bg-slate-700 text-white pl-10 pr-4 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <select 
                  value={smellSeverityFilter}
                  onChange={(e) => setSmellSeverityFilter(e.target.value)}
                  className="bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">All Severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="MAJOR">Major</option>
                  <option value="MINOR">Minor</option>
                </select>
                <select
                  value={smellCategoryFilter}
                  onChange={(e) => setSmellCategoryFilter(e.target.value)}
                  className="bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none min-w-[11rem]"
                >
                  <option value="">All PMD categories</option>
                  {collectPmdCategories(fileAnalysis?.codeSmells || []).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <button 
                  onClick={() => {
                    setSmellSearchTerm('');
                    setSmellSeverityFilter('');
                    setSmellCategoryFilter('');
                  }}
                  className="bg-slate-600 hover:bg-slate-500 text-white px-3 py-2 rounded-lg transition-colors"
                  title="Clear all filters"
                >
                  <Filter className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* PMD category summary */}
            {fileAnalysis?.codeSmells?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(organizeCodeSmellsByCategory(fileAnalysis.codeSmells))
                  .sort((a, b) => b[1].length - a[1].length)
                  .map(([cat, smells]) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSmellCategoryFilter(smellCategoryFilter === cat ? '' : cat)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${pmdCategoryBadgeClass(cat)} ${
                        smellCategoryFilter === cat ? 'ring-2 ring-white/30' : 'opacity-90 hover:opacity-100'
                      }`}
                    >
                      {cat} · {smells.length}
                    </button>
                  ))}
              </div>
            )}

            {/* Code Smells by Category */}
            {(() => {
              const fileCodeSmells = fileAnalysis?.codeSmells || [];
              const categories = organizeCodeSmellsByCategory(fileCodeSmells);
              const filteredCategories = filterCategories(categories);
              const hasResults = Object.values(filteredCategories).some((smells) => filterCodeSmells(smells as any[]).length > 0);
              
              if (!hasResults && (smellSearchTerm || smellSeverityFilter || smellCategoryFilter)) {
                return (
                  <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 text-center">
                    <Search className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-white mb-2">No code smells found</h3>
                    <p className="text-slate-400 mb-4">Try adjusting your search criteria or filters</p>
                    <button
                      onClick={() => {
                        setSmellSearchTerm('');
                        setSmellSeverityFilter('');
                        setSmellCategoryFilter('');
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                    >
                      Clear Filters
                    </button>
                  </div>
                );
              }
              
              return Object.entries(filteredCategories).map(([category, smells]) => {
                const filteredSmells = filterCodeSmells(smells as any[]);
                if (filteredSmells.length === 0) return null;
                const isExpanded = expandedCategories.has(category);
                const categoryInfo = getCategoryDisplayName(category);
              
              return (
                <div key={category} className="bg-slate-800 rounded-lg border border-slate-700">
                  <button
                    onClick={() => toggleCategoryExpansion(category)}
                    className="w-full p-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors rounded-t-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <Bug className="w-5 h-5 text-red-400" />
                      <div className="flex flex-col">
                        <h3 className="text-lg font-semibold text-white">{categoryInfo.display}</h3>
                        <span className="text-slate-400 text-sm">{categoryInfo.description}</span>
                      </div>
                      <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded text-xs font-medium">
                        {filteredSmells.length}
                      </span>
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                  </button>
                  
                  {isExpanded && (
                    <div className="p-6 pt-0 space-y-6">
                      {filteredSmells.map((smell: any) => (
                        <div key={smell.id} className="bg-gradient-to-r from-slate-700/60 to-slate-700/40 rounded-xl p-6 border border-slate-600/50 shadow-lg hover:shadow-xl transition-all duration-200 hover:border-slate-500/70">
                          {/* Header Section */}
                          <div className="flex items-start justify-between mb-4 gap-3">
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <span className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 flex items-center space-x-1.5 ${getSeverityColor(smell.severity)}`}>
                                {getSeverityIcon(smell.severity)}
                                <span>{smell.severity}</span>
                              </span>
                              <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${pmdCategoryBadgeClass(smellPmdCategory(smell))}`}>
                                {smellPmdCategory(smell)}
                              </span>
                              <h4 className="text-base font-bold text-white leading-tight">{smellRuleName(smell)}</h4>
                            </div>
                            <span className="text-xs font-medium text-slate-300 bg-slate-600/70 px-3 py-1.5 rounded-full border border-slate-500/50 shrink-0">
                              {smell.startLine ? `Line ${smell.startLine}` : smell.impact ? `Impact: ${smell.impact}` : 'PMD'}
                            </span>
                          </div>
                          
                          {/* Description Section */}
                          <div className="mb-5">
                            <p className="text-sm leading-relaxed text-slate-200 bg-slate-800/40 rounded-lg p-4 border-l-4 border-blue-500/50">
                              {smell.description}
                            </p>
                          </div>
                          
                          {/* Action Cards Section */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/5 rounded-xl p-4 border border-yellow-500/20 hover:border-yellow-500/40 transition-colors">
                              <div className="flex items-start space-x-3">
                                <div className="bg-yellow-500/20 p-2 rounded-lg">
                                  <Lightbulb className="w-5 h-5 text-yellow-400" />
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-semibold text-yellow-400 mb-2">💡 How to Fix</p>
                                  <p className="text-sm text-slate-200 leading-relaxed mb-3">{smell.recommendation}</p>
                                  {(smell.startLine && smell.endLine && smell.startLine > 0 && smell.endLine > 0) ? (
                                    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-600/50">
                                      <p className="text-xs text-slate-400 mb-2">📍 Location: Lines {smell.startLine}-{smell.endLine}</p>
                                      <button className="text-xs text-blue-400 hover:text-blue-300 underline">
                                        View Code →
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-600/50">
                                      <p className="text-xs text-slate-400 mb-2">📍 Location: Class-level issue</p>
                                      <button className="text-xs text-blue-400 hover:text-blue-300 underline">
                                        View Code →
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 rounded-xl p-4 border border-blue-500/20 hover:border-blue-500/40 transition-colors">
                              <div className="flex items-start space-x-3">
                                <div className="bg-blue-500/20 p-2 rounded-lg">
                                  <Info className="w-5 h-5 text-blue-400" />
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-semibold text-blue-400 mb-2">ℹ️ Impact & Priority</p>
                                  <p className="text-sm text-slate-200 leading-relaxed mb-3">
                                    {smell.impact || 'This issue affects code maintainability and readability.'}
                                  </p>
                                  <div className="flex items-center space-x-2">
                                    <span className="text-xs text-slate-400">Priority:</span>
                                    <span className={`text-xs px-2 py-1 rounded ${
                                      smell.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400' :
                                      smell.severity === 'MAJOR' ? 'bg-orange-500/20 text-orange-400' :
                                      'bg-yellow-500/20 text-yellow-400'
                                    }`}>
                                      {smell.severity}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Step-by-Step Guidance */}
                          {smell.refactoringSuggestions && smell.refactoringSuggestions.length > 0 && (
                            <div className="mt-4 bg-gradient-to-br from-green-500/10 to-emerald-500/5 rounded-xl p-4 border border-green-500/20">
                              <div className="flex items-start space-x-3">
                                <div className="bg-green-500/20 p-2 rounded-lg">
                                  <Target className="w-5 h-5 text-green-400" />
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-semibold text-green-400 mb-3">🎯 Step-by-Step Refactoring</p>
                                  <div className="space-y-2">
                                    {smell.refactoringSuggestions.map((step: string, index: number) => (
                                      <div key={index} className="flex items-start space-x-2">
                                        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full font-medium min-w-[20px] text-center">
                                          {index + 1}
                                        </span>
                                        <p className="text-sm text-slate-200 leading-relaxed">{step}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
              });
            })()}

            {/* No Code Smells */}
            {fileAnalysis && (!fileAnalysis.codeSmells || fileAnalysis.codeSmells.length === 0) && (
              <div className="bg-slate-800 rounded-lg p-6 text-center">
                <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">No Code Smells Detected!</h3>
                <p className="text-slate-400">This file follows good coding practices and design principles.</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Filter handler
  const handleFiltersChange = useCallback((filters: any) => {
    setActiveFilters(filters);
  }, []);

  // Calculate total issues for filter sidebar
  const totalIssues = assessment?.evidences?.length || 0;
  
  // Calculate filtered issues by applying the same filters to all evidences
  const filteredIssues = useMemo(() => {
    if (!assessment?.evidences) return 0;
    
    const filtered = assessment.evidences.filter((evidence: any) => {
      // Apply severity and smell type filters
      const matchesSmellType = activeFilters.smellTypes.length === 0 || 
        activeFilters.smellTypes.includes(evidence.detectorId);
      const matchesSeverity = activeFilters.severities.length === 0 || 
        activeFilters.severities.includes(evidence.severity);
      
      return matchesSmellType && matchesSeverity;
    });
    
    // Debug logging
    console.log('🔍 FILTER DEBUG:', {
      totalEvidences: assessment.evidences.length,
      activeFilters,
      filteredCount: filtered.length,
      sampleEvidences: assessment.evidences.slice(0, 3).map(e => ({
        detectorId: e.detectorId,
        severity: e.severity,
        file: e.pointer?.file
      }))
    });
    
    return filtered.length;
  }, [assessment?.evidences, activeFilters.smellTypes, activeFilters.severities]);

  // Create filtered assessment for charts
  const filteredAssessment = useMemo(() => {
    if (!assessment?.evidences) return assessment;
    
    const filteredEvidences = assessment.evidences.filter((evidence: any) => {
      // Apply severity and smell type filters
      const matchesSmellType = activeFilters.smellTypes.length === 0 || 
        activeFilters.smellTypes.includes(evidence.detectorId);
      const matchesSeverity = activeFilters.severities.length === 0 || 
        activeFilters.severities.includes(evidence.severity);
      
      return matchesSmellType && matchesSeverity;
    });
    
    return {
      ...assessment,
      evidences: filteredEvidences
    };
  }, [assessment, activeFilters.smellTypes, activeFilters.severities]);

  return (
    <div className="flex h-full bg-slate-900">
      {/* Left Sidebar - Compact */}
      <div className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col">
        {/* Logo & Navigation */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center space-x-2 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Code className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">{BrandName}</h1>
              <p className="text-xs text-slate-400">Code Analysis</p>
            </div>
          </div>
          
          <nav className="space-y-1">
            {[
              { id: 'overview', label: 'Overview', icon: BarChart3 },
              { id: 'files', label: 'Files', icon: Folder, count: fileStats.total },
              { id: 'analysis', label: 'Analysis', icon: Code },
              { id: 'dependencies', label: 'Dependencies', icon: Network },
              { id: 'refactoring', label: 'AI Refactoring', icon: Brain },
              { id: 'batch', label: 'Batch Refactor', icon: Zap },
              ...(ENABLE_BASELINE_NAV
                ? [{ id: 'baseline' as const, label: 'Baseline Comparison', icon: GitCompare }]
                : []),
              ...(ENABLE_RIPPLE_REF_NAV
                ? [
                    { id: 'ripple-ref' as const, label: 'RIPPLE-REF Study', icon: GitBranch },
                    { id: 'ma-ref' as const, label: 'Multi-Agent Study', icon: Sparkles },
                  ]
                : []),
              { id: 'monitor', label: 'Monitor', icon: Activity },
              { id: 'projects', label: 'Project Hub', icon: Database }
            ].map(({ id, label, icon: Icon, count }) => {
              const isRippleNav = id === 'ripple-ref';
              const isMaNav = id === 'ma-ref';
              const isStudyNav = isRippleNav || isMaNav;
              const isActive = isRippleNav
                ? rippleRefFocus && activeView === 'projects'
                : isMaNav
                  ? maRefFocus && activeView === 'projects'
                  : activeView === id;
              return (
              <button
                key={id}
                onClick={() => {
                  if (isRippleNav) {
                    openRippleRefStudy();
                    return;
                  }
                  if (isMaNav) {
                    openMaRefStudy();
                    return;
                  }
                  setRippleRefFocus(false);
                  setMaRefFocus(false);
                  setActiveView(id as typeof activeView);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
                  isActive
                    ? isStudyNav
                      ? isMaNav
                        ? 'bg-fuchsia-600 text-white'
                        : 'bg-violet-600 text-white'
                      : 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Icon className="w-4 h-4" />
                  <span className="text-sm">{label}</span>
                </div>
                {count !== undefined && (
                  <span className="text-xs bg-slate-600 text-slate-200 px-2 py-0.5 rounded-full">
                    {count}
                  </span>
                )}
              </button>
            );
            })}
          </nav>
        </div>

        {/* Quick Stats */}
        <div className="p-4 border-b border-slate-700">
          <div className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl p-4 border border-slate-600">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center">
              <BarChart3 className="w-4 h-4 mr-2 text-blue-400" />
              Project Overview
            </h3>
            
            {/* File Type Distribution — removed empty pie chart */}
            
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-600/50 rounded-lg p-2">
                <div className="text-slate-300">Total Files</div>
                <div className="text-white font-bold text-lg">{fileStats.total}</div>
              </div>
              <div className="bg-slate-600/50 rounded-lg p-2">
                <div className="text-slate-300">Java Files</div>
                <div className="text-blue-400 font-bold text-lg">{fileStats.java}</div>
              </div>
              <div className="bg-slate-600/50 rounded-lg p-2">
                <div className="text-slate-300">Resources</div>
                <div className="text-yellow-400 font-bold text-lg">{fileStats.resources}</div>
              </div>
              <div className="bg-slate-600/50 rounded-lg p-2">
                <div className="text-slate-300">Tests</div>
                <div className="text-green-400 font-bold text-lg">{fileStats.tests}</div>
              </div>
            </div>
            
            {/* Quality Score */}
            {assessment && (
              <div className="mt-3 pt-3 border-t border-slate-600">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 text-xs">Quality Score</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-16 h-2 bg-slate-600 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-red-500 to-green-500 transition-all duration-300"
                        style={{ width: `${assessment.summary.maintainabilityIndex}%` }}
                      />
                    </div>
                    <span className="text-green-400 font-bold text-sm">
                      {assessment.summary.maintainabilityIndex}/100
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Analysis Summary */}
        {assessment && (
          <div className="p-4 flex-1 overflow-y-auto">
            <div className="bg-slate-700 rounded-lg p-3">
              <h3 className="text-sm font-semibold text-white mb-2">Issues Found</h3>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-300">Critical:</span>
                  <span className="text-red-400 font-semibold">
                    {assessment.summary.criticalFindings || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">Major:</span>
                  <span className="text-orange-400 font-semibold">
                    {assessment.summary.majorFindings || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">Minor:</span>
                  <span className="text-yellow-400 font-semibold">
                    {assessment.summary.minorFindings || 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0">
        {/* Filter Sidebar */}
        {showFilterSidebar && (
          <FilterSidebar
            onFiltersChange={handleFiltersChange}
            totalIssues={totalIssues}
            filteredIssues={filteredIssues}
          />
        )}
        
        {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* File-Level Analysis Section - fills the full area when a file is selected (but NOT during refactoring view) */}
        {selectedFile && activeView !== 'refactoring' && (
          <div className="flex-1 bg-slate-800 border-b border-slate-700 p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white flex items-center">
                <FileText className="w-5 h-5 mr-2" />
                File-Level Analysis: {selectedFile.name}
              </h2>
              <div className="flex space-x-2">
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setFileAnalysis(null);
                    setActiveView('overview');
                  }}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </button>
                <button
                  onClick={() => analyzeFile()}
                  disabled={isAnalyzing}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors flex items-center"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isAnalyzing ? 'animate-spin' : ''}`} />
                  Re-analyze
                </button>
                <button
                  onClick={() => setActiveView('refactoring')}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center"
                >
                  <Brain className="w-4 h-4 mr-2" />
                  AI Refactor
                </button>
                <button
                  onClick={() => {
                    console.log('🔍 Debug file analysis state:', {
                      fileAnalysis,
                      fileAnalysisRef: fileAnalysisRef.current,
                      currentAnalysis: fileAnalysis || fileAnalysisRef.current,
                      selectedFile,
                      isAnalyzing,
                      fileCodeSmells: (fileAnalysis || fileAnalysisRef.current)?.codeSmells || [],
                      fileMetrics: (fileAnalysis || fileAnalysisRef.current)?.metrics || {}
                    });
                  }}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                >
                  Debug
                </button>
              </div>
            </div>

            {/* File Analysis Content */}
            <div className="bg-slate-700 rounded-lg p-6">
              {(() => {
                // Always show file analysis results
                const currentAnalysis = fileAnalysis || fileAnalysisRef.current;
                console.log('🔍 Rendering file analysis section:', {
                  fileAnalysis,
                  fileAnalysisRef: fileAnalysisRef.current,
                  currentAnalysis,
                  selectedFile: selectedFile?.relativePath,
                  isAnalyzing,
                  hasFileAnalysis: !!currentAnalysis,
                  analysisKeys: currentAnalysis ? Object.keys(currentAnalysis) : []
                });
                
                // Show loading state
                if (isAnalyzing) {
                  return (
                    <div className="text-center py-8">
                      <RefreshCw className="w-12 h-12 text-blue-400 mx-auto mb-4 animate-spin" />
                      <h4 className="text-lg font-semibold text-white mb-2">Analyzing File...</h4>
                      <p className="text-slate-400">Please wait while we analyze this file.</p>
                    </div>
                  );
                }
                
                // Show prompt to analyze if no analysis yet
                if (!currentAnalysis) {
                  return (
                    <div className="text-center py-8">
                      <RefreshCw className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <h4 className="text-lg font-semibold text-white mb-2">Click Analyze to Start</h4>
                      <p className="text-slate-400">Click the "Analyze" button to analyze this file.</p>
                    </div>
                  );
                }
                
                // Show analysis results
                const fileMetrics = currentAnalysis?.metrics || {};
                const computedSmells = (() => {
                  // Use enhanced analysis only so counts match workspace file badges
                  // (same ComprehensiveCodeSmellDetector path as /workspace-enhanced-analysis/analyze-file).
                  return currentAnalysis?.codeSmells || [];
                })();
                
                // Debug logging
                console.log('🔍 File analysis display debug:', {
                  currentAnalysis: currentAnalysis,
                  fileCodeSmells: computedSmells.length,
                  fileMetrics: fileMetrics,
                  selectedFile: selectedFile?.relativePath,
                  codeSmellsArray: currentAnalysis?.codeSmells,
                  codeSmellsLength: currentAnalysis?.codeSmells?.length,
                  hasCodeSmells: currentAnalysis?.codeSmells ? 'YES' : 'NO',
                  codeSmellsType: typeof currentAnalysis?.codeSmells,
                  currentAnalysisKeys: currentAnalysis ? Object.keys(currentAnalysis) : 'NO_ANALYSIS'
                });
                
                // Show analysis results - always display something
                const goToRefactoring = async () => {
                  setFileCodeSmells(computedSmells);
                  if (!fileContent && selectedFile) {
                    try {
                      const response = await apiClient.getFileContent(workspaceId, selectedFile.relativePath);
                      setFileContent(response.content);
                    } catch (err) {
                      console.error('Failed to load file content for refactoring:', err);
                    }
                  }
                  setActiveView('refactoring');
                };

                return (
                  <div className="space-y-4">
                    {/* Analysis Status */}
                    <div className="text-center py-4">
                      {computedSmells.length === 0 ? (
                        <>
                          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                          <h4 className="text-lg font-semibold text-white mb-2">File Analysis Complete</h4>
                          <p className="text-slate-400 mb-4">This file appears to be clean with no code quality issues detected.</p>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-12 h-12 text-orange-400 mx-auto mb-4" />
                          <h4 className="text-lg font-semibold text-white mb-2">File Analysis Complete</h4>
                          <p className="text-slate-400 mb-4">Found {computedSmells.length} code quality issues in this file.</p>
                        </>
                      )}
                    </div>

                    {/* Analysis Results */}
                    <div className="bg-slate-600 rounded-lg p-4">
                      <h5 className="text-white font-semibold mb-3">Analysis Results:</h5>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-slate-400">File:</span>
                          <p className="text-white font-mono text-xs">{selectedFile.relativePath}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Analysis Status:</span>
                          <p className="text-green-400">Completed</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Code Smells:</span>
                          <p className="text-white">{computedSmells.length}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Total Lines:</span>
                          <p className="text-white">{currentAnalysis?.linesOfCode || fileMetrics.totalLines || 0}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Complexity:</span>
                          <p className="text-white">{currentAnalysis?.complexity || fileMetrics.cyclomaticComplexity || 0}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Maintainability:</span>
                          <p className="text-white">{currentAnalysis?.maintainability || fileMetrics.maintainabilityIndex || 0}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Quality Grade:</span>
                          <p className="text-white">{fileMetrics.qualityGrade || 'N/A'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Quality Assessment */}
                    {(currentAnalysis as any)?.qualityInsights && (
                      <div className="bg-slate-600 rounded-lg p-4">
                        <h5 className="text-white font-semibold mb-3">Quality Assessment</h5>
                        <div className="text-sm text-slate-300 space-y-2">
                          <p><strong>Overall Quality:</strong> {(currentAnalysis as any).qualityInsights.qualityCategory}</p>
                          {(currentAnalysis as any).qualityInsights.specificInsights && (
                            <div className="space-y-1">
                              {Object.entries((currentAnalysis as any).qualityInsights.specificInsights).map(([key, value]: [string, any]) => (
                                <p key={key}><strong>{key.charAt(0).toUpperCase() + key.slice(1)}:</strong> {value}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                       {/* Dependency / Ripple Impact Graph */}
                       {selectedFile && workspaceId && (
                         <div className="mb-2">
                           <FileImpactDependencyGraph workspaceId={workspaceId} filePath={selectedFile.relativePath} />
                         </div>
                       )}

                      {/* Code Smells Details — full scrollable list with filters */}
                      {computedSmells.length > 0 && (() => {
                        const criticalCount = computedSmells.filter((s: any) => s.severity === 'CRITICAL').length;
                        const majorCount = computedSmells.filter((s: any) => s.severity === 'MAJOR').length;
                        const minorCount = computedSmells.filter((s: any) => s.severity === 'MINOR').length;
                        const filtered = !smellSeverityFilter ? computedSmells : computedSmells.filter((s: any) => s.severity === smellSeverityFilter);
                        return (
                        <div className="bg-slate-600 rounded-lg p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                            <h5 className="text-white font-semibold">Code Smells Found ({computedSmells.length})</h5>
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => setSmellSeverityFilter('')}
                                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${!smellSeverityFilter ? 'bg-slate-400 text-white' : 'bg-slate-700/60 text-slate-400 hover:bg-slate-500/60'}`}>
                                All ({computedSmells.length})
                              </button>
                              <button onClick={() => setSmellSeverityFilter(smellSeverityFilter === 'CRITICAL' ? '' : 'CRITICAL')}
                                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${smellSeverityFilter === 'CRITICAL' ? 'bg-red-500 text-white' : 'bg-red-500/15 text-red-400 hover:bg-red-500/30'}`}>
                                Critical ({criticalCount})
                              </button>
                              <button onClick={() => setSmellSeverityFilter(smellSeverityFilter === 'MAJOR' ? '' : 'MAJOR')}
                                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${smellSeverityFilter === 'MAJOR' ? 'bg-orange-500 text-white' : 'bg-orange-500/15 text-orange-400 hover:bg-orange-500/30'}`}>
                                Major ({majorCount})
                              </button>
                              <button onClick={() => setSmellSeverityFilter(smellSeverityFilter === 'MINOR' ? '' : 'MINOR')}
                                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${smellSeverityFilter === 'MINOR' ? 'bg-yellow-500 text-white' : 'bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/30'}`}>
                                Minor ({minorCount})
                              </button>
                            </div>
                          </div>
                          {smellSeverityFilter && (
                            <p className="text-xs text-slate-400 mb-2">Showing {filtered.length} of {computedSmells.length} — filtered by <span className={smellSeverityFilter === 'CRITICAL' ? 'text-red-400' : smellSeverityFilter === 'MAJOR' ? 'text-orange-400' : 'text-yellow-400'}>{smellSeverityFilter}</span></p>
                          )}
                          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                            {filtered.map((smell: any, index: number) => (
                               <div key={index} className="bg-slate-700 rounded p-3">
                                 <div className="flex items-center justify-between mb-1">
                                   <span className="font-medium text-white text-sm">{smell.type || smell.detectorId || 'Code Smell'}</span>
                                   <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                     smell.severity === 'CRITICAL' ? 'bg-red-500/80 text-white' :
                                     smell.severity === 'MAJOR' ? 'bg-orange-500/80 text-white' :
                                     smell.severity === 'MINOR' ? 'bg-yellow-500/80 text-white' :
                                     'bg-slate-500/80 text-white'
                                   }`}>
                                     {smell.severity || 'UNKNOWN'}
                                   </span>
                                 </div>
                                 <p className="text-slate-300 text-xs">{smell.description || smell.summary || 'No description available'}</p>
                                 {smell.startLine && (
                                   <p className="text-slate-500 text-xs mt-1">Line {smell.startLine}{smell.endLine && smell.endLine !== smell.startLine ? `-${smell.endLine}` : ''}</p>
                                 )}
                               </div>
                             ))}
                          </div>
                        </div>
                        );
                      })()}

                      {/* AI Refactoring Quick Actions */}
                       {computedSmells.length > 0 && (
                         <div className="bg-gradient-to-r from-green-600/20 to-blue-600/20 rounded-lg p-4 border border-green-500/30">
                           <h5 className="text-white font-semibold mb-3 flex items-center">
                             <Brain className="w-5 h-5 mr-2 text-green-400" />
                             AI-Powered Refactoring
                           </h5>
                           <p className="text-slate-300 text-sm mb-4">
                             Found {computedSmells.length} code smells. Let AI help you refactor this file automatically.
                           </p>
                           <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                             <button
                               onClick={goToRefactoring}
                               className="bg-green-600 hover:bg-green-700 text-white rounded-lg p-3 text-sm transition-colors flex items-center justify-center"
                             >
                               <Wand2 className="w-4 h-4 mr-2" />
                               Fix Code Smells
                             </button>
                             <button
                               onClick={goToRefactoring}
                               className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg p-3 text-sm transition-colors flex items-center justify-center"
                             >
                               <Code className="w-4 h-4 mr-2" />
                               Extract Methods
                             </button>
                             <button
                               onClick={goToRefactoring}
                               className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg p-3 text-sm transition-colors flex items-center justify-center"
                             >
                               <Zap className="w-4 h-4 mr-2" />
                               Optimize Performance
                             </button>
                             <button
                               onClick={goToRefactoring}
                               className="bg-orange-600 hover:bg-orange-700 text-white rounded-lg p-3 text-sm transition-colors flex items-center justify-center"
                             >
                               <Eye className="w-4 h-4 mr-2" />
                               Improve Readability
                             </button>
                           </div>
                         </div>
                       )}
                  </div>
                );
              })()}
            </div>
            
            {/* Close Analysis Button */}
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setFileAnalysis(null);
                  setActiveView('overview');
                }}
                className="px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center space-x-2"
              >
                <X className="w-4 h-4" />
                <span>Close Analysis</span>
              </button>
            </div>
          </div>
        )}

        {/* Top Header — hidden when file analysis is open (it has its own header), but visible during refactoring */}
        <div className={`bg-slate-800 border-b border-slate-700 p-4 ${selectedFile && activeView !== 'refactoring' ? 'hidden' : ''}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white capitalize">
                {activeView === 'projects' ? 'Project Hub' : `${activeView} Dashboard`}
              </h2>
              <p className="text-sm text-slate-400">
                {activeView === 'projects' ? (
                  <>
                    Manage workspaces
                    {!REFINE_DEMO && (
                      <>
                        {' · '}
                        <span className="text-emerald-400">Research Excel export</span> with 15 metric
                        sections
                      </>
                    )}
                    {REFINE_DEMO && (
                      <>
                        {' · '}
                        <span className="text-emerald-400">Excel export</span> for saved refactoring reports
                      </>
                    )}
                  </>
                ) : workspaceName ? (
                  <>
                    Project: <span className="text-white">{workspaceName}</span>
                    <span className="text-slate-500 font-mono text-xs ml-2">({workspaceId})</span>
                  </>
                ) : (
                  <>Workspace: {workspaceId}</>
                )}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              {activeView === 'projects' ? (
                <button
                  type="button"
                  onClick={() => setShowCrossProjectExcelModal(true)}
                  className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
                >
                  <FolderGit2 className="w-4 h-4" />
                  Export all projects
                </button>
              ) : (
                <>
              {/* Filter Toggle */}
              <button
                onClick={() => setShowFilterSidebar(!showFilterSidebar)}
                className={`px-3 py-2 rounded-lg text-sm transition-colors flex items-center space-x-2 ${
                  showFilterSidebar 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600'
                }`}
              >
                <FilterIcon className="w-4 h-4" />
                <span>Filters</span>
                {activeFilters.severities.length > 0 || activeFilters.smellTypes.length > 0 || 
                 activeFilters.fileTypes.length > 0 || activeFilters.searchTerm.length > 0 ? (
                  <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {(activeFilters.severities.length + activeFilters.smellTypes.length + 
                      activeFilters.fileTypes.length + (activeFilters.searchTerm ? 1 : 0))}
                  </span>
                ) : null}
              </button>
              
              {/* View Toggle */}
              <div className="flex bg-slate-700 rounded-lg p-1">
                <button
                  onClick={() => setCurrentView('files')}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    currentView === 'files' 
                      ? 'bg-blue-600 text-white' 
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <FileText className="w-4 h-4 mr-1 inline" />
                  Files
                </button>
                <button
                  onClick={() => setCurrentView('dashboard')}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    currentView === 'dashboard' 
                      ? 'bg-blue-600 text-white' 
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <BarChart3 className="w-4 h-4 mr-1 inline" />
                  Dashboard
                </button>
              </div>
              
              <button
                type="button"
                onClick={() => void runFullProjectAnalysis()}
                disabled={!workspaceId || isRunningFullAnalysis}
                title="Run PMD on all Java source files and refresh smell counts in the file list"
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-wait text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center"
              >
                {isRunningFullAnalysis ? (
                  <RefreshCw className="w-4 h-4 mr-2 inline animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2 inline" />
                )}
                {isRunningFullAnalysis ? 'Analyzing…' : 'Run Analysis'}
              </button>
              <button 
                onClick={exportToCSV}
                disabled={isExporting}
                className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center"
                title="Legacy smell summary CSV"
              >
                {isExporting ? (
                  <RefreshCw className="w-4 h-4 mr-2 inline animate-spin" />
                ) : (
                <Download className="w-4 h-4 mr-2 inline" />
                )}
                {isExporting ? 'Exporting...' : 'Export CSV'}
              </button>
              <button
                type="button"
                onClick={() => setShowExcelExportModal(true)}
                disabled={!workspaceId}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center"
                title={REFINE_DEMO ? 'Metrics workbook — per-file tabs and summary sheets' : 'Full research metrics workbook — 15 sections, per-file tabs, statistics'}
              >
                <FileSpreadsheet className="w-4 h-4 mr-2 inline" />
                Export Excel
              </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content Area — hidden when file analysis is open, but visible during refactoring */}
        <div className={`flex-1 overflow-y-auto ${selectedFile && activeView !== 'refactoring' ? 'hidden' : ''}`}>
          {currentView === 'dashboard' ? (
            <CodeSmellsDashboard 
              assessment={filteredAssessment}
              files={files}
              workspaceId={workspaceId}
            />
          ) : (
            <>
          {activeView === 'overview' && (
            <div className="h-full overflow-y-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Project Overview Card */}
                <div className="lg:col-span-2 bg-slate-800 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Project Overview</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-700 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-blue-400">{fileStats.total}</div>
                      <div className="text-sm text-slate-300">Total Files</div>
                    </div>
                    <div className="bg-slate-700 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-green-400">{fileStats.java}</div>
                      <div className="text-sm text-slate-300">Java Files</div>
                    </div>
                    <div className="bg-slate-700 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-yellow-400">{fileStats.resources}</div>
                      <div className="text-sm text-slate-300">Resources</div>
                    </div>
                    <div className="bg-slate-700 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-purple-400">{fileStats.tests}</div>
                      <div className="text-sm text-slate-300">Tests</div>
                    </div>
                  </div>
                </div>

                {/* Quality Score Card */}
                <div className="bg-slate-800 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Quality Score</h3>
                  <div className="flex justify-center">
                    <div className="w-32 h-32">
                      <QualityGauge 
                        score={assessment?.summary.maintainabilityIndex || 0}
                        maxScore={100}
                        label="Overall Quality"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {refactoredFileEntries.length > 0 && (
                <div className="mb-6">
                  <SavedRefactoredFilesPanel
                    entries={refactoredFileEntries}
                    onOpenFile={(path) => void openRefactoredFile(path)}
                    onShowAll={showRefactoredInFileList}
                    onExportExcel={() => setShowExcelExportModal(true)}
                  />
                </div>
              )}

              {workspaceId && (
                <div className="mb-6">
                  <SavedExcelExportsPanel
                    workspaceId={workspaceId}
                    refreshKey={excelExportsRefreshKey}
                    onNewExport={() => setShowExcelExportModal(true)}
                    onCrossProjectExport={() => setShowCrossProjectExcelModal(true)}
                  />
                </div>
              )}

              {/* Enhanced Charts Section */}
              <div className="space-y-6">
                {/* Row 1: Project Overview Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                    <div className="flex items-center mb-4">
                      <AlertTriangle className="w-5 h-5 text-red-400 mr-2" />
                      <h3 className="text-lg font-semibold text-white">Project Code Smells by Severity</h3>
                    </div>
                    <div className="h-64 relative">
                       <CodeSmellsPieChart 
                         critical={assessment?.summary.criticalFindings || 0}
                         major={assessment?.summary.majorFindings || 0}
                         minor={assessment?.summary.minorFindings || 0}
                       />
                    </div>
                  </div>
                  
                  <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                    <div className="flex items-center mb-4">
                      <Bug className="w-5 h-5 text-orange-400 mr-2" />
                      <h3 className="text-lg font-semibold text-white">Project Code Smells by Category</h3>
                    </div>
                    <div className="h-64 relative">
                      {assessment ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-300 text-sm">Total Issues</span>
                            <div className="flex items-center space-x-2">
                              <div className="w-20 bg-slate-700 rounded-full h-2">
                                <div 
                                  className="bg-gradient-to-r from-orange-400 to-red-500 h-2 rounded-full"
                                  style={{ width: `${Math.min(100, (assessment.summary.totalFindings / Math.max(1, assessment.summary.totalFiles)) * 100)}%` }}
                                />
                              </div>
                              <span className="text-white font-semibold text-sm w-8 text-right">{assessment.summary.totalFindings}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-300 text-sm">Files Analyzed</span>
                            <span className="text-white font-semibold text-sm" title="Java/source scope in assessment engine">{assessment.summary.totalFiles} assessed</span>
                            <span className="text-slate-500 text-xs ml-1">/ {fileStats.total} in workspace</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full text-slate-400">
                          <div className="text-center">
                            <Bug className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p>No category data available</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Row 2: File Metrics and Quality */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                    <div className="flex items-center mb-4">
                      <PieChart className="w-5 h-5 text-blue-400 mr-2" />
                      <h3 className="text-lg font-semibold text-white">File Type Distribution</h3>
                    </div>
                    <div className="h-64 relative">
                      <MetricsBarChart 
                        classes={fileStats.java}
                        methods={fileStats.tests}
                        comments={fileStats.resources}
                        lines={fileStats.total}
                      />
                    </div>
                  </div>
                  
                  <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                    <div className="flex items-center mb-4">
                      <BarChart3 className="w-5 h-5 text-green-400 mr-2" />
                      <h3 className="text-lg font-semibold text-white">Project Quality Metrics</h3>
                    </div>
                    <div className="h-64 relative">
                      {assessment ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-300">Overall Score</span>
                            <div className="flex items-center space-x-2">
                              <div className="w-24 bg-slate-700 rounded-full h-3">
                                <div 
                                  className={`h-3 rounded-full transition-all duration-300 ${
                                    assessment.summary.maintainabilityIndex >= 80 ? 'bg-green-500' :
                                    assessment.summary.maintainabilityIndex >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${assessment.summary.maintainabilityIndex}%` }}
                                />
                              </div>
                              <span className="text-white font-semibold">{assessment.summary.maintainabilityIndex}/100</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-slate-300">Total Issues</span>
                            <div className="flex items-center space-x-2">
                              <div className="w-24 bg-slate-700 rounded-full h-3">
                                <div 
                                  className={`h-3 rounded-full ${
                                    ((assessment.summary.criticalFindings || 0) + (assessment.summary.majorFindings || 0) + (assessment.summary.minorFindings || 0)) === 0 ? 'bg-green-500' :
                                    ((assessment.summary.criticalFindings || 0) + (assessment.summary.majorFindings || 0) + (assessment.summary.minorFindings || 0)) <= 10 ? 'bg-yellow-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${Math.min(100, ((assessment.summary.criticalFindings || 0) + (assessment.summary.majorFindings || 0) + (assessment.summary.minorFindings || 0)) * 5)}%` }}
                                />
                              </div>
                              <span className="text-white font-semibold">
                                {(assessment.summary.criticalFindings || 0) + (assessment.summary.majorFindings || 0) + (assessment.summary.minorFindings || 0)}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-slate-300">Files Analyzed</span>
                            <div className="flex items-center space-x-2">
                              <div className="w-24 bg-slate-700 rounded-full h-3">
                                <div 
                                  className="bg-blue-500 h-3 rounded-full"
                                  style={{ width: `${Math.min(100, (fileStats.total / 1000) * 100)}%` }}
                                />
                              </div>
                              <span className="text-white font-semibold">{fileStats.total}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full text-slate-400">
                          <div className="text-center">
                            <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p>No quality metrics available</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Row 3: Project Summary */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Project Statistics */}
                  <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                    <div className="flex items-center mb-4">
                      <FileText className="w-5 h-5 text-blue-400 mr-2" />
                      <h3 className="text-lg font-semibold text-white">Project Statistics</h3>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-300">Total Files</span>
                        <span className="text-white font-semibold">{fileStats.total}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-300">Java Files</span>
                        <span className="text-white font-semibold">{fileStats.java}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-300">Test Files</span>
                        <span className="text-white font-semibold">{fileStats.tests}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-300">Resource Files</span>
                        <span className="text-white font-semibold">{fileStats.resources}</span>
                      </div>
                    </div>
                  </div>

                  {/* Refactoring Suggestions */}
                  <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                    <div className="flex items-center mb-4">
                      <Lightbulb className="w-5 h-5 text-yellow-400 mr-2" />
                      <h3 className="text-lg font-semibold text-white">Refactoring Suggestions</h3>
                    </div>
                    <div className="space-y-3">
                      {plan?.transforms?.slice(0, 5).map((transform: any, index: number) => (
                        <div key={index} className="p-3 bg-slate-700/50 rounded-lg">
                          <p className="text-white text-sm font-medium mb-1">{transform.name}</p>
                          <p className="text-slate-400 text-xs">{transform.description || 'No description available'}</p>
                        </div>
                      )) || (
                        <div className="text-center text-slate-400 py-8">
                          <Lightbulb className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No suggestions available</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Project Health */}
                  <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                    <div className="flex items-center mb-4">
                      <Activity className="w-5 h-5 text-green-400 mr-2" />
                      <h3 className="text-lg font-semibold text-white">Project Health</h3>
                    </div>
                    <div className="space-y-6">
                      <div className="text-center">
                        <div className="w-24 h-24 mx-auto mb-4">
                          <QualityGauge 
                            score={assessment?.summary.maintainabilityIndex || 0}
                            maxScore={100}
                            label="Quality"
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-slate-300 text-sm font-medium">
                            {(assessment?.summary.maintainabilityIndex || 0) >= 80 ? 'Excellent' :
                             (assessment?.summary.maintainabilityIndex || 0) >= 60 ? 'Good' :
                             (assessment?.summary.maintainabilityIndex || 0) >= 40 ? 'Fair' : 'Needs Improvement'}
                          </p>
                          <p className="text-slate-400 text-xs">
                            Score: {Math.round(assessment?.summary.maintainabilityIndex || 0)}/100
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-center py-2 border-b border-slate-700/50">
                          <span className="text-slate-300">Files Analyzed</span>
                          <span className="text-white font-semibold">{fileStats.total}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-700/50">
                          <span className="text-slate-300">Issues Found</span>
                          <span className="text-white font-semibold">
                            {(assessment?.summary.criticalFindings || 0) + 
                             (assessment?.summary.majorFindings || 0) + 
                             (assessment?.summary.minorFindings || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2">
                          <span className="text-slate-300">Last Updated</span>
                          <span className="text-white font-semibold">{new Date().toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeView === 'files' && (
            <div className="h-full flex flex-col min-h-0">
              <div className="bg-slate-800 border-b border-slate-700 shrink-0">
                {fileBrowserChromeCollapsed ? (
                  <div className="px-4 py-2 flex flex-wrap items-center gap-2 gap-y-2">
                    <button
                      type="button"
                      onClick={toggleFileBrowserChrome}
                      className="flex items-center gap-1.5 text-sm font-semibold text-white hover:text-cyan-200 transition-colors"
                      aria-expanded={false}
                      title="Expand filters, progress, and refactored files"
                    >
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                      File Browser
                    </button>
                    <span className="text-xs text-slate-400">
                      {filteredFiles.length} shown
                      {pmdTotalSmells > 0 && (
                        <span className="text-green-400/90 ml-1">
                          · {pmdTotalSmells} PMD · {pmdFilesWithSmells} w/ smells
                        </span>
                      )}
                    </span>
                    {countRefactoredFiles(fileProgress) > 0 && (
                      <span className="text-xs text-green-400/90">
                        · {countRefactoredFiles(fileProgress)} refactored
                      </span>
                    )}
                    <div className="flex-1 min-w-[140px] max-w-md relative ml-auto">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Search files…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-700/80 text-white text-xs pl-8 pr-2 py-1.5 rounded border border-slate-600 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setFileViewMode('list')}
                        className={`p-1.5 rounded ${fileViewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
                        title="List view"
                      >
                        <List className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFileViewMode('grid')}
                        className={`p-1.5 rounded ${fileViewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
                        title="Grid view"
                      >
                        <Grid className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-start gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={toggleFileBrowserChrome}
                      className="mt-0.5 p-0.5 rounded hover:bg-slate-700/80 transition-colors shrink-0"
                      aria-expanded={true}
                      title="Collapse header to show more files"
                    >
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    </button>
                    <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-white">File Browser</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Browse workspace files. <strong className="text-slate-400">Run Analysis</strong> runs PMD on all{' '}
                      <strong className="text-slate-400">.java</strong> files (not XML/properties). Large trees take time.
                    </p>
                    {fullAnalysisStatus && (
                      <p className="text-xs text-blue-300 mt-1">{fullAnalysisStatus}</p>
                    )}
                    {showOnlyCodeSmellsFiles && pmdFilesWithSmells === 0 && !isRunningFullAnalysis && (
                      <p className="text-xs text-amber-400 mt-1">
                        No PMD counts yet — click <strong>Run Analysis</strong> to scan the whole project, or open a file and use Analyze.
                      </p>
                    )}
                    <p className="text-sm text-slate-400 mt-1">
                      {filteredFiles.length} shown
                      {filteredFiles.length !== fileStats.total ? ` · ${fileStats.total} in workspace` : ''}
                      {javaFilesInList.length > 0 && (
                        <span className="text-slate-500">
                          {' '}
                          · {javaFilesInList.length} Java
                          {pmdJavaWithCounts > 0 && pmdJavaWithCounts < javaFilesInList.length
                            ? ` (${pmdJavaWithCounts} with PMD counts)`
                            : ''}
                        </span>
                      )}
                      {showOnlyCodeSmellsFiles ? ' (PMD smells only)' : ''}
                      {pmdTotalSmells > 0 && (
                        <span className="ml-2 text-green-400">
                          ({pmdTotalSmells} PMD violations across {pmdFilesWithSmells} Java file
                          {pmdFilesWithSmells === 1 ? '' : 's'})
                        </span>
                      )}
                      {pmdJavaWithCounts > 0 &&
                        pmdJavaWithCounts < javaFilesInList.length &&
                        !isRunningFullAnalysis && (
                          <span className="ml-2 text-amber-400/90">
                            ({javaFilesInList.length - pmdJavaWithCounts} Java not scanned yet — click Run Analysis)
                          </span>
                        )}
                    </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      onClick={() => setFileViewMode('list')}
                      className={`p-2 rounded ${fileViewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
                    >
                      <List className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setFileViewMode('grid')}
                      className={`p-2 rounded ${fileViewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
                    >
                      <Grid className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Search and Filters */}
                <div className="flex items-center space-x-4">
                  <div className="flex-1 relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search files..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-slate-700 text-white pl-10 pr-4 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <select
                    value={fileTypeFilter}
                    onChange={(e) => setFileTypeFilter(e.target.value)}
                    className="bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">All Types</option>
                    <option value="java">Java Files</option>
                    <option value="resources">Resources</option>
                    <option value="tests">Tests</option>
                    <option value="config">Config</option>
                  </select>
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value as FileListSortKey);
                      setCurrentPage(0);
                    }}
                    className="bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="size">Sort by Size</option>
                    <option value="name">Sort by Name</option>
                    <option value="type">Sort by Type</option>
                    <option value="smells-asc">Code smells (low → high)</option>
                    <option value="smells-desc">Code smells (high → low)</option>
                  </select>
                  
                  {/* Show only files with code smells checkbox */}
                  <div className="flex items-center space-x-2 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2">
                    <input
                      type="checkbox"
                      id="showCodeSmellsOnly"
                      checked={showOnlyCodeSmellsFiles}
                      onChange={(e) => setShowOnlyCodeSmellsFiles(e.target.checked)}
                      className="w-4 h-4 text-green-600 bg-slate-700 border-slate-600 rounded focus:ring-green-500 focus:ring-2"
                    />
                    <label htmlFor="showCodeSmellsOnly" className="text-sm font-medium text-green-400 cursor-pointer flex items-center space-x-1">
                      <span>⚠️</span>
                      <span>Show only files with code smells</span>
                    </label>
                  </div>
                  
                  
                  <button
                    type="button"
                    onClick={() => void runFullProjectAnalysis()}
                    disabled={isRunningFullAnalysis}
                    className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs rounded transition-colors"
                    title="Re-run full PMD scan and refresh the file list"
                  >
                    {isRunningFullAnalysis ? 'Scanning…' : 'Force Refresh'}
                  </button>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                  >
                    <option value={10}>10 per page</option>
                    <option value={20}>20 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                  </select>
                </div>

                {refactoredFileEntries.length > 0 && (
                  <div className="mt-3">
                    <SavedRefactoredFilesPanel
                      compact
                      defaultCollapsed
                      entries={refactoredFileEntries}
                      onOpenFile={(path) => void openRefactoredFile(path)}
                      onShowAll={showRefactoredInFileList}
                      onExportExcel={() => setShowExcelExportModal(true)}
                    />
                  </div>
                )}

                {workspaceId && (
                  <div className="mt-3">
                    <SavedExcelExportsPanel
                      workspaceId={workspaceId}
                      refreshKey={excelExportsRefreshKey}
                      onNewExport={() => setShowExcelExportModal(true)}
                      onCrossProjectExport={() => setShowCrossProjectExcelModal(true)}
                    />
                  </div>
                )}

                {/* Refactoring Progress Bar & Status Filter */}
                {Object.keys(fileProgress).length > 0 && (() => {
                  const total = files.filter(f => f.name.endsWith('.java') && !f.relativePath.includes('/test/')).length;
                  const refactored = countRefactoredFiles(fileProgress);
                  const rejected = Object.values(fileProgress).filter(fp => fp.status === 'rejected').length;
                  const errors = Object.values(fileProgress).filter(fp => fp.status === 'error').length;
                  const analyzed = Object.values(fileProgress).filter((fp) => isFileAnalyzed(fp)).length;
                  const pending = Math.max(0, total - refactored - rejected - errors);
                  const pct = total > 0 ? Math.round((refactored / total) * 100) : 0;
                  return (
                    <div className="mt-3 bg-slate-800/60 border border-slate-700/50 rounded-lg p-3 space-y-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRefactoringProgressCollapsed((c) => {
                            const next = !c;
                            try {
                              localStorage.setItem('refactai-progress-panel-collapsed', next ? '1' : '0');
                            } catch {
                              /* ignore */
                            }
                            return next;
                          });
                        }}
                        className="flex w-full items-center justify-between text-xs group"
                        aria-expanded={!refactoringProgressCollapsed}
                      >
                        <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                          {refactoringProgressCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-200" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-200" />
                          )}
                          Refactoring Progress
                        </span>
                        <span className="text-slate-400">
                          {refactored}/{total} completed ({pct}%)
                        </span>
                      </button>
                      {!refactoringProgressCollapsed && (
                      <>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden flex">
                        {refactored > 0 && <div className="bg-green-500 h-full transition-all" style={{ width: `${(refactored / Math.max(total, 1)) * 100}%` }} />}
                        {rejected > 0 && <div className="bg-red-500 h-full transition-all" style={{ width: `${(rejected / Math.max(total, 1)) * 100}%` }} />}
                        {errors > 0 && <div className="bg-amber-500 h-full transition-all" style={{ width: `${(errors / Math.max(total, 1)) * 100}%` }} />}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { key: '' as const, label: 'All', count: total, color: 'bg-slate-700 text-slate-300 border-slate-600' },
                          { key: 'pending' as const, label: 'Pending', count: pending, color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' },
                          { key: 'analyzed' as const, label: 'Analyzed', count: analyzed, color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
                          { key: 'refactored' as const, label: 'Refactored', count: refactored, color: 'bg-green-500/10 text-green-400 border-green-500/30' },
                          { key: 'rejected' as const, label: 'Rejected', count: rejected, color: 'bg-red-500/10 text-red-400 border-red-500/30' },
                          { key: 'error' as const, label: 'Errors', count: errors, color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
                        ].map(({ key, label, count, color }) => (
                          <button
                            key={key}
                            onClick={() => setFileStatusFilter(fileStatusFilter === key ? '' : key)}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                              fileStatusFilter === key
                                ? 'ring-1 ring-blue-400 ' + color
                                : color + ' opacity-70 hover:opacity-100'
                            }`}
                          >
                            {label} ({count})
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setShowExcelExportModal(true)}
                          className="ml-auto px-2 py-0.5 rounded text-[10px] font-medium border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors flex items-center gap-1"
                          title="Export selected refactoring results to Excel (.xlsx)"
                        >
                          <FileText className="w-3 h-3" />
                          Export Excel
                        </button>
                        <button
                          type="button"
                          onClick={() => void exportWorkspaceStudyCsv()}
                          className="px-2 py-0.5 rounded text-[10px] font-medium border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center gap-1"
                          title="Download study CSV for this workspace"
                        >
                          <Download className="w-3 h-3" />
                          Study CSV
                        </button>
                      </div>
                      </>
                      )}
                    </div>
                  );
                })()}
                </div>
                )}
              </div>

              {/* Files List */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                {fileViewMode === 'list' ? (
                  <div className="space-y-2">
                    {paginatedFiles.map((file, index) => {
                      const isExpanded = expandedFiles.has(file.relativePath);
                      const badge = getFileTypeBadge(file);
                      
                      // Gather evidences that belong to this file (real data)
                      const evidencesForFile: any[] = (assessment?.evidences || []).filter((e: any) => {
                        // The file path is in e.pointer.file (CodePointer structure)
                        const filePath = e.pointer?.file;
                        if (!filePath) return false;
                        
                        const norm = (p: string) => String(p).replace(/\\\\/g, '/').toLowerCase();
                        const ev = norm(filePath);
                        const rel = norm(file.relativePath);
                        const fileName = file.name.toLowerCase();
                        
                        // More precise matching - require exact path match or very specific patterns
                        const exactMatch = ev === rel;
                        const endsWithMatch = ev.endsWith('/' + fileName) && ev.includes('src/');
                        const containsMatch = ev.includes('/' + fileName) && ev.includes('src/');
                        
                        const matchesFile = exactMatch || endsWithMatch || containsMatch;
                        
                        if (!matchesFile) return false;
                        
                        // Apply active filters from the sidebar
                        const matchesSmellType = activeFilters.smellTypes.length === 0 || 
                          activeFilters.smellTypes.includes(e.detectorId);
                        const matchesSeverity = activeFilters.severities.length === 0 || 
                          activeFilters.severities.includes(e.severity);
                        
                        return matchesSmellType && matchesSeverity;
                      });

                      const detectorN = effectivePmdCount(file, fileProgress);
                      const assessmentN = evidencesForFile.length;
                      // Badge = PMD static detector (file list or file-status after Run Analysis).
                      const codeSmellsCount = detectorN;
                      const finalHasCodeSmells = detectorN !== null && detectorN > 0;
                      // Count smells by type for this file
                      const smellTypeCounts = evidencesForFile.reduce((acc: any, e: any) => {
                        const type = e.detectorId || e.summary || 'Unknown';
                        acc[type] = (acc[type] || 0) + 1;
                        return acc;
                      }, {});
                      
                      // Debug logging for first few files
                      if (index < 3) {
                        console.log(`File ${file.name} - Total evidences: ${evidencesForFile.length}`);
                        console.log(`File ${file.name} - Type counts:`, smellTypeCounts);
                        console.log(`File ${file.name} - Evidence samples:`, evidencesForFile.slice(0, 3));
                        console.log(`File ${file.name} - Math check:`, Object.values(smellTypeCounts).reduce((a: number, b: any) => a + (typeof b === 'number' ? b : 0), 0), 'should equal', evidencesForFile.length);
                      }
                      
                      // Create smell types with counts, limited to 3 types
                      const smellTypes = Object.entries(smellTypeCounts)
                        .map(([type, count]) => `${type} (${count})`)
                        .slice(0, 3);
                      const displaySmellTags =
                        smellTypes.length > 0
                          ? smellTypes
                          : detectorN != null && detectorN > 0
                            ? ['Detector total — open Analyze for typed breakdown']
                            : [];
                      
                      
                      const fpStatus = fileProgress[file.relativePath]?.status;
                      const isCompleted = fpStatus === 'refactored' || fpStatus === 'rejected';
                      
                      return (
                        <div key={index} className={`rounded-lg border transition-colors ${
                          fpStatus === 'refactored' ? 'bg-green-900/10 border-green-700/30' :
                          fpStatus === 'rejected' ? 'bg-red-900/10 border-red-700/30' :
                          fpStatus === 'error' ? 'bg-amber-900/10 border-amber-700/30' :
                          'bg-slate-800 border-slate-700'
                        }`}>
                          <div className="p-4">
                            <div className="flex items-center justify-between">
                              <div className={`flex items-center space-x-3 flex-1 min-w-0 ${isCompleted ? 'opacity-70' : ''}`}>
                                <button
                                  onClick={() => toggleFileExpansion(file.relativePath)}
                                  className="text-slate-400 hover:text-white"
                                >
                                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                                {getFileTypeIcon(file)}
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium truncate ${isCompleted ? 'text-slate-400' : 'text-white'}`}>{file.name}</p>
                                  <p className="text-xs text-slate-400 truncate">{file.relativePath}</p>
                                </div>
                                <span className={`px-2 py-1 rounded text-xs font-medium ${badge.color}`}>
                                  {badge.text}
                                </span>
                                {finalHasCodeSmells && (
                                  <span className="px-2 py-1 rounded text-xs font-medium bg-orange-500/20 text-orange-400 border border-orange-500/30">
                                    {codeSmellsCount} smells
                                  </span>
                                )}
                                {detectorN === null && assessmentN > 0 && (
                                  <span className="px-2 py-1 rounded text-xs font-medium bg-slate-600/40 text-slate-300 border border-slate-500/30" title="Project assessment findings for this file; open Analyze for static detector count">
                                    Assessment {assessmentN}
                                  </span>
                                )}
                                {fileProgress[file.relativePath] && (() => {
                                  const fp = fileProgress[file.relativePath];
                                  if (fp.status === 'refactored') {
                                    return (
                                      <span
                                        className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30"
                                        title={
                                          fp.refactoredArtifactPath
                                            ? `Saved in project: ${fp.refactoredArtifactPath}`
                                            : 'Refactored'
                                        }
                                      >
                                        <CheckCircle className="w-3 h-3" />
                                        Refactored
                                        {fp.refactoredArtifactPath && (
                                          <span className="text-[10px] text-green-500/90 font-normal">· saved</span>
                                        )}
                                        {fp.smellsBefore > 0 && (
                                          <span className="text-[10px] text-green-500/80 ml-0.5">
                                            ({fp.smellsBefore}→{fp.smellsAfter})
                                          </span>
                                        )}
                                      </span>
                                    );
                                  }
                                  if (fp.status === 'rejected') {
                                    return (
                                      <span
                                        className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30"
                                        title={
                                          fp.refactoredArtifactPath
                                            ? `Rejected candidate saved: ${fp.refactoredArtifactPath}`
                                            : fp.rejectionReason || 'Rejected'
                                        }
                                      >
                                        <XCircle className="w-3 h-3" />
                                        Rejected
                                        {fp.refactoredArtifactPath && (
                                          <span className="text-[10px] text-red-500/90 font-normal">· saved</span>
                                        )}
                                      </span>
                                    );
                                  }
                                  if (fp.status === 'skipped') {
                                    return (
                                      <span className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-slate-500/20 text-slate-400 border border-slate-500/30">
                                        Skipped
                                      </span>
                                    );
                                  }
                                  if (fp.status === 'error') {
                                    return (
                                      <span className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                        <AlertTriangle className="w-3 h-3" />
                                        Error
                                      </span>
                                    );
                                  }
                                  if (isFileAnalyzed(fp)) {
                                    return (
                                      <span className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30" title="PMD analysis recorded">
                                        <Search className="w-3 h-3" />
                                        Analyzed
                                        {fp.analysisSmellCount != null && fp.analysisSmellCount > 0 && (
                                          <span className="text-[10px] opacity-80">({fp.analysisSmellCount})</span>
                                        )}
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                              <div className="flex items-center space-x-2">
                                {/* View Button */}
                                <button 
                                  onClick={() => loadFileContent(file)}
                                  className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded text-xs transition-colors"
                                >
                                  View
                                </button>
                                
                                {/* Analyze Button */}
                                <button
                                  onClick={() => {
                                    console.log('🔍 Manual analyze button clicked for:', file.relativePath);
                                    setSelectedFile(file);
                                    setActiveView('analysis');
                                    // Force analysis even if one exists
                                    setFileAnalysis(null);
                                    setTimeout(() => analyzeFile(), 100);
                                  }}
                                  disabled={isAnalyzing}
                                  className={`px-3 py-1 rounded text-xs transition-colors ${
                                    isAnalyzing 
                                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                                  }`}
                                >
                                  {isAnalyzing ? (
                                    <>
                                      <RefreshCw className="w-3 h-3 mr-1 animate-spin inline" />
                                      Analyzing...
                                    </>
                                  ) : (
                                    'Analyze'
                                  )}
                                </button>
                                
                                {/* Refactoring Button - Enhanced AI Refactoring */}
                                <button
                                  onClick={async () => {
                                    console.log('🚀 Enhanced AI Refactoring triggered for:', file.relativePath);
                                    setSelectedFile(file);
                                    setLoadingFileContent(true);
                                    try {
                                      // Load file content
                                      const content = await apiClient.getFileContent(workspaceId, file.relativePath);
                                      setFileContent(typeof content === 'string' ? content : content.content || '');
                                      
                                      // Load code smells for this file
                                      try {
                                        const analysisResponse = await apiClient.analyzeFileEnhanced(workspaceId, file.relativePath);
                                        console.log('✅ Enhanced analysis loaded:', analysisResponse);
                                        setFileCodeSmells(analysisResponse.codeSmells || []);
                                      } catch (analysisError) {
                                        console.warn('⚠️ PMD enhanced analysis failed:', analysisError);
                                        setFileCodeSmells([]);
                                      }
                                      
                                      setActiveView('refactoring');
                                    } catch (error) {
                                      console.error('Failed to load file content:', error);
                                      setFileContent('// Failed to load file content');
                                      setFileCodeSmells([]);
                                      setActiveView('refactoring');
                                    } finally {
                                      setLoadingFileContent(false);
                                    }
                                  }}
                                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-3 py-1 rounded text-xs transition-colors font-medium shadow-lg hover:shadow-xl transform hover:scale-105"
                                >
                                  🧠 AI Refactoring
                                </button>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="mt-4 pt-4 border-t border-slate-700">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-3">
                                  <div>
                                    <span className="text-slate-400">Lines:</span>
                                    <span className="text-white ml-2">{file.metrics.linesOfCode}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-400">Classes:</span>
                                    <span className="text-white ml-2">{file.metrics.classCount}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-400">Methods:</span>
                                    <span className="text-white ml-2">{file.metrics.methodCount}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-400">Complexity:</span>
                                    <span className="text-white ml-2">{file.metrics.cyclomaticComplexity}</span>
                                  </div>
                                </div>
                                
                                {/* Code Smells Section */}
                                {finalHasCodeSmells && (
                                  <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600/50">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-slate-300 text-xs font-medium">Code Smells:</span>
                                      <span className="text-orange-400 text-xs font-semibold">{codeSmellsCount} detected</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {displaySmellTags.map((type, i) => (
                                        <span key={i} className="px-2 py-1 bg-slate-600/50 text-slate-200 text-[10px] rounded border border-slate-500/30">
                                          {type}
                                        </span>
                                      ))}
                                </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {paginatedFiles.map((file, index) => {
                      const badge = getFileTypeBadge(file);

                      const detectorN = fileStaticSmellCount(file);
                      const codeSmellsCount = detectorN;
                      const finalHasCodeSmells = detectorN !== null && detectorN > 0;

                      return (
                        <div key={index} className="bg-slate-800 rounded-lg border border-slate-700 p-4 hover:border-slate-600 transition-colors">
                          <div className="flex items-center space-x-2 mb-3">
                            {getFileTypeIcon(file)}
                            <span className={`px-2 py-1 rounded text-xs font-medium ${badge.color}`}>
                              {badge.text}
                            </span>
                            {finalHasCodeSmells && (
                              <span className="px-2 py-1 rounded text-xs font-medium bg-orange-500/20 text-orange-400 border border-orange-500/30">
                                ⚠️ {codeSmellsCount}
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-medium text-white mb-1 truncate">{file.name}</h4>
                          <p className="text-xs text-slate-400 mb-3 truncate">{file.relativePath}</p>
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-slate-300">
                              {file.metrics.linesOfCode} lines
                            </div>
                            <button
                              onClick={() => {
                                console.log('🔍 File list analyze button clicked for:', file.relativePath);
                                setSelectedFile(file);
                                setActiveView('analysis');
                                setFileAnalysis(null);
                                setTimeout(() => analyzeFile(), 100);
                              }}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs transition-colors"
                            >
                              Analyze
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6">
                    <div className="text-sm text-slate-400">
                      Showing {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, filteredFiles.length)} of {filteredFiles.length} filtered ({fileStats.total} in workspace)
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setCurrentPage(0)}
                        disabled={currentPage === 0}
                        className="p-2 text-slate-400 hover:text-white disabled:opacity-50"
                      >
                        <ChevronFirst className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 0}
                        className="p-2 text-slate-400 hover:text-white disabled:opacity-50"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-sm text-slate-300">
                        Page {currentPage + 1} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage >= totalPages - 1}
                        className="p-2 text-slate-400 hover:text-white disabled:opacity-50"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setCurrentPage(totalPages - 1)}
                        disabled={currentPage >= totalPages - 1}
                        className="p-2 text-slate-400 hover:text-white disabled:opacity-50"
                      >
                        <ChevronLast className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Comprehensive Analysis View */}
          {activeView === 'analysis' && (
            <div className="h-full flex flex-col">
                <div className="h-full overflow-y-auto p-6">
                <div className="space-y-6">
                  {/* Analysis Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold text-white flex items-center">
                        <Code className="w-8 h-8 text-blue-600 mr-3" />
                        Code Analysis
                      </h2>
                      <p className="text-gray-400 mt-1">
                        Comprehensive analysis of your project
                      </p>
                </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-sm text-gray-500">
                        {files.length} files analyzed
                      </span>
                  </div>
                </div>

                  {/* Analysis Results Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Project Overview */}
                    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
                      <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <BarChart3 className="w-5 h-5 text-blue-400 mr-2" />
                        Project Overview
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-300">Total Files</span>
                          <span className="text-white font-semibold">{files.length}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-300">Java Files</span>
                          <span className="text-white font-semibold">
                            {files.filter(f => f.relativePath.endsWith('.java')).length}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-300">Test Files</span>
                          <span className="text-white font-semibold">
                            {files.filter(f => f.relativePath.includes('test')).length}
                          </span>
                        </div>
                        {assessment && (
                          <>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-300">Code Smells</span>
                              <span className="text-white font-semibold">
                                {filteredAssessment?.evidences?.length || filteredAssessment?.summary?.totalFindings || 0}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-300">Technical Debt</span>
                              <span className="text-white font-semibold">
                                {assessment.summary?.maintainabilityIndex ? `${assessment.summary.maintainabilityIndex.toFixed(1)}/100` : 'N/A'}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* File Analysis */}
                    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white flex items-center">
                          <FileText className="w-5 h-5 text-green-400 mr-2" />
                          File Analysis
                        </h3>
                        <div className="flex items-center space-x-2">
                          <select
                            className="bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-600"
                            value={sortBy}
                            onChange={(e) => {
                              setSortBy(e.target.value as FileListSortKey);
                              setCurrentPage(0);
                            }}
                          >
                            <option value="name">Sort by Name</option>
                            <option value="size">Sort by Size</option>
                            <option value="type">Sort by Type</option>
                            <option value="smells-asc">Code smells (low → high)</option>
                            <option value="smells-desc">Code smells (high → low)</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {filteredFiles.slice(0, 10).map((file, index) => {
                          const pmdN = fileStaticSmellCount(file) ?? 0;
                          const hasCodeSmells = pmdN > 0;
                          
                          return (
                            <div key={index} className={`flex items-center justify-between p-3 rounded-lg ${
                              hasCodeSmells ? 'bg-red-900/20 border border-red-500/30' : 'bg-slate-700'
                            }`}>
                              <div className="flex items-center space-x-3">
                                <FileText className={`w-4 h-4 ${hasCodeSmells ? 'text-red-400' : 'text-slate-400'}`} />
                                <span className="text-white text-sm truncate">
                                  {file.name || file.relativePath.split('/').pop()}
                                </span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-xs text-slate-400">
                                  {file.metrics?.linesOfCode ? `${file.metrics.linesOfCode} lines` : 'N/A'}
                                </span>
                                {hasCodeSmells && (
                                  <span className="text-xs text-red-400 font-medium">
                                    {pmdN} PMD
                                  </span>
                                )}
                                <button
                                  onClick={() => {
                                    setSelectedFile(file);
                                    loadFileContent(file);
                                  }}
                                  className="p-1 text-blue-400 hover:text-blue-300 transition-colors"
                                  title="View File"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {filteredFiles.length > 10 && (
                          <div className="text-center text-slate-400 text-sm">
                            ... and {filteredFiles.length - 10} more files
                          </div>
                        )}
                      </div>
                    </div>
                  </div>



                  {/* File Selection Prompt */}
                  {!selectedFile && (
                    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
                      <div className="text-center">
                        <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-white mb-2">Detailed File Analysis</h3>
                        <p className="text-slate-400 mb-4">
                          Select a file from the Files tab to see detailed analysis including:
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <CheckCircle className="w-4 h-4 text-green-400" />
                              <span className="text-slate-300">Code quality metrics</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <CheckCircle className="w-4 h-4 text-green-400" />
                              <span className="text-slate-300">Complexity analysis</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <CheckCircle className="w-4 h-4 text-green-400" />
                              <span className="text-slate-300">Security vulnerabilities</span>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <CheckCircle className="w-4 h-4 text-green-400" />
                              <span className="text-slate-300">Refactoring suggestions</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <CheckCircle className="w-4 h-4 text-green-400" />
                              <span className="text-slate-300">Performance insights</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <CheckCircle className="w-4 h-4 text-green-400" />
                              <span className="text-slate-300">Best practices</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeView === 'dependencies' && (
            <div className="h-full overflow-y-auto p-6">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white">Dependency Analysis</h2>
                    <p className="text-slate-400">Understand file relationships and refactoring impact</p>
                  </div>
                  <button
                    onClick={loadDependencyGraph}
                    disabled={loadingDependencies}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center space-x-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingDependencies ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                {/* Dependency Graph */}
                {loadingDependencies ? (
                  <div className="space-y-6">
                    <SkeletonChart className="h-96" />
                    <SkeletonCard />
                  </div>
                ) : (
                  <>
                    <DependencyGraph
                      nodes={projectGraphCanvasNodes}
                      selectedNode={selectedFile?.relativePath}
                      onNodeSelect={(nodeId) => {
                        const file = files.find(f => f.relativePath === nodeId);
                        if (file) {
                          setSelectedFile(file);
                        }
                      }}
                    />

                    {/* Dependency Metrics */}
                    {dependencyGraph?.metrics && (
                      <DependencyMetrics
                        metrics={dependencyGraph.metrics}
                        fileAnalysis={fileDependencyAnalysis || undefined}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {activeView === 'refactoring' && (
            <div className="h-full overflow-y-auto p-6">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white">AI Refactoring Engine</h2>
                    <p className="text-slate-400">
                      {refactoringMode === 'agentic' 
                        ? 'Agentic-based refactoring with code smell detection and analysis'
                        : 'Refactoring operations with ripple impact analysis'}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => setRefactoringMode(refactoringMode === 'agentic' ? 'operations' : 'agentic')}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm flex items-center"
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      {refactoringMode === 'agentic' ? 'Switch to Operations' : 'Switch to Agentic'}
                    </button>
                  </div>
                </div>

                {selectedFile ? (
                  refactoringMode === 'agentic' ? (
                    <ControlledRefactoring
                      key={`${workspaceId}:${selectedFile.relativePath}`}
                      workspaceId={workspaceId}
                      selectedFile={selectedFile.relativePath}
                      fileContent={fileContent || ''}
                      codeSmells={fileCodeSmells || []}
                      onRefactoringComplete={(refactoredCode) => {
                        console.log('Refactoring completed:', refactoredCode);
                        void reloadFileProgress();
                        onAnalysisComplete?.();
                      }}
                      onBack={() => setActiveView('analysis')}
                      onNextFile={() => {
                        const javaFiles = files.filter(f => f.name.endsWith('.java') && !f.relativePath.includes('/test/'));
                        const nextFile = javaFiles.find(f => !fileProgress[f.relativePath] || fileProgress[f.relativePath].status === 'pending');
                        if (nextFile) {
                          setSelectedFile(nextFile);
                          setFileContent('');
                          setFileAnalysis(null);
                          loadFileContent(nextFile);
                        }
                      }}
                    />
                  ) : (
                    <RefactoringOperations
                      workspaceId={workspaceId}
                      selectedFile={selectedFile.relativePath}
                      onRefactoringComplete={() => {
                        console.log('Refactoring operations completed');
                        if (onAnalysisComplete) {
                          onAnalysisComplete();
                        }
                      }}
                    />
                  )
                ) : (
                  <div className="bg-slate-800 rounded-xl p-12 border border-slate-700 text-center">
                    <FileText className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">Select a File to Refactor</h3>
                    <p className="text-slate-400 mb-6">Choose a file from the file list to start refactoring</p>
                    <button
                      onClick={() => setActiveView('files')}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                      Browse Files
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeView === 'batch' && (
            <div className="h-full overflow-y-auto p-6">
              <BatchRefactoring
                workspaceId={workspaceId}
                projectLabel={workspaceName || workspaceId}
                files={files}
                fileProgress={fileProgress}
                onBatchComplete={() => {
                  void reloadFileProgress();
                  if (onAnalysisComplete) onAnalysisComplete();
                }}
                onAutoExcelSaved={bumpExcelExportsRefresh}
              />
            </div>
          )}

          {activeView === 'baseline' && ENABLE_BASELINE_NAV && (
            <div className="h-full overflow-y-auto p-6">
              <BaselineComparisonPanel />
            </div>
          )}

          {activeView === 'monitor' && (
            <RefactoringMonitor
              workspaceId={workspaceId}
              onOperationComplete={() => {
                // Refresh the analysis after refactoring operations
                if (onAnalysisComplete) {
                  onAnalysisComplete();
                }
              }}
            />
          )}

          {activeView === 'projects' && (
            <div className="h-full overflow-y-auto p-6">
              <ProjectHub
                userId={currentUserId}
                userName={currentUserName}
                openNewProjectTick={openNewProjectTick}
                onCloneProject={onCloneProject}
                onUploadProject={onUploadProject}
                onProjectSelect={async (project, options) => {
                  console.log('Resuming project:', project.id, options);
                  if (typeof window !== 'undefined') {
                    const url = new URL(window.location.href);
                    url.searchParams.set('workspace', project.id);
                    window.history.replaceState({}, '', url.toString());
                  }
                  if (onProjectResume) {
                    await onProjectResume(project.id);
                  } else {
                    const workspace = {
                      id: project.id,
                      name: project.name,
                      sourceFiles: project.sourceFiles,
                      testFiles: project.testFiles,
                      createdAt: project.createdAt,
                    };
                    setCurrentWorkspace?.(workspace);
                  }
                  await reloadFileProgress();
                  if (options?.fileStatusFilter) {
                    setFileStatusFilter(options.fileStatusFilter);
                  }
                  if (options?.openFirstRefactored) {
                    pendingOpenRefactored.current = 'first';
                  }
                  if (options?.openExcelExport) {
                    pendingOpenExcelExport.current = true;
                  }
                  const view = options?.view
                    ?? (options?.fileStatusFilter === 'refactored' || options?.openFirstRefactored
                      ? 'files'
                      : 'analysis');
                  setActiveView(view);
                }}
                onProjectDelete={(projectId) => {
                  console.log('Project deleted:', projectId);
                }}
                onProjectAnalyze={async (project) => {
                  console.log('Analyze project:', project);
                  if (typeof window !== 'undefined') {
                    const url = new URL(window.location.href);
                    url.searchParams.set('workspace', project.id);
                    window.history.replaceState({}, '', url.toString());
                  }
                  if (onProjectResume) {
                    await onProjectResume(project.id);
                  } else {
                    const workspace = {
                      id: project.id,
                      name: project.name,
                      sourceFiles: 0,
                      testFiles: 0,
                      createdAt: Date.now(),
                    };
                    setCurrentWorkspace?.(workspace);
                    setTimeout(() => {
                      startAnalysisWithWorkspace(workspace);
                    }, 100);
                  }
                  setActiveView('analysis');
                }}
              />
            </div>
          )}
            </>
          )}
        </div>
      </div>

      {/* Code Preview Modal */}
      {showCodePreview && currentPreviewFile && (
        <ErrorBoundary>
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-7xl h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-700">
                <div>
                  <h2 className="text-xl font-semibold text-white">{currentPreviewFile.name}</h2>
                  <p className="text-sm text-slate-400">{currentPreviewFile.relativePath}</p>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-slate-300">
                    Code Smells: {fileCodeSmells.length}
                  </span>
                  {(fileProgress[currentPreviewFile.relativePath]?.status === 'refactored' ||
                    fileProgress[currentPreviewFile.relativePath]?.refactoredArtifactPath) &&
                    !REFINE_DEMO && (
                    <button
                      type="button"
                      onClick={() => setShowFileResearchReport(true)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium flex items-center gap-1.5 transition-colors"
                      title="Read-only report from saved history (no new refactoring)"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      View report
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowCodePreview(false);
                      setShowFileResearchReport(false);
                    }}
                    className="text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
              </div>
              
              {/* Content */}
              <div className="flex-1 flex overflow-hidden">
                {/* Code Content */}
                <div className="flex-1 overflow-auto p-4">
                  {/* Code Smell Legend */}
                  <div className="mb-4 bg-slate-800 rounded-lg p-3 border border-slate-600">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-white">Code Smell Types:</h4>
                      <button
                        onClick={() => void runFullProjectAnalysis()}
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded transition-colors"
                        title="Re-run full PMD scan for the project"
                      >
                        Refresh Analysis
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-red-500 rounded"></div>
                        <span className="text-xs text-slate-300">Long Method</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-purple-500 rounded"></div>
                        <span className="text-xs text-slate-300">God Class</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-orange-500 rounded"></div>
                        <span className="text-xs text-slate-300">Duplicate Code</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                        <span className="text-xs text-slate-300">Complex Method</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-slate-900 rounded-lg border border-slate-600">
                    <pre className="text-sm text-slate-300 p-4">
                      {fileContent.split('\n').map((line, index) => {
                        const lineNumber = index + 1;
                        const codeSmell = fileCodeSmells.find(smell => {
                          // Handle cases where line ranges might be too broad
                          const startLine = smell.startLine || 1;
                          const endLine = smell.endLine || smell.startLine || 1;
                          
                          // For god class, only highlight the first few lines if the range is too broad
                          if (smell.detectorId === 'design.god-class' && (endLine - startLine) > 20) {
                            return lineNumber >= startLine && lineNumber <= Math.min(startLine + 5, endLine);
                          }
                          
                          return lineNumber >= startLine && lineNumber <= endLine;
                        });
                        
                        // Check if this is the first line of a code smell (to show badge only once)
                        const isFirstLineOfSmell = codeSmell && lineNumber === (codeSmell.startLine || 1);
                        
                        let lineClass = '';
                        let smellTypeColor = '';
                        let smellTypeName = '';
                        
                        if (codeSmell) {
                          // Get smell type from detectorId
                          const smellType = codeSmell.detectorId || codeSmell.type || 'unknown';
                          
                          // Color coding based on smell type
                          switch (smellType) {
                            case 'design.long-method':
                              lineClass = 'bg-red-500/20 border-l-4 border-red-500 pl-2';
                              smellTypeColor = 'bg-red-500/80 text-white';
                              smellTypeName = 'Long Method';
                              break;
                            case 'design.god-class':
                              lineClass = 'bg-purple-500/20 border-l-4 border-purple-500 pl-2';
                              smellTypeColor = 'bg-purple-500/80 text-white';
                              smellTypeName = 'God Class';
                              break;
                            case 'design.duplicate-code':
                              lineClass = 'bg-orange-500/20 border-l-4 border-orange-500 pl-2';
                              smellTypeColor = 'bg-orange-500/80 text-white';
                              smellTypeName = 'Duplicate Code';
                              break;
                            case 'design.complex-method':
                              lineClass = 'bg-yellow-500/20 border-l-4 border-yellow-500 pl-2';
                              smellTypeColor = 'bg-yellow-500/80 text-white';
                              smellTypeName = 'Complex Method';
                              break;
                            case 'design.long-parameter-list':
                              lineClass = 'bg-pink-500/20 border-l-4 border-pink-500 pl-2';
                              smellTypeColor = 'bg-pink-500/80 text-white';
                              smellTypeName = 'Long Parameter List';
                              break;
                            case 'design.feature-envy':
                              lineClass = 'bg-cyan-500/20 border-l-4 border-cyan-500 pl-2';
                              smellTypeColor = 'bg-cyan-500/80 text-white';
                              smellTypeName = 'Feature Envy';
                              break;
                            case 'design.data-clumps':
                              lineClass = 'bg-teal-500/20 border-l-4 border-teal-500 pl-2';
                              smellTypeColor = 'bg-teal-500/80 text-white';
                              smellTypeName = 'Data Clumps';
                              break;
                            case 'design.primitive-obsession':
                              lineClass = 'bg-indigo-500/20 border-l-4 border-indigo-500 pl-2';
                              smellTypeColor = 'bg-indigo-500/80 text-white';
                              smellTypeName = 'Primitive Obsession';
                              break;
                            case 'design.switch-statements':
                              lineClass = 'bg-rose-500/20 border-l-4 border-rose-500 pl-2';
                              smellTypeColor = 'bg-rose-500/80 text-white';
                              smellTypeName = 'Switch Statements';
                              break;
                            case 'design.temporary-field':
                              lineClass = 'bg-emerald-500/20 border-l-4 border-emerald-500 pl-2';
                              smellTypeColor = 'bg-emerald-500/80 text-white';
                              smellTypeName = 'Temporary Field';
                              break;
                            case 'design.lazy-class':
                              lineClass = 'bg-violet-500/20 border-l-4 border-violet-500 pl-2';
                              smellTypeColor = 'bg-violet-500/80 text-white';
                              smellTypeName = 'Lazy Class';
                              break;
                            case 'design.middle-man':
                              lineClass = 'bg-amber-500/20 border-l-4 border-amber-500 pl-2';
                              smellTypeColor = 'bg-amber-500/80 text-white';
                              smellTypeName = 'Middle Man';
                              break;
                            case 'design.speculative-generality':
                              lineClass = 'bg-sky-500/20 border-l-4 border-sky-500 pl-2';
                              smellTypeColor = 'bg-sky-500/80 text-white';
                              smellTypeName = 'Speculative Generality';
                              break;
                            case 'design.message-chains':
                              lineClass = 'bg-lime-500/20 border-l-4 border-lime-500 pl-2';
                              smellTypeColor = 'bg-lime-500/80 text-white';
                              smellTypeName = 'Message Chains';
                              break;
                            case 'design.inappropriate-intimacy':
                              lineClass = 'bg-red-600/20 border-l-4 border-red-600 pl-2';
                              smellTypeColor = 'bg-red-600/80 text-white';
                              smellTypeName = 'Inappropriate Intimacy';
                              break;
                            case 'design.shotgun-surgery':
                              lineClass = 'bg-orange-600/20 border-l-4 border-orange-600 pl-2';
                              smellTypeColor = 'bg-orange-600/80 text-white';
                              smellTypeName = 'Shotgun Surgery';
                              break;
                            case 'design.divergent-change':
                              lineClass = 'bg-fuchsia-500/20 border-l-4 border-fuchsia-500 pl-2';
                              smellTypeColor = 'bg-fuchsia-500/80 text-white';
                              smellTypeName = 'Divergent Change';
                              break;
                            case 'design.parallel-inheritance':
                              lineClass = 'bg-blue-500/20 border-l-4 border-blue-500 pl-2';
                              smellTypeColor = 'bg-blue-500/80 text-white';
                              smellTypeName = 'Parallel Inheritance';
                              break;
                            case 'design.excessive-comments':
                              lineClass = 'bg-gray-500/20 border-l-4 border-gray-500 pl-2';
                              smellTypeColor = 'bg-gray-500/80 text-white';
                              smellTypeName = 'Excessive Comments';
                              break;
                            case 'design.dead-code':
                              lineClass = 'bg-red-800/20 border-l-4 border-red-800 pl-2';
                              smellTypeColor = 'bg-red-800/80 text-white';
                              smellTypeName = 'Dead Code';
                              break;
                            case 'design.large-class':
                              lineClass = 'bg-purple-600/20 border-l-4 border-purple-600 pl-2';
                              smellTypeColor = 'bg-purple-600/80 text-white';
                              smellTypeName = 'Large Class';
                              break;
                            case 'design.data-class':
                              lineClass = 'bg-green-600/20 border-l-4 border-green-600 pl-2';
                              smellTypeColor = 'bg-green-600/80 text-white';
                              smellTypeName = 'Data Class';
                              break;
                            case 'design.magic-numbers':
                              lineClass = 'bg-yellow-600/20 border-l-4 border-yellow-600 pl-2';
                              smellTypeColor = 'bg-yellow-600/80 text-white';
                              smellTypeName = 'Magic Numbers';
                              break;
                            case 'design.string-constants':
                              lineClass = 'bg-teal-600/20 border-l-4 border-teal-600 pl-2';
                              smellTypeColor = 'bg-teal-600/80 text-white';
                              smellTypeName = 'String Constants';
                              break;
                            case 'design.inconsistent-naming':
                              lineClass = 'bg-pink-600/20 border-l-4 border-pink-600 pl-2';
                              smellTypeColor = 'bg-pink-600/80 text-white';
                              smellTypeName = 'Inconsistent Naming';
                              break;
                            case 'design.nested-conditionals':
                              lineClass = 'bg-indigo-600/20 border-l-4 border-indigo-600 pl-2';
                              smellTypeColor = 'bg-indigo-600/80 text-white';
                              smellTypeName = 'Nested Conditionals';
                              break;
                            case 'design.flag-arguments':
                              lineClass = 'bg-orange-500/20 border-l-4 border-orange-500 pl-2';
                              smellTypeColor = 'bg-orange-500/80 text-white';
                              smellTypeName = 'Flag Arguments';
                              break;
                            case 'design.try-catch-hell':
                              lineClass = 'bg-red-700/20 border-l-4 border-red-700 pl-2';
                              smellTypeColor = 'bg-red-700/80 text-white';
                              smellTypeName = 'Try-Catch Hell';
                              break;
                            case 'design.null-abuse':
                              lineClass = 'bg-gray-600/20 border-l-4 border-gray-600 pl-2';
                              smellTypeColor = 'bg-gray-600/80 text-white';
                              smellTypeName = 'Null Abuse';
                              break;
                            case 'design.type-embedded-name':
                              lineClass = 'bg-cyan-600/20 border-l-4 border-cyan-600 pl-2';
                              smellTypeColor = 'bg-cyan-600/80 text-white';
                              smellTypeName = 'Type Embedded Name';
                              break;
                            case 'design.refused-bequest':
                              lineClass = 'bg-purple-700/20 border-l-4 border-purple-700 pl-2';
                              smellTypeColor = 'bg-purple-700/80 text-white';
                              smellTypeName = 'Refused Bequest';
                              break;
                            case 'design.empty-catch-block':
                              lineClass = 'bg-red-900/20 border-l-4 border-red-900 pl-2';
                              smellTypeColor = 'bg-red-900/80 text-white';
                              smellTypeName = 'Empty Catch Block';
                              break;
                            case 'design.resource-leak':
                              lineClass = 'bg-orange-700/20 border-l-4 border-orange-700 pl-2';
                              smellTypeColor = 'bg-orange-700/80 text-white';
                              smellTypeName = 'Resource Leak';
                              break;
                            case 'design.raw-types':
                              lineClass = 'bg-yellow-700/20 border-l-4 border-yellow-700 pl-2';
                              smellTypeColor = 'bg-yellow-700/80 text-white';
                              smellTypeName = 'Raw Types';
                              break;
                            case 'design.circular-dependencies':
                              lineClass = 'bg-pink-700/20 border-l-4 border-pink-700 pl-2';
                              smellTypeColor = 'bg-pink-700/80 text-white';
                              smellTypeName = 'Circular Dependencies';
                              break;
                            case 'design.long-line':
                              lineClass = 'bg-gray-700/20 border-l-4 border-gray-700 pl-2';
                              smellTypeColor = 'bg-gray-700/80 text-white';
                              smellTypeName = 'Long Line';
                              break;
                            case 'design.string-concatenation':
                              lineClass = 'bg-teal-700/20 border-l-4 border-teal-700 pl-2';
                              smellTypeColor = 'bg-teal-700/80 text-white';
                              smellTypeName = 'String Concatenation';
                              break;
                            case 'design.generic-exception':
                              lineClass = 'bg-red-500/20 border-l-4 border-red-500 pl-2';
                              smellTypeColor = 'bg-red-500/80 text-white';
                              smellTypeName = 'Generic Exception';
                              break;
                            case 'design.single-letter-vars':
                              lineClass = 'bg-indigo-700/20 border-l-4 border-indigo-700 pl-2';
                              smellTypeColor = 'bg-indigo-700/80 text-white';
                              smellTypeName = 'Single Letter Variables';
                              break;
                            case 'design.hardcoded-credentials':
                              lineClass = 'bg-black/20 border-l-4 border-black pl-2';
                              smellTypeColor = 'bg-black/80 text-white';
                              smellTypeName = 'Hardcoded Credentials';
                              break;
                            default:
                              lineClass = 'bg-slate-500/20 border-l-4 border-slate-500 pl-2';
                              smellTypeColor = 'bg-slate-500/80 text-white';
                              smellTypeName = 'Code Smell';
                          }
                        }
                        
                        return (
                          <div key={index} className={`flex group hover:bg-slate-800/30 transition-colors ${lineClass}`}>
                            <span className="text-slate-500 w-12 text-right mr-4 select-none">
                              {lineNumber}
                            </span>
                            <span className="flex-1">
                              {line || '\u00A0'}
                            </span>
                            {/* Only show badge on the first line of each code smell */}
                            {isFirstLineOfSmell && (
                              <div className="ml-2 flex items-center space-x-2">
                                <span 
                                  className={`text-xs px-2 py-1 rounded font-medium ${smellTypeColor}`}
                                  title={`${smellTypeName}: ${codeSmell.summary || codeSmell.description || 'Code smell detected'} (Lines ${codeSmell.startLine}-${codeSmell.endLine})`}
                                >
                                  {smellTypeName}
                                </span>
                                <span className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-300">
                                {codeSmell.severity}
                              </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </pre>
                  </div>
                </div>
                
                {/* Code Smells Sidebar */}
                <div className="w-80 bg-slate-700 border-l border-slate-600 overflow-y-auto p-4">
                  <h3 className="text-white font-semibold mb-4">Code Smells ({fileCodeSmells.length})</h3>
                  {fileCodeSmells.length > 0 ? (
                    <div className="space-y-3">
                      {fileCodeSmells.map((smell, index) => {
                        // Get color based on smell type
                        const getSmellTypeColor = (detectorId: string) => {
                          switch (detectorId) {
                            case 'design.long-method':
                              return 'bg-red-500/80 text-white';
                            case 'design.god-class':
                              return 'bg-purple-500/80 text-white';
                            case 'design.duplicate-code':
                              return 'bg-orange-500/80 text-white';
                            case 'design.complex-method':
                              return 'bg-yellow-500/80 text-white';
                            case 'design.long-parameter-list':
                              return 'bg-pink-500/80 text-white';
                            case 'design.feature-envy':
                              return 'bg-cyan-500/80 text-white';
                            case 'design.data-clumps':
                              return 'bg-teal-500/80 text-white';
                            case 'design.primitive-obsession':
                              return 'bg-indigo-500/80 text-white';
                            case 'design.switch-statements':
                              return 'bg-rose-500/80 text-white';
                            case 'design.temporary-field':
                              return 'bg-emerald-500/80 text-white';
                            case 'design.lazy-class':
                              return 'bg-violet-500/80 text-white';
                            case 'design.middle-man':
                              return 'bg-amber-500/80 text-white';
                            case 'design.speculative-generality':
                              return 'bg-sky-500/80 text-white';
                            case 'design.message-chains':
                              return 'bg-lime-500/80 text-white';
                            case 'design.inappropriate-intimacy':
                              return 'bg-red-600/80 text-white';
                            case 'design.shotgun-surgery':
                              return 'bg-orange-600/80 text-white';
                            case 'design.divergent-change':
                              return 'bg-fuchsia-500/80 text-white';
                            case 'design.parallel-inheritance':
                              return 'bg-blue-500/80 text-white';
                            case 'design.excessive-comments':
                              return 'bg-gray-500/80 text-white';
                            case 'design.dead-code':
                              return 'bg-red-800/80 text-white';
                            case 'design.large-class':
                              return 'bg-purple-600/80 text-white';
                            case 'design.data-class':
                              return 'bg-green-600/80 text-white';
                            case 'design.magic-numbers':
                              return 'bg-yellow-600/80 text-white';
                            case 'design.string-constants':
                              return 'bg-teal-600/80 text-white';
                            case 'design.inconsistent-naming':
                              return 'bg-pink-600/80 text-white';
                            case 'design.nested-conditionals':
                              return 'bg-indigo-600/80 text-white';
                            case 'design.flag-arguments':
                              return 'bg-orange-500/80 text-white';
                            case 'design.try-catch-hell':
                              return 'bg-red-700/80 text-white';
                            case 'design.null-abuse':
                              return 'bg-gray-600/80 text-white';
                            case 'design.type-embedded-name':
                              return 'bg-cyan-600/80 text-white';
                            case 'design.refused-bequest':
                              return 'bg-purple-700/80 text-white';
                            case 'design.empty-catch-block':
                              return 'bg-red-900/80 text-white';
                            case 'design.resource-leak':
                              return 'bg-orange-700/80 text-white';
                            case 'design.raw-types':
                              return 'bg-yellow-700/80 text-white';
                            case 'design.circular-dependencies':
                              return 'bg-pink-700/80 text-white';
                            case 'design.long-line':
                              return 'bg-gray-700/80 text-white';
                            case 'design.string-concatenation':
                              return 'bg-teal-700/80 text-white';
                            case 'design.generic-exception':
                              return 'bg-red-500/80 text-white';
                            case 'design.single-letter-vars':
                              return 'bg-indigo-700/80 text-white';
                            case 'design.hardcoded-credentials':
                              return 'bg-black/80 text-white';
                            default:
                              return 'bg-slate-500/80 text-white';
                          }
                        };

                        const getSmellTypeName = (detectorId: string) => {
                          switch (detectorId) {
                            case 'design.long-method':
                              return 'Long Method';
                            case 'design.god-class':
                              return 'God Class';
                            case 'design.duplicate-code':
                              return 'Duplicate Code';
                            case 'design.complex-method':
                              return 'Complex Method';
                            case 'design.long-parameter-list':
                              return 'Long Parameter List';
                            case 'design.feature-envy':
                              return 'Feature Envy';
                            case 'design.data-clumps':
                              return 'Data Clumps';
                            case 'design.primitive-obsession':
                              return 'Primitive Obsession';
                            case 'design.switch-statements':
                              return 'Switch Statements';
                            case 'design.temporary-field':
                              return 'Temporary Field';
                            case 'design.lazy-class':
                              return 'Lazy Class';
                            case 'design.middle-man':
                              return 'Middle Man';
                            case 'design.speculative-generality':
                              return 'Speculative Generality';
                            case 'design.message-chains':
                              return 'Message Chains';
                            case 'design.inappropriate-intimacy':
                              return 'Inappropriate Intimacy';
                            case 'design.shotgun-surgery':
                              return 'Shotgun Surgery';
                            case 'design.divergent-change':
                              return 'Divergent Change';
                            case 'design.parallel-inheritance':
                              return 'Parallel Inheritance';
                            case 'design.excessive-comments':
                              return 'Excessive Comments';
                            case 'design.dead-code':
                              return 'Dead Code';
                            case 'design.large-class':
                              return 'Large Class';
                            case 'design.data-class':
                              return 'Data Class';
                            case 'design.magic-numbers':
                              return 'Magic Numbers';
                            case 'design.string-constants':
                              return 'String Constants';
                            case 'design.inconsistent-naming':
                              return 'Inconsistent Naming';
                            case 'design.nested-conditionals':
                              return 'Nested Conditionals';
                            case 'design.flag-arguments':
                              return 'Flag Arguments';
                            case 'design.try-catch-hell':
                              return 'Try-Catch Hell';
                            case 'design.null-abuse':
                              return 'Null Abuse';
                            case 'design.type-embedded-name':
                              return 'Type Embedded Name';
                            case 'design.refused-bequest':
                              return 'Refused Bequest';
                            case 'design.empty-catch-block':
                              return 'Empty Catch Block';
                            case 'design.resource-leak':
                              return 'Resource Leak';
                            case 'design.raw-types':
                              return 'Raw Types';
                            case 'design.circular-dependencies':
                              return 'Circular Dependencies';
                            case 'design.long-line':
                              return 'Long Line';
                            case 'design.string-concatenation':
                              return 'String Concatenation';
                            case 'design.generic-exception':
                              return 'Generic Exception';
                            case 'design.single-letter-vars':
                              return 'Single Letter Variables';
                            case 'design.hardcoded-credentials':
                              return 'Hardcoded Credentials';
                            default:
                              return 'Code Smell';
                          }
                        };

                        return (
                        <div key={index} className="bg-slate-600 rounded-lg p-3">
                          <div className="flex items-center space-x-2 mb-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getSmellTypeColor(smell.detectorId)}`}>
                                {getSmellTypeName(smell.detectorId)}
                              </span>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              smell.severity === 'CRITICAL' ? 'text-red-400 bg-red-500/20' :
                              smell.severity === 'MAJOR' ? 'text-orange-400 bg-orange-500/20' :
                              smell.severity === 'MINOR' ? 'text-yellow-400 bg-yellow-500/20' :
                              'text-slate-400 bg-slate-500/20'
                            }`}>
                              {smell.severity}
                            </span>
                          </div>
                          <p className="text-slate-300 text-xs mb-2">{smell.description}</p>
                          <p className="text-slate-400 text-xs">Lines: {smell.startLine}-{smell.endLine}</p>
                        </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-slate-400 text-sm">No code smells detected</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </ErrorBoundary>
      )}

      {showFileResearchReport && !REFINE_DEMO && currentPreviewFile && workspaceId && (
        <FileResearchReportModal
          workspaceId={workspaceId}
          filePath={currentPreviewFile.relativePath}
          fileName={currentPreviewFile.name}
          fileActivity={fileProgress[currentPreviewFile.relativePath] ?? null}
          codeSmells={fileCodeSmells}
          onClose={() => setShowFileResearchReport(false)}
        />
      )}

      {showExcelExportModal && workspaceId && (
        <ProjectRefactoringExcelExportModal
          workspaceId={workspaceId}
          projectName={workspaceId}
          onClose={() => setShowExcelExportModal(false)}
          onSaved={bumpExcelExportsRefresh}
        />
      )}

      {showCrossProjectExcelModal && (workspaceId || currentUserId) && (
        <CrossProjectExcelExportModal
          userId={currentUserId ?? undefined}
          storageWorkspaceId={workspaceId ?? ''}
          onClose={() => setShowCrossProjectExcelModal(false)}
          onSaved={bumpExcelExportsRefresh}
        />
      )}
      </div>
    </div>
  );
}
