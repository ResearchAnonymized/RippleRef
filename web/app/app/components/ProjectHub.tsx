'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { apiClient } from '../api/client';

import { isRefineDemo } from '../lib/refineDemoMode';

const ENABLE_RESEARCH_EXPORT_HUB =
  !isRefineDemo() && process.env.NEXT_PUBLIC_ENABLE_RESEARCH_EXPORT_UI === '1';
// RippleREF package: study panels on by default (set NEXT_PUBLIC_ENABLE_RIPPLE_REF_STUDY=0 to hide)
const ENABLE_RIPPLE_REF_STUDY =
  !isRefineDemo() && process.env.NEXT_PUBLIC_ENABLE_RIPPLE_REF_STUDY !== '0';
import {
  FolderOpen,
  Trash2,
  Play,
  Calendar,
  FileText,
  GitBranch,
  Search,
  Filter,
  AlertCircle,
  CheckCircle,
  Upload,
  Plus,
  Clock,
  RefreshCw,
  ExternalLink,
  Pencil,
  Check,
  X,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import {
  buildWorkspaceStudyCsv,
  defaultWorkspaceStudyFilename,
  downloadWorkspaceStudyCsv,
} from '../lib/exportWorkspaceStudyCsv';
import ResearchExportHubSection from './ResearchExportHubSection';
import RippleRefStudyPanel from './RippleRefStudyPanel';
import MaRefStudyPanel from './MaRefStudyPanel';

const CrossProjectExcelExportModal = dynamic(() => import('./CrossProjectExcelExportModal'), {
  ssr: false,
});

const PROGRESS_FETCH_CONCURRENCY = 3;

async function fetchProgressPool(
  profiles: Array<{ id: string }>,
  onProgress: (id: string, progress: ProjectProfile['progress']) => void
): Promise<void> {
  let index = 0;
  const worker = async () => {
    while (index < profiles.length) {
      const i = index++;
      const p = profiles[i];
      try {
        const progress = await apiClient.getProjectProgress(p.id);
        onProgress(p.id, progress);
      } catch {
        /* keep profile row without progress */
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(PROGRESS_FETCH_CONCURRENCY, profiles.length) }, () => worker())
  );
}

interface ProjectProfile {
  id: string;
  name: string;
  repositoryUrl: string | null;
  createdAt: number;
  lastAccessedAt: number;
  sourceFiles: number;
  testFiles: number;
  totalWorkspaceFiles?: number;
  status: string;
  progress?: {
    totalFiles: number;
    pending: number;
    refactored: number;
    rejected: number;
    skipped: number;
    error: number;
    progressPercent: number;
    workspaceFiles?: number;
    javaSourceFiles?: number;
    javaTestFiles?: number;
    analyzed?: number;
    files?: Array<Record<string, unknown>>;
  };
}

export type ProjectHubProject = {
  id: string;
  name: string;
  sourceFiles: number;
  testFiles: number;
  createdAt: number;
  status: string;
};

export type ProjectOpenOptions = {
  view?: 'files' | 'analysis' | 'overview';
  fileStatusFilter?: 'refactored';
  openFirstRefactored?: boolean;
  openExcelExport?: boolean;
};

interface ProjectHubProps {
  onProjectSelect?: (project: ProjectHubProject, options?: ProjectOpenOptions) => void | Promise<void>;
  onProjectDelete?: (projectId: string) => void;
  onProjectAnalyze?: (project: { id: string; name: string }) => void | Promise<void>;
  onCloneProject?: (gitUrl: string, branch: string) => void;
  onUploadProject?: (files: File[]) => void | Promise<void>;
  userId?: string;
  userName?: string;
  /** When parent increments this, open the add-project panel (upload + clone). */
  openNewProjectTick?: number;
}

export default function ProjectHub({
  onProjectSelect,
  onProjectDelete,
  onProjectAnalyze,
  onCloneProject,
  onUploadProject,
  userId,
  userName,
  openNewProjectTick,
}: ProjectHubProps) {
  const [projects, setProjects] = useState<ProjectProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneBranch, setCloneBranch] = useState('main');
  const [cloning, setCloning] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [showCrossProjectExcelModal, setShowCrossProjectExcelModal] = useState(false);
  const [researchArchiveRefreshKey, setResearchArchiveRefreshKey] = useState(0);

  const loadProjects = useCallback(async (opts?: { refreshCounts?: boolean }) => {
    setLoading(true);
    try {
      const profiles = await apiClient.listProjectProfiles(userId, {
        refreshCounts: opts?.refreshCounts,
      });
      const base: ProjectProfile[] = profiles.map((p) => ({ ...p }));
      setProjects(base);
      setLoading(false);

      void fetchProgressPool(profiles, (id, progress) => {
        setProjects((prev) =>
          prev.map((row) => (row.id === id ? { ...row, progress } : row))
        );
      });

      localStorage.setItem('refactai-projects', JSON.stringify(
        base.map(p => ({
          id: p.id, name: p.name, sourceFiles: p.sourceFiles,
          testFiles: p.testFiles, createdAt: p.createdAt,
          repositoryUrl: p.repositoryUrl, status: p.status || 'active',
        }))
      ));
    } catch (err) {
      console.error('Failed to load projects from backend, falling back to localStorage', err);
      try {
        const stored = localStorage.getItem('refactai-projects');
        if (stored) setProjects(JSON.parse(stored));
      } catch { /* ignore */ }
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  useEffect(() => {
    if (!loading && projects.length === 0) {
      setShowNewProject(true);
    }
  }, [loading, projects.length]);

  useEffect(() => {
    if (openNewProjectTick && openNewProjectTick > 0) {
      setShowNewProject(true);
    }
  }, [openNewProjectTick]);

  /** Upload/clone elsewhere may finish while hub stays mounted — refresh list when asked. */
  useEffect(() => {
    const onReload = () => {
      void loadProjects();
    };
    window.addEventListener('refactai-reload-projects', onReload);
    return () => window.removeEventListener('refactai-reload-projects', onReload);
  }, [loadProjects]);

  const deleteProject = async (projectId: string) => {
    try {
      await apiClient.deleteWorkspace(projectId);
    } catch { /* ignore */ }
    setProjects(prev => prev.filter(p => p.id !== projectId));
    setShowDeleteConfirm(null);
    onProjectDelete?.(projectId);
  };

  const formatDate = (ts: number) => {
    if (!ts) return '—';
    const d = new Date(ts);
    const now = Date.now();
    const diffMs = now - ts;
    if (diffMs < 3600000) return `${Math.round(diffMs / 60000)}m ago`;
    if (diffMs < 86400000) return `${Math.round(diffMs / 3600000)}h ago`;
    if (diffMs < 604800000) return `${Math.round(diffMs / 86400000)}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const exportStudyCsv = async (project: ProjectProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const progress = project.progress ?? (await apiClient.getProjectProgress(project.id));
      const iso = new Date().toISOString();
      const csv = buildWorkspaceStudyCsv({
        workspaceId: project.id,
        projectName: project.name,
        exportedAtIso: iso,
        summary: {
          totalFiles: progress.totalFiles,
          analyzed: progress.analyzed,
          refactored: progress.refactored,
          rejected: progress.rejected,
          pending: progress.pending,
          progressPercent: progress.progressPercent,
        },
        files: (progress.files ?? []) as import('../lib/exportWorkspaceStudyCsv').WorkspaceStudyFileInput[],
      });
      downloadWorkspaceStudyCsv(defaultWorkspaceStudyFilename(project.id, iso), csv);
    } catch (err) {
      console.error('Study CSV export failed', err);
    }
  };

  const saveProjectName = async (projectId: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setRenameSaving(true);
    try {
      const updated = await apiClient.updateProjectProfile(projectId, trimmed);
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, name: updated.name } : p
      ));
      setRenamingId(null);
    } catch (err) {
      console.error('Failed to rename project:', err);
    } finally {
      setRenameSaving(false);
    }
  };

  const startRename = (project: ProjectProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(project.id);
    setRenameValue(project.name);
  };

  const repoShortName = (url: string | null) => {
    if (!url) return null;
    const m = url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
    return m ? m[1] : url.replace(/https?:\/\//, '').slice(0, 40);
  };

  const handleClone = async () => {
    if (!cloneUrl.trim()) return;
    setCloning(true);
    try {
      if (onCloneProject) {
        onCloneProject(cloneUrl.trim(), cloneBranch || 'main');
      } else {
        const ws = await apiClient.cloneGitRepository(cloneUrl.trim(), cloneBranch || 'main', userId, userName);
        onProjectSelect?.({
          id: ws.id, name: ws.name || ws.id,
          sourceFiles: ws.sourceFiles, testFiles: ws.testFiles,
          createdAt: Date.now(), status: 'active',
        });
      }
      setCloneUrl('');
      setShowNewProject(false);
      loadProjects();
    } catch (err) {
      console.error('Clone failed:', err);
    } finally {
      setCloning(false);
    }
  };

  const hubProjectIds = useMemo(
    () => projects.map((p) => ({ id: p.id, name: p.name })),
    [projects]
  );

  const filteredProjects = projects.filter(p => {
    const matchesSearch = !searchTerm ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.repositoryUrl && p.repositoryUrl.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFilter = filterStatus === 'all' || p.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const statusCounts = {
    all: projects.length,
    active: projects.filter(p => p.status === 'active').length,
    completed: projects.filter(p => p.status === 'completed').length,
    archived: projects.filter(p => p.status === 'archived').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Clock className="w-6 h-6 text-slate-400 animate-spin mr-3" />
        <span className="text-slate-400">Loading projects...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Projects', value: statusCounts.all, icon: FolderOpen, color: 'text-slate-300' },
          { label: 'Active', value: statusCounts.active, icon: Play, color: 'text-green-400' },
          { label: 'Completed', value: statusCounts.completed, icon: CheckCircle, color: 'text-blue-400' },
          { label: 'Archived', value: statusCounts.archived, icon: AlertCircle, color: 'text-slate-500' },
        ].map(s => (
          <div key={s.label} className="bg-slate-800/60 rounded-lg p-3 flex items-center gap-3">
            <s.icon className={`w-5 h-5 ${s.color}`} />
            <div>
              <div className="text-xl font-bold text-white">{s.value}</div>
              <div className="text-xs text-slate-400">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {projects.length > 0 && ENABLE_RESEARCH_EXPORT_HUB && (
        <ResearchExportHubSection
          userId={userId}
          projectIds={hubProjectIds}
          onExportAllProjects={() => setShowCrossProjectExcelModal(true)}
          researchArchiveRefreshKey={researchArchiveRefreshKey}
        />
      )}

      {projects.length > 0 && ENABLE_RIPPLE_REF_STUDY && (
        <RippleRefStudyPanel
          projects={projects.map((p) => ({
            id: p.id,
            name: p.name,
            sourceFiles: p.sourceFiles,
          }))}
        />
      )}

      {projects.length > 0 && ENABLE_RIPPLE_REF_STUDY && (
        <MaRefStudyPanel
          projects={projects.map((p) => ({
            id: p.id,
            name: p.name,
          }))}
        />
      )}

      {/* Search + filter + refresh */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All ({statusCounts.all})</option>
          <option value="active">Active ({statusCounts.active})</option>
          <option value="completed">Completed ({statusCounts.completed})</option>
          <option value="archived">Archived ({statusCounts.archived})</option>
        </select>
        <button onClick={() => void loadProjects({ refreshCounts: true })} className="p-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors" title="Refresh project list and file counts">
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowNewProject(!showNewProject)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            showNewProject
              ? 'bg-indigo-600 text-white'
              : 'bg-indigo-600/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-600 hover:text-white'
          }`}
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* New Project panel */}
      {showNewProject && (
        <div className="bg-gradient-to-br from-indigo-950/50 to-slate-800/70 border-2 border-indigo-500/40 rounded-xl p-5 shadow-lg shadow-indigo-900/20">
          <h3 className="text-white font-semibold mb-1 flex items-center gap-2 text-lg">
            <Plus className="w-5 h-5 text-indigo-400" />
            Add New Project
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            Creates <strong className="text-slate-200 font-medium">new workspace(s)</strong> — existing
            projects stay saved. Upload one or more ZIPs, or clone from GitHub. Run PMD on each project
            when you are ready.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Git Clone */}
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
              <div className="flex items-center gap-2 mb-3">
                <GitBranch className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-white">Clone Repository</span>
              </div>
              <input
                type="text"
                value={cloneUrl}
                onChange={e => setCloneUrl(e.target.value)}
                placeholder="https://github.com/user/repo.git"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent mb-2"
                onKeyDown={e => {
                  if (e.key === 'Enter' && cloneUrl.trim()) {
                    handleClone();
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={cloneBranch}
                  onChange={e => setCloneBranch(e.target.value)}
                  placeholder="Branch"
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <button
                  onClick={handleClone}
                  disabled={!cloneUrl.trim() || cloning}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {cloning ? 'Cloning...' : 'Clone'}
                </button>
              </div>
            </div>
            {/* File Upload */}
            <div className="bg-slate-900/50 rounded-lg p-4 border border-blue-500/30 ring-1 ring-blue-500/10">
              <div className="flex items-center gap-2 mb-3">
                <Upload className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-semibold text-white">Upload Project (ZIP)</span>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                Select one or more .zip files — each becomes its own workspace. Run PMD on each
                project separately when you are ready.
              </p>
              <label className="block">
                <input
                  type="file"
                  accept=".zip,.jar"
                  multiple
                  className="hidden"
                  onChange={e => {
                    const picked = e.target.files ? Array.from(e.target.files) : [];
                    if (picked.length > 0 && onUploadProject) {
                      void onUploadProject(picked);
                      if (picked.length === 1) {
                        setShowNewProject(false);
                      }
                    }
                    e.target.value = '';
                  }}
                />
                <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold cursor-pointer transition-colors shadow-md">
                  <Upload className="w-4 h-4" />
                  Choose ZIP file(s)…
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Project cards */}
      {filteredProjects.length === 0 ? (
        <div className="text-center py-16 bg-slate-800/30 rounded-lg border border-slate-700">
          <FolderOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">
            {projects.length === 0 ? 'No Projects Yet' : 'No Matches'}
          </h3>
          <p className="text-slate-400 text-sm mb-4">
            {projects.length === 0
              ? 'Upload a ZIP or clone a repository to create your first project workspace.'
              : 'Try adjusting your search or filter, or add another project above.'}
          </p>
          {projects.length === 0 ? (
            <button
              type="button"
              onClick={() => setShowNewProject(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Add first project
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredProjects.map(project => {
            const prog = project.progress;
            const processed = prog ? (prog.refactored + prog.rejected + prog.skipped) : 0;
            const javaTrackable = prog
              ? (prog.javaSourceFiles ?? 0) + (prog.javaTestFiles ?? 0)
              : project.sourceFiles + project.testFiles;
            const trackableTotal = prog?.totalFiles ?? javaTrackable;
            const workspaceTotal = prog?.workspaceFiles
              ?? project.totalWorkspaceFiles
              ?? project.sourceFiles;
            const pct = prog?.progressPercent ?? 0;

            return (
              <div
                key={project.id}
                className="bg-slate-800/70 rounded-xl border border-slate-700 hover:border-indigo-500/50 transition-all cursor-pointer group"
                onClick={() => onProjectSelect?.({
                  id: project.id, name: project.name,
                  sourceFiles: project.sourceFiles, testFiles: project.testFiles,
                  createdAt: project.createdAt, status: project.status || 'active',
                })}
              >
                <div className="p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                        <FolderOpen className="w-5 h-5 text-indigo-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        {renamingId === project.id ? (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <input
                              type="text"
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') void saveProjectName(project.id);
                                if (e.key === 'Escape') setRenamingId(null);
                              }}
                              className="flex-1 min-w-0 px-2 py-1 text-sm bg-slate-900 border border-indigo-500 rounded text-white focus:outline-none"
                              autoFocus
                              disabled={renameSaving}
                            />
                            <button
                              type="button"
                              onClick={() => void saveProjectName(project.id)}
                              disabled={renameSaving || !renameValue.trim()}
                              className="p-1 text-green-400 hover:text-green-300 disabled:opacity-40"
                              title="Save name"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRenamingId(null)}
                              className="p-1 text-slate-400 hover:text-slate-300"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 min-w-0">
                            <h3 className="text-white font-semibold truncate flex-1" title={project.name}>{project.name}</h3>
                            <button
                              type="button"
                              onClick={e => startRename(project, e)}
                              className="flex-shrink-0 text-slate-500 hover:text-indigo-400 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Rename project"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        <p className="text-[10px] text-slate-600 truncate font-mono mt-0.5" title={project.id}>{project.id}</p>
                        {project.repositoryUrl && renamingId !== project.id && (
                          <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                            <GitBranch className="w-3 h-3 flex-shrink-0" />
                            {repoShortName(project.repositoryUrl)}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${
                      project.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                      project.status === 'completed' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                      'bg-slate-700 text-slate-400 border-slate-600'
                    }`}>
                      {project.status?.toUpperCase() || 'ACTIVE'}
                    </span>
                  </div>

                  {/* Progress bar */}
                  {prog && prog.totalFiles > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-400" title="Completed refactor attempts only (accepted/rejected/skipped). Opening files or running smell analysis does not move this bar.">
                          Refactoring Progress
                        </span>
                        <span className="text-white font-medium">{pct}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            background: pct >= 100
                              ? 'linear-gradient(90deg, #34d399, #22d3ee)'
                              : pct > 0
                              ? 'linear-gradient(90deg, #6366f1, #8b5cf6)'
                              : 'transparent',
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500">
                        {(prog.analyzed ?? 0) > 0 && (
                          <span className="text-blue-400">{prog.analyzed} analyzed</span>
                        )}
                        {prog.refactored > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void onProjectSelect?.(
                                {
                                  id: project.id,
                                  name: project.name,
                                  sourceFiles: project.sourceFiles,
                                  testFiles: project.testFiles,
                                  createdAt: project.createdAt,
                                  status: project.status || 'active',
                                },
                                { view: 'files', fileStatusFilter: 'refactored', openFirstRefactored: true }
                              );
                            }}
                            className="text-green-400 hover:text-green-300 underline-offset-2 hover:underline"
                          >
                            {prog.refactored} refactored
                          </button>
                        )}
                        {prog.rejected > 0 && <span className="text-red-400">{prog.rejected} rejected</span>}
                        {prog.pending > 0 && <span>{prog.pending} pending refactor</span>}
                      </div>
                    </div>
                  )}

                  {/* Stats row */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1" title="All non-binary files in the project tree">
                      <FileText className="w-3.5 h-3.5" />
                      {workspaceTotal} workspace
                    </span>
                    <span className="flex items-center gap-1" title="Java source + test files (refactoring scope)">
                      {trackableTotal} Java
                    </span>
                    {prog && (prog.analyzed ?? 0) > 0 && (
                      <span className="text-blue-400/90" title="Files with PMD analysis recorded">
                        {prog.analyzed} analyzed
                      </span>
                    )}
                    {prog && prog.pending > 0 && (
                      <span className="text-slate-500">{prog.pending} pending refactor</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(project.lastAccessedAt || project.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Action bar */}
                <div className="border-t border-slate-700/50 px-5 py-2.5 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        void onProjectSelect?.({
                          id: project.id,
                          name: project.name,
                          sourceFiles: project.sourceFiles,
                          testFiles: project.testFiles,
                          createdAt: project.createdAt,
                          status: project.status || 'active',
                        });
                      }}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      {prog && processed > 0 ? 'Continue' : 'Open'}
                    </button>
                    {onProjectAnalyze && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          void onProjectAnalyze({ id: project.id, name: project.name });
                        }}
                        className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
                        title="Run full-project PMD smell scan (one project at a time)"
                      >
                        <Search className="w-3.5 h-3.5" />
                        Run PMD
                      </button>
                    )}
                    {prog && prog.refactored > 0 && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          void onProjectSelect?.(
                            {
                              id: project.id,
                              name: project.name,
                              sourceFiles: project.sourceFiles,
                              testFiles: project.testFiles,
                              createdAt: project.createdAt,
                              status: project.status || 'active',
                            },
                            { view: 'files', fileStatusFilter: 'refactored', openFirstRefactored: true }
                          );
                        }}
                        className="text-xs text-green-400 hover:text-green-300 font-medium flex items-center gap-1 transition-colors"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        View refactored ({prog.refactored})
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        void onProjectSelect?.(
                          {
                            id: project.id,
                            name: project.name,
                            sourceFiles: project.sourceFiles,
                            testFiles: project.testFiles,
                            createdAt: project.createdAt,
                            status: project.status || 'active',
                          },
                          { view: 'files', openExcelExport: true }
                        );
                      }}
                      className="text-xs text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
                      title={isRefineDemo() ? 'Export metrics workbook (.xlsx)' : 'Export full research metrics workbook (.xlsx)'}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Excel
                    </button>
                    {!isRefineDemo() && (
                    <button
                      type="button"
                      onClick={e => void exportStudyCsv(project, e)}
                      className="text-xs text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-1"
                      title="Export study CSV (file activity + research snapshots)"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Study CSV
                    </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); setShowDeleteConfirm(project.id); }}
                      className="text-xs text-slate-500 hover:text-red-400 transition-colors p-1"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowDeleteConfirm(null)}>
          <div className="bg-slate-800 rounded-xl border border-slate-600 shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-red-400" />
              <h3 className="text-lg font-semibold text-white">Delete Project</h3>
            </div>
            <p className="text-slate-400 mb-6 text-sm">
              This will permanently delete the project and all its refactoring history. This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDeleteConfirm(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={() => deleteProject(showDeleteConfirm)} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showCrossProjectExcelModal && projects.length > 0 && (
        <CrossProjectExcelExportModal
          userId={userId}
          storageWorkspaceId={projects[0]?.id ?? ''}
          selectAllProjects
          defaultExportScope="all_saved"
          onClose={() => setShowCrossProjectExcelModal(false)}
          onSaved={() => setResearchArchiveRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

export const projectHubUtils = {
  addProject: (project: { id: string; name: string; sourceFiles: number; testFiles: number; createdAt: number; repositoryUrl?: string; status?: string }) => {
    const stored = localStorage.getItem('refactai-projects');
    const projects = stored ? JSON.parse(stored) : [];
    if (!projects.find((p: any) => p.id === project.id)) {
      projects.push({ ...project, status: project.status || 'active' });
      localStorage.setItem('refactai-projects', JSON.stringify(projects));
    }
  },
  getProjects: () => {
    const stored = localStorage.getItem('refactai-projects');
    return stored ? JSON.parse(stored) : [];
  },
  updateProject: (projectId: string, updates: Record<string, unknown>) => {
    const stored = localStorage.getItem('refactai-projects');
    const projects = stored ? JSON.parse(stored) : [];
    const updated = projects.map((p: any) => p.id === projectId ? { ...p, ...updates } : p);
    localStorage.setItem('refactai-projects', JSON.stringify(updated));
  },
  deleteProject: (projectId: string) => {
    const stored = localStorage.getItem('refactai-projects');
    const projects = stored ? JSON.parse(stored) : [];
    localStorage.setItem('refactai-projects', JSON.stringify(projects.filter((p: any) => p.id !== projectId)));
  },
};
