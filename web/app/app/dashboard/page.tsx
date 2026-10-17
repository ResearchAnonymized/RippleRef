'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, GitBranch, Folder, File, Search, Filter, Eye, Download, BarChart3, Code, TestTube, Settings, Database, FileText, AlertTriangle, CheckCircle, Clock, Users, Zap, Shield, TrendingUp, Play, RefreshCw, Plus } from 'lucide-react';
import JSZip from 'jszip';
import BrandLogo, { BrandName } from '../components/BrandLogo';
import { apiClient, ApiError, type Workspace, type Assessment, type Plan, type FileInfo } from '../api/client';
import { cachedApiClient } from '../api/cachedClient';
import { cacheUtils } from '../utils/cache';
import FileViewer from '../components/FileViewer';
import ImprovedDashboard from '../components/ImprovedDashboard';
import { DashboardSkeleton } from '../components/SkeletonLoader';
import RefactoringOperations from '../components/RefactoringOperations';
// SecurityAnalysisDashboard removed from navigation (file preserved for backup)
// import SecurityAnalysisDashboard from '../components/SecurityAnalysisDashboard';
import GitHubCloneInterface from '../components/GitHubCloneInterface';
import ProjectHub, { projectHubUtils } from '../components/ProjectHub';
import UserProfileSelector, { type UserProfile } from '../components/UserProfileSelector';
import { uploadWorkflowAlert } from '../lib/uploadWorkflowAlert';
import { formatBatchUploadSummary, uploadProjectArchives } from '../lib/uploadProjects';

interface Finding {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'major' | 'minor';
  file: string;
  line: number;
  category: string;
}

type TabType = 'overview' | 'findings' | 'transforms' | 'files' | 'analysis' | 'security' | 'refactoring' | 'projects';

async function loadWorkspacesForUser(userId?: string): Promise<Workspace[]> {
  if (userId) {
    const profiles = await apiClient.listProjectProfiles(userId);
    return profiles.map((p) => ({
      id: p.id,
      name: p.name,
      sourceFiles: p.sourceFiles,
      testFiles: p.testFiles,
      createdAt: p.createdAt,
    }));
  }
  return apiClient.listWorkspaces();
}

function readCachedProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  const id = localStorage.getItem('refactai-user-id')?.trim();
  const name = localStorage.getItem('refactai-user-name')?.trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    role: 'developer',
    email: null,
    createdAt: 0,
    lastActiveAt: Date.now(),
    projectsCount: 0,
    refactoringsCount: 0,
  };
}

export default function DashboardPage() {
  const router = useRouter();
  /** Avoid hydration mismatch: server must not read localStorage before mount. */
  const [clientReady, setClientReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [restoringSession, setRestoringSession] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('analysis');
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [fileSearchTerm, setFileSearchTerm] = useState('');
  const [workspaceListLoading, setWorkspaceListLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState<string>('Ready');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showFileViewer, setShowFileViewer] = useState(false);
  const [fileContent, setFileContent] = useState<string>('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [openNewProjectTick, setOpenNewProjectTick] = useState(0);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneBranch, setCloneBranch] = useState('main');

  useEffect(() => {
    setClientReady(true);
    const cached = readCachedProfile();
    if (cached) setCurrentUser(cached);
  }, []);

  // ?reset-profile=1 — escape hatch when session is stale (works even if UI is stuck)
  useEffect(() => {
    if (!clientReady) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset-profile') === '1' || params.get('guest') === '1') {
      localStorage.removeItem('refactai-user-id');
      localStorage.removeItem('refactai-user-name');
      setCurrentUser(null);
      setRestoringSession(false);
      params.delete('reset-profile');
      params.delete('guest');
      const qs = params.toString();
      window.history.replaceState({}, '', qs ? `/dashboard?${qs}` : '/dashboard');
    }
  }, [clientReady]);

  // Validate cached profile in background (never block the page)
  useEffect(() => {
    if (!clientReady) return;
    const storedId = localStorage.getItem('refactai-user-id')?.trim();
    if (!storedId) {
      setRestoringSession(false);
      return;
    }
    setRestoringSession(true);

    let cancelled = false;
    const ac = new AbortController();
    const abortTimer = window.setTimeout(() => ac.abort(), 3000);

    apiClient
      .getUser(storedId, { signal: ac.signal })
      .then((user) => {
        if (cancelled) return;
        setCurrentUser(user);
        localStorage.setItem('refactai-user-name', user.name);
      })
      .catch((err) => {
        if (cancelled) return;
        // Only drop session when the profile truly does not exist — not when the API is down.
        if (err instanceof ApiError && err.status === 404) {
          localStorage.removeItem('refactai-user-id');
          localStorage.removeItem('refactai-user-name');
          setCurrentUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setRestoringSession(false);
        window.clearTimeout(abortTimer);
      });

    return () => {
      cancelled = true;
      ac.abort();
      window.clearTimeout(abortTimer);
    };
  }, [clientReady]);

  // After login, restore last workspace or the only project so the dashboard is usable immediately
  useEffect(() => {
    if (!currentUser || currentWorkspace) return;
    if (workspaces.length === 0) return;
    const lastId = typeof window !== 'undefined' ? localStorage.getItem('refactai-last-workspace-id') : null;
    const pick =
      (lastId && workspaces.find((w) => w.id === lastId)) ||
      (workspaces.length === 1 ? workspaces[0] : undefined);
    if (!pick) return;
    setCurrentWorkspace(pick);
    loadWorkspaceData(pick).catch((e) => console.error('Auto-load workspace failed:', e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, workspaces.length, currentWorkspace?.id]);

  // Keep `file.codeSmells` as the static detector count only (same as /workspace-enhanced-analysis).
  // Do not substitute assessment evidence counts — that produced list vs Analyze mismatches.
  const enhanceFilesWithCodeSmells = async (files: FileInfo[], workspaceId: string, _assessmentData?: Assessment | null): Promise<FileInfo[]> => {
    console.log('Enhancing files with code smell data...');
    
    const enhancedFiles = files.map((file) => {
      if (!file.name.endsWith('.java')) {
        return file;
      }

      const backendCount = typeof (file as any).codeSmells === 'number' ? (file as any).codeSmells : null;
      return {
        ...file,
        ...(backendCount !== null && backendCount >= 0 ? { codeSmells: backendCount } : {}),
      } as FileInfo;
    });
    
    console.log('File enhancement completed');
    return enhancedFiles;
  };

  // Helper function to create ZIP from files
  const createZipFromFiles = async (files: File[]): Promise<File> => {
    const zip = new JSZip();
    
    // Add all files to the ZIP
    for (const file of files) {
      const content = await file.arrayBuffer();
      zip.file(file.name, content);
    }
    
    // Generate the ZIP file
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    // Create a File-like object
    const file = Object.assign(zipBlob, {
      name: 'project.zip',
      lastModified: Date.now()
    });
    return file as File;
  };

  // Load workspace list in background — never block the whole dashboard on assessment/plan.
  useEffect(() => {
    let cancelled = false;

    const initializeDashboard = async () => {
      setWorkspaceListLoading(true);
      try {
        console.log('Initializing dashboard (non-blocking)...');
        cacheUtils.clear();

        const params = new URLSearchParams(window.location.search);
        const resumeId = params.get('workspace');

        const existing = await Promise.race([
          loadWorkspacesForUser(currentUser?.id),
          new Promise<Workspace[]>((_, reject) =>
            setTimeout(() => reject(new Error('listWorkspaces timeout after 25s')), 25_000)
          ),
        ]);
        if (cancelled) return;
        setWorkspaces(existing);

        if (resumeId) {
          const found = existing.find((w) => w.id === resumeId);
          if (found) {
            console.log('Auto-resuming project', resumeId);
            setCurrentWorkspace(found);
            try {
              const ws = await apiClient.getWorkspace(resumeId);
              if (cancelled) return;
              setCurrentWorkspace(ws);
              setActiveTab('analysis');
              // Heavy work runs in background so the UI is never stuck at 0% on the splash screen.
              void loadWorkspaceData(ws).catch((e) => console.error('loadWorkspaceData:', e));
            } catch (e) {
              console.error('Failed to resume workspace:', e);
            }
          }
        }
      } catch (error) {
        console.error('Failed to initialize dashboard:', error);
        if (!cancelled) {
          setCurrentWorkspace(null);
          setWorkspaces([]);
          setFiles([]);
          setAssessment(null);
          setPlan(null);
        }
      } finally {
        if (!cancelled) {
          setWorkspaceListLoading(false);
        }
      }
    };

    void initializeDashboard();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh project list when user profile is known.
  useEffect(() => {
    if (!clientReady) return;
    let cancelled = false;
    void loadWorkspacesForUser(currentUser?.id)
      .then((list) => {
        if (!cancelled) setWorkspaces(list);
      })
      .catch((e) => console.warn('Failed to load user workspaces', e));
    return () => {
      cancelled = true;
    };
  }, [clientReady, currentUser?.id]);

  const loadWorkspaces = async () => {
    try {
      setLoadingStep('Loading workspaces...');
      setLoadingProgress(20);
      
      console.log('Loading workspaces...');
      const workspaceList = await loadWorkspacesForUser(currentUser?.id);
      console.log('Loaded workspaces:', workspaceList);
      setWorkspaces(workspaceList);
      setLoadingProgress(40);
      
      if (workspaceList.length === 0) {
        console.log('No workspaces found - starting with clean state');
        setCurrentWorkspace(null);
        setFiles([]);
        setAssessment(null);
        setPlan(null);
        setLoadingStep('No projects found - ready to upload');
        setLoadingProgress(100);
      } else {
        // Use the first workspace if available
        const workspace = workspaceList[0];
        setCurrentWorkspace(workspace);
        setLoadingStep('Loading project data...');
        setLoadingProgress(60);
        await loadWorkspaceData(workspace);
        setLoadingStep('Dashboard ready');
        setLoadingProgress(100);
      }
    } catch (error) {
      console.error('Failed to load workspaces:', error);
      console.error('Error details:', error);
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setLoadingStep('Error loading dashboard');
      setLoadingProgress(0);
    }
  };

  const loadWorkspaceData = async (workspace: Workspace) => {
    try {
      console.log('Loading workspace data for:', workspace.id);
      
      setLoadingStep('Loading project data...');
      setLoadingProgress(70);

      let javaSourceCount = workspace.sourceFiles ?? 0;
      try {
        const summary = await apiClient.getWorkspaceFileSummary(workspace.id);
        javaSourceCount = summary.sourceFiles ?? javaSourceCount;
      } catch {
        /* use workspace metadata */
      }

      // Load cached files, assessment, and plan first — skip re-analysis when already on disk.
      const [fileList, assessmentData, planData] = await Promise.allSettled([
        apiClient.getWorkspaceFiles(workspace.id, true),
        apiClient.getAssessment(workspace.id).catch(() => null),
        apiClient.getPlan(workspace.id).catch(() => null)
      ]);

      const hasCachedAssessment =
        assessmentData.status === 'fulfilled' && assessmentData.value != null;

      if (hasCachedAssessment) {
        console.log('Using saved assessment — PMD counts load from disk when available');
      }

      // Bulk PMD is started manually per project (Projects → Run PMD).

      // Process results
      if (fileList.status === 'fulfilled') {
        console.log('Loaded files:', fileList.value.length);
        const assessmentValue = assessmentData.status === 'fulfilled' ? assessmentData.value : null;
        const filesWithCodeSmells = await enhanceFilesWithCodeSmells(fileList.value, workspace.id, assessmentValue);
        setFiles(filesWithCodeSmells);
      }

      let resolvedAssessment: Assessment | null = null;
      let resolvedPlan: Plan | null = null;

      if (assessmentData.status === 'fulfilled' && assessmentData.value) {
        console.log('Assessment data loaded:', assessmentData.value);
        console.log('Assessment evidences count:', assessmentData.value.evidences?.length || 0);
        resolvedAssessment = assessmentData.value;
        setAssessment(assessmentData.value);
      } else {
        const javaCount = fileList.status === 'fulfilled'
          ? fileList.value.filter((f) => f.name?.endsWith('.java')).length
          : 0;
        // Skip blocking whole-project assessment on very large trees (PMD already ran above).
        if (javaCount > 800) {
          console.log(`Skipping auto-assessment (${javaCount} Java files). PMD counts are on the file list.`);
          setAssessment(null);
        } else {
          console.log('No cached assessment found — running analysis automatically...');
          setLoadingStep('Analyzing code quality (first load)...');
          try {
            resolvedAssessment = await apiClient.assessProject(workspace.id);
            console.log('Auto-assessment complete:', resolvedAssessment?.evidences?.length || 0, 'evidences');
            setAssessment(resolvedAssessment);
            if (fileList.status === 'fulfilled') {
              const enhanced = await enhanceFilesWithCodeSmells(fileList.value, workspace.id, resolvedAssessment);
              setFiles(enhanced);
            }
          } catch (assessErr) {
            console.warn('Auto-assessment failed:', assessErr);
            setAssessment(null);
          }
        }
      }

      if (planData.status === 'fulfilled' && planData.value) {
        resolvedPlan = planData.value;
        setPlan(planData.value);
      } else if (resolvedAssessment) {
        // Also auto-generate plan if assessment succeeded
        console.log('No cached plan — generating automatically...');
        setLoadingStep('Generating refactoring plan...');
        try {
          resolvedPlan = await apiClient.generatePlan(workspace.id);
          setPlan(resolvedPlan);
        } catch (planErr) {
          console.warn('Auto-plan generation failed:', planErr);
          setPlan(null);
        }
      } else {
        setPlan(null);
      }

      setLoadingProgress(100);

    } catch (error) {
      console.error('Failed to load workspace data:', error);
      setLoadingStep('Error loading project data');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setLoadingStep('Preparing files...');
    setLoadingProgress(10);
    
    try {
      // Clear cache before uploading to ensure fresh data
      cacheUtils.clear();
      cachedApiClient.clearCache();

      setLoadingStep('Creating project archive...');
      setLoadingProgress(20);
      let zipFile: File;
      try {
        zipFile = await createZipFromFiles(Array.from(files));
      } catch (error) {
        console.error('ZIP creation failed:', error);
        alert(uploadWorkflowAlert('Creating ZIP archive', error));
        return;
      }

      setLoadingStep('Uploading project...');
      setLoadingProgress(30);
      let workspace: Workspace;
      try {
        workspace = await apiClient.uploadProject(zipFile, currentUser?.id, currentUser?.name);
      } catch (error) {
        console.error('Upload POST failed:', error);
        alert(uploadWorkflowAlert('Uploading archive to server', error));
        return;
      }
      console.log('Uploaded workspace:', workspace.id);

      window.dispatchEvent(new Event('refactai-reload-projects'));
      setLoadingStep('Finalizing dashboard...');
      setLoadingProgress(95);
      setCurrentWorkspace(workspace);
      await loadWorkspaceData(workspace);
      setLoadingStep('Upload complete!');
      setLoadingProgress(100);
    } catch (error) {
      console.error('Unexpected upload workflow error:', error);
      setLoadingStep('Upload failed');
      setLoadingProgress(0);
      alert(uploadWorkflowAlert('Project setup', error));
    } finally {
      setIsUploading(false);
      // Reset loading states immediately
      setLoadingStep('Ready');
      setLoadingProgress(0);
    }
  };

  const handleGitClone = () => {
    setShowCloneDialog(true);
  };

  const confirmGitClone = async () => {
    if (!cloneUrl.trim()) {
      alert('Please enter a repository URL');
      return;
    }

    setShowCloneDialog(false);
    setIsUploading(true);
    setLoadingStep('Cloning repository...');
    setLoadingProgress(20);
    
    try {
      // Clear cache before cloning to ensure fresh data
      cacheUtils.clear();
      cachedApiClient.clearCache();
      
      setLoadingStep('Downloading repository...');
      setLoadingProgress(40);
      const workspace = await apiClient.cloneGitRepository(cloneUrl, cloneBranch, currentUser?.id, currentUser?.name);
      
      setLoadingStep('Analyzing repository...');
      setLoadingProgress(70);
      setCurrentWorkspace(workspace);
      await loadWorkspaceData(workspace);
      
      setLoadingStep('Repository ready!');
      setLoadingProgress(100);
    } catch (error) {
      console.error('Failed to clone repository:', error);
      setLoadingStep('Clone failed');
      setLoadingProgress(0);
      alert('Failed to clone repository. Please check the URL and try again.');
    } finally {
      setIsUploading(false);
      // Reset loading states immediately
      setLoadingStep('Ready');
      setLoadingProgress(0);
    }
  };

  const cancelGitClone = () => {
    setShowCloneDialog(false);
    setCloneUrl('');
    setCloneBranch('main');
  };

  const startAnalysis = async () => {
    if (!currentWorkspace) return;
    await startAnalysisWithWorkspace(currentWorkspace);
  };

  const startAnalysisWithWorkspace = async (workspace: any) => {
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setLoadingStep('Starting analysis...');

    try {
      // Step 1: Assessment
      setLoadingStep('Analyzing code quality...');
      setAnalysisProgress(20);
      await apiClient.assessProject(workspace.id);
      
      // Step 2: Plan Generation
      setLoadingStep('Generating refactoring plan...');
      setAnalysisProgress(60);
      await apiClient.generatePlan(workspace.id);
      
      // Step 3: Reload data
      setLoadingStep('Loading analysis results...');
      setAnalysisProgress(80);
      await loadWorkspaceData(workspace);
      
      setLoadingStep('Analysis complete!');
      setAnalysisProgress(100);
      
      // Show success message briefly
      setTimeout(() => {
        setLoadingStep('Ready');
        setAnalysisProgress(0);
      }, 1000);
      
    } catch (error) {
      console.error('Analysis failed:', error);
      setLoadingStep('Analysis failed');
      setAnalysisProgress(0);
      alert('Analysis failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const openAddNewProject = () => {
    setOpenNewProjectTick((t) => t + 1);
  };

  /** Dangerous: wipe every workspace on this server — only from Settings, not when adding a project. */
  const requestClearAllProjects = () => {
    setShowClearConfirm(true);
  };

  const confirmClearProject = async () => {
    try {
      // Clear all current project data
      setCurrentWorkspace(null);
      setAssessment(null);
      setPlan(null);
      setFiles([]);
      setSelectedFile(null);
      setFileContent('');
      setShowFileViewer(false);
      setActiveTab('overview');
      setFileSearchTerm('');
      setAnalysisProgress(0);
      setLoadingStep('Clearing all data...');
      setLoadingProgress(0);
      
      // Clear cache
      cacheUtils.clear();
      cachedApiClient.clearCache();
      
      // Clear backend workspaces
      try {
        await apiClient.clearAllWorkspaces();
        console.log('All backend workspaces cleared');
      } catch (error) {
        console.warn('Failed to clear backend workspaces:', error);
        // Continue anyway - cache is cleared
      }
      
      // Clear any localStorage data
      if (typeof window !== 'undefined') {
        localStorage.removeItem('refactai-cache');
      }
      
      setLoadingStep('Ready to upload new project');
      setLoadingProgress(100);
    } catch (error) {
      console.error('Error clearing project:', error);
    } finally {
      // Reset to initial state
      setIsUploading(false);
      setIsAnalyzing(false);
      
      // Close confirmation dialog
      setShowClearConfirm(false);
    }
  };

  const cancelClearProject = () => {
    setShowClearConfirm(false);
  };

  const handleFileClick = (file: FileInfo) => {
      setSelectedFile(file);
      setShowFileViewer(true);
  };

  const closeFileViewer = () => {
    setShowFileViewer(false);
    setSelectedFile(null);
    setFileContent('');
  };

  if (!clientReady) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-slate-400" aria-hidden />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <UserProfileSelector
        restoringSession={restoringSession}
        onProfileSelected={(profile) => {
          setCurrentUser(profile);
          setRestoringSession(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Compact Header — user info is in ImprovedDashboard sidebar now */}
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-700/50 shadow-xl">
        <div className="max-w-[1920px] mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-3">
                <BrandLogo size={36} />
                <div>
                  <h1 className="text-2xl font-black text-white tracking-tight">{BrandName}</h1>
                </div>
              </div>
              {currentWorkspace && (
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                  <span className="text-white font-medium bg-slate-700 px-2.5 py-1 rounded-full text-xs">{currentWorkspace.name}</span>
                </div>
              )}
            </div>
            <div className="flex items-center space-x-3">
              {/* Current user + Sign Out */}
              <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
                <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                  <Users className="w-3 h-3 text-indigo-400" />
                </div>
                <span className="text-white text-sm font-medium">{currentUser.name}</span>
                <span className="text-slate-500 text-xs">({currentUser.role})</span>
              </div>
              <button
                onClick={() => {
                  localStorage.removeItem('refactai-user-id');
                  localStorage.removeItem('refactai-user-name');
                  setCurrentUser(null);
                  setCurrentWorkspace(null);
                  setAssessment(null);
                  setPlan(null);
                  setFiles([]);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/10 border border-red-500/30 text-red-400 hover:bg-red-600 hover:text-white rounded-lg text-sm font-medium transition-colors"
                title="Sign out"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Sign Out
              </button>
              <button
                onClick={openAddNewProject}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl transition-all duration-200 font-semibold shadow-lg hover:shadow-xl flex items-center border border-blue-500/50 transform hover:scale-105"
                title="Add another project — existing projects are kept"
              >
                <Plus className="w-5 h-5 mr-3" />
                Add New Project
              </button>
              <button
                onClick={requestClearAllProjects}
                className="bg-gradient-to-r from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500 text-white px-6 py-3 rounded-xl transition-all duration-200 font-semibold shadow-lg hover:shadow-xl flex items-center border border-slate-600"
                title="Advanced: delete all projects on this server"
              >
                <Settings className="w-5 h-5 mr-3" />
                Settings
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content — always show ImprovedDashboard, which has Project Hub + all features */}
      <div className="relative h-[calc(100vh-60px)]">
        {workspaceListLoading && (
          <div className="absolute inset-x-0 top-0 z-40 flex items-center justify-center gap-2 border-b border-blue-500/30 bg-blue-950/90 py-2.5 text-sm text-blue-100 shadow-lg">
            <RefreshCw className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
            <span>Loading project list from the server…</span>
          </div>
        )}
        {/* Upload overlay when actively uploading */}
        {isUploading && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-8 max-w-md w-full mx-4">
              <div className="text-center">
                <RefreshCw className="w-10 h-10 text-blue-400 animate-spin mx-auto mb-4" />
                <h3 className="text-lg font-bold text-white mb-2">Processing Project</h3>
                <p className="text-slate-400 text-sm mb-4">{loadingStep}</p>
                <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${loadingProgress}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* OLD upload section below — kept for reference but no longer rendered as primary view */}
        {false && !currentWorkspace && (
          <div className="hidden">
            
            {/* Upload Progress */}
            {isUploading && (
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-8 mb-8 max-w-2xl mx-auto">
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4">Processing Project</h3>
                  <p className="text-slate-300 mb-6">{loadingStep}</p>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-slate-700 rounded-full h-4 mb-4 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-blue-500 to-purple-600 h-4 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${loadingProgress}%` }}
                    />
                  </div>
                  
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>Progress</span>
                    <span>{Math.round(loadingProgress)}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* Upload Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {/* File Upload */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-8 hover:border-blue-500/50 transition-all duration-300 group">
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-blue-500/30 transition-colors">
                    <Upload className="w-8 h-8 text-blue-400" />
                </div>
                  <h3 className="text-2xl font-bold text-white mb-4">Upload Project</h3>
                  <p className="text-slate-400 mb-6 leading-relaxed">
                    Select Java files, JAR archives, or entire project folders. We support Maven, Gradle, and plain Java projects.
                  </p>
                  <label className="inline-block">
                <input
                  type="file"
                      accept=".zip,.jar,.java"
                      multiple
                  className="hidden"
                      onChange={handleFileUpload}
                      disabled={isUploading}
                    />
                    <span className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-8 py-4 rounded-xl font-semibold transition-all duration-200 cursor-pointer shadow-lg hover:shadow-xl transform hover:scale-105 inline-flex items-center">
                      <Upload size={20} className="mr-3" />
                      {isUploading ? loadingStep : 'Select Project File'}
                    </span>
                </label>
                </div>
              </div>

              {/* Git Clone */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-8 hover:border-emerald-500/50 transition-all duration-300 group">
                <div className="text-center">
                  <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-emerald-500/30 transition-colors">
                    <GitBranch className="w-8 h-8 text-emerald-400" />
                </div>
                  <h3 className="text-2xl font-bold text-white mb-4">Clone Repository</h3>
                  <p className="text-slate-400 mb-6 leading-relaxed">
                    Import directly from GitHub, GitLab, or any Git repository. We'll clone and analyze your project automatically.
                  </p>
                  <button
                    onClick={handleGitClone}
                    disabled={isUploading}
                    className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-8 py-4 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 inline-flex items-center"
                  >
                    <GitBranch size={24} className="mr-3" />
                    {isUploading ? loadingStep : 'Clone & Analyze'}
                  </button>
                </div>
              </div>
            </div>
            
            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50 text-center">
                <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-6 h-6 text-blue-400" />
                </div>
                <h4 className="text-lg font-semibold text-white mb-2">Smart Detection</h4>
                <p className="text-slate-400 text-sm">AI-powered code smell detection with 95% accuracy</p>
              </div>
              
              <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50 text-center">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-6 h-6 text-emerald-400" />
                </div>
                <h4 className="text-lg font-semibold text-white mb-2">Fast Analysis</h4>
                <p className="text-slate-400 text-sm">Analyze large codebases in seconds, not hours</p>
              </div>
              
              <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50 text-center">
                <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-6 h-6 text-purple-400" />
                </div>
                <h4 className="text-lg font-semibold text-white mb-2">Safe Refactoring</h4>
                <p className="text-slate-400 text-sm">Risk-free transformations with rollback protection</p>
              </div>
            </div>
            
            <div className="text-center">
              <p className="text-slate-400 text-lg">
                Need help? Check out our <a href="#" className="text-blue-400 hover:text-blue-300 underline font-medium">documentation</a> or <a href="#" className="text-blue-400 hover:text-blue-300 underline font-medium">contact support</a>.
              </p>
            </div>
          </div>
        )}

        {/* Analysis Progress */}
        {isAnalyzing && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-8 mb-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Analyzing Project</h3>
              <p className="text-slate-300 mb-6">
                {analysisProgress < 50 && 'Detecting code smells and analyzing structure...'}
                {analysisProgress >= 50 && analysisProgress < 90 && 'Generating refactoring recommendations...'}
                {analysisProgress >= 90 && 'Finalizing analysis and preparing results...'}
              </p>
              
              {/* Progress Bar */}
              <div className="w-full bg-slate-700 rounded-full h-4 mb-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-purple-600 h-4 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${analysisProgress}%` }}
                />
              </div>
              
              <div className="flex justify-between text-sm text-slate-400">
                <span>Analysis Progress</span>
                <span>{Math.round(analysisProgress)}%</span>
              </div>
            </div>
          </div>
        )}

        {/* "Run Analysis" is available via the bottom bar in ImprovedDashboard */}

        {/* Always show ImprovedDashboard — it has Project Hub + all features */}
        <ImprovedDashboard 
          workspaceId={currentWorkspace?.id || ''}
          workspaceName={currentWorkspace?.name}
          openNewProjectTick={openNewProjectTick}
          assessment={assessment}
          plan={plan}
          files={files}
          setCurrentWorkspace={setCurrentWorkspace}
          onReloadWorkspace={
            currentWorkspace
              ? async () => {
                  cacheUtils.clear();
                  cachedApiClient.clearCache();
                  await loadWorkspaceData(currentWorkspace);
                }
              : undefined
          }
          onProjectResume={async (wsId) => {
            try {
              setIsUploading(true);
              setLoadingStep('Opening project (loading file list)...');
              setLoadingProgress(20);
              const ws = await apiClient.getWorkspace(wsId);
              setCurrentWorkspace(ws);
              try {
                localStorage.setItem('refactai-last-workspace-id', ws.id);
              } catch {
                /* ignore */
              }
              setLoadingProgress(50);
              await loadWorkspaceData(ws);
              setLoadingStep('Project ready');
              setLoadingProgress(100);
            } catch (error) {
              console.error('Failed to resume project:', error);
              alert(
                'Could not open this project. Check that the backend is running (./restart_all.sh) and see the browser console for details.'
              );
            } finally {
              setIsUploading(false);
              setLoadingStep('Ready');
              setLoadingProgress(0);
            }
          }}
          currentUserId={currentUser?.id}
          currentUserName={currentUser?.name}
          onCloneProject={async (gitUrl, branch) => {
            setIsUploading(true);
            setLoadingStep('Cloning repository...');
            setLoadingProgress(20);
            try {
              cacheUtils.clear();
              cachedApiClient.clearCache();
              setLoadingStep('Downloading repository...');
              setLoadingProgress(40);
              const workspace = await apiClient.cloneGitRepository(gitUrl, branch, currentUser?.id, currentUser?.name);
              setLoadingStep('Loading project data...');
              setLoadingProgress(70);
              setCurrentWorkspace(workspace);
              try {
                localStorage.setItem('refactai-last-workspace-id', workspace.id);
              } catch { /* ignore */ }
              await loadWorkspaceData(workspace);
              setLoadingStep('Repository ready!');
              setLoadingProgress(100);
            } catch (error) {
              console.error('Failed to clone repository:', error);
              alert('Failed to clone repository. Please check the URL and try again.');
            } finally {
              setIsUploading(false);
              setLoadingStep('Ready');
              setLoadingProgress(0);
            }
          }}
          onUploadProject={async (files) => {
            if (files.length === 0) return;
            setIsUploading(true);
            setLoadingProgress(5);
            try {
              cacheUtils.clear();
              cachedApiClient.clearCache();
              const result = await uploadProjectArchives(
                files,
                currentUser?.id,
                currentUser?.name,
                (current, total, fileName) => {
                  setLoadingStep(`Uploading ${current}/${total}: ${fileName}`);
                  setLoadingProgress(5 + Math.round((current / total) * 90));
                }
              );
              window.dispatchEvent(new Event('refactai-reload-projects'));
              setLoadingStep('Upload complete!');
              setLoadingProgress(100);
              const summary = formatBatchUploadSummary(result);
              if (summary) alert(summary);
              if (result.succeeded.length === 1 && result.failed.length === 0) {
                setCurrentWorkspace(result.succeeded[0]);
                try {
                  localStorage.setItem('refactai-last-workspace-id', result.succeeded[0].id);
                } catch {
                  /* ignore */
                }
                await loadWorkspaceData(result.succeeded[0]);
              }
            } catch (error) {
              console.error('Unexpected upload workflow error:', error);
              alert(uploadWorkflowAlert('Project upload', error));
            } finally {
              setIsUploading(false);
              setLoadingStep('Ready');
              setLoadingProgress(0);
            }
          }}
        />
      </div>

      {/* File Viewer Modal */}
      {showFileViewer && selectedFile && (
        <FileViewer
          workspaceId={currentWorkspace!.id}
          filePath={selectedFile.relativePath}
          fileName={selectedFile.name}
          onClose={closeFileViewer}
        />
      )}

      {/* Clear Project Confirmation Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md mx-4 shadow-2xl">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mr-4">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Delete All Projects?</h3>
                <p className="text-slate-400 text-sm">This removes every workspace from this server — use only to reset the machine.</p>
              </div>
            </div>
            
            <p className="text-slate-300 mb-8 leading-relaxed">
              This permanently deletes <strong className="text-white">all</strong> projects and cached analysis on this server.
              To add another project while keeping existing ones, click <strong className="text-white">Add New Project</strong> instead.
            </p>
            
            <div className="flex space-x-4">
              <button
                onClick={cancelClearProject}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-200 border border-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={confirmClearProject}
                className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                Clear All & Start Fresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced GitHub Clone Interface */}
      {showCloneDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mr-4">
                  <GitBranch className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Clone Repository</h3>
                  <p className="text-slate-400 text-sm">Import directly from GitHub with real-time progress tracking</p>
                </div>
              </div>
              <button
                onClick={cancelGitClone}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <GitHubCloneInterface 
              workspaceId={currentWorkspace?.id || 'default'}
              onCloneComplete={(workspace) => {
                console.log('Repository cloned, workspace created:', workspace);
                setShowCloneDialog(false);
                
                // Save to Project Hub
                const project = {
                  id: workspace.id,
                  name: workspace.name,
                  description: `Cloned from GitHub`,
                  sourceFiles: workspace.sourceFiles,
                  testFiles: workspace.testFiles,
                  createdAt: workspace.createdAt,
                  repositoryUrl: `https://github.com/${workspace.name}`,
                  status: 'active' as const
                };
                
                projectHubUtils.addProject(project);
                
                console.log('Setting current workspace:', workspace);
                setCurrentWorkspace(workspace);
                setShowCloneDialog(false);
                
                // Show success message
                setLoadingStep('Repository cloned successfully! Starting analysis...');
                setLoadingProgress(10);
                
                // Auto-start analysis after a short delay, using the new workspace
                setTimeout(() => {
                  console.log('Auto-starting analysis for cloned repository with workspace:', workspace.id);
                  // Call startAnalysis with the new workspace
                  startAnalysisWithWorkspace(workspace);
                }, 2000);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
