'use client';

import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
// Using basic HTML elements instead of missing UI components
import { 
  Download, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  HardDrive, 
  Zap,
  FileText,
  GitBranch
} from 'lucide-react';

interface CloneProgress {
  status: string;
  bytesDownloaded: number;
  totalBytes: number;
  speed: number;
  estimatedTimeRemaining: number;
  percentage: number;
  currentFile: string;
  error?: string;
}

interface Workspace {
  id: string;
  name: string;
  sourceFiles: number;
  testFiles: number;
  createdAt: number;
}

interface GitHubCloneInterfaceProps {
  workspaceId: string;
  onCloneComplete?: (workspace: Workspace) => void;
}

export default function GitHubCloneInterface({ 
  workspaceId, 
  onCloneComplete 
}: GitHubCloneInterfaceProps) {
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [progress, setProgress] = useState<CloneProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cloneComplete, setCloneComplete] = useState(false);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  };

  const validateGitHubUrl = (url: string): boolean => {
    // Extract URL from text that might contain additional info (e.g., "Guava, https://github.com/...")
    const urlMatch = url.match(/https:\/\/github\.com\/[^\s,]+/);
    if (urlMatch) {
      const extractedUrl = urlMatch[0];
      const githubPattern = /^https:\/\/github\.com\/[^\/]+\/[^\/]+(?:\/.*)?$/;
      return githubPattern.test(extractedUrl);
    }
    return false;
  };

  const extractGitHubUrl = (input: string): string => {
    const urlMatch = input.match(/https:\/\/github\.com\/[^\s,]+/);
    return urlMatch ? urlMatch[0] : input;
  };

  const startClone = async () => {
    if (!repositoryUrl.trim()) {
      setError('Please enter a GitHub repository URL');
      return;
    }

    if (!validateGitHubUrl(repositoryUrl)) {
      setError('Please enter a valid GitHub repository URL (e.g., https://github.com/owner/repo)');
      return;
    }

    // Extract the clean URL from the input
    const cleanUrl = extractGitHubUrl(repositoryUrl);

    try {
      setError(null);
      setIsCloning(true);
      setProgress(null);
      setCloneComplete(false);

      // Initiate clone using the backend client (uses NEXT_PUBLIC_API_URL or default 8081)
      const workspace = await apiClient.cloneGitRepository(cleanUrl, 'main');
      
      // Show completion immediately since the backend handles the cloning
      setProgress({
        status: "Repository cloned successfully!",
        bytesDownloaded: 100,
        totalBytes: 100,
        speed: 0,
        estimatedTimeRemaining: 0,
        percentage: 100,
        currentFile: "Clone complete"
      });
      
      setCloneComplete(true);
      setIsCloning(false);
      
      if (onCloneComplete) {
        onCloneComplete(workspace);
      }

    } catch (err) {
      console.error('Clone initiation failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to start clone');
      setIsCloning(false);
    }
  };

  const stopClone = () => {
    if (eventSource) {
      eventSource.close();
      setEventSource(null);
    }
    setIsCloning(false);
    setProgress(null);
  };

  const resetClone = () => {
    if (eventSource) {
      eventSource.close();
      setEventSource(null);
    }
    setIsCloning(false);
    setProgress(null);
    setError(null);
    setCloneComplete(false);
    setRepositoryUrl('');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [eventSource]);

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-8">
        <div className="mb-6">
          <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            GitHub Repository Clone
          </h3>
          <p className="text-slate-400">
            Clone a GitHub repository for analysis. Enter the repository URL to get started.
          </p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="repo-url" className="text-sm font-medium">
              Repository URL
            </label>
            <div className="flex gap-2">
              <input
                id="repo-url"
                type="url"
                placeholder="https://github.com/owner/repository"
                value={repositoryUrl}
                onChange={(e) => setRepositoryUrl(e.target.value)}
                disabled={isCloning}
                className="flex-1 bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
              />
              <button 
                onClick={startClone} 
                disabled={isCloning || !repositoryUrl.trim()}
                className="min-w-[100px] bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:from-slate-600 disabled:to-slate-700 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 inline-flex items-center justify-center"
              >
                {isCloning ? (
                  <>
                    <Download className="h-4 w-4 mr-2 animate-spin" />
                    Cloning...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Clone
                  </>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-medium">Error</p>
                <p className="text-red-300 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {cloneComplete && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-emerald-400 font-medium">Success</p>
                <p className="text-emerald-300 text-sm mt-1">
                  Repository cloned successfully! You can now proceed with analysis.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {progress && (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-8">
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
              <Download className="h-5 w-5" />
              Clone Progress
            </h3>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-white">{progress.status}</span>
                <span className="text-slate-400">{progress.percentage}%</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-emerald-500 to-teal-600 h-2 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-sm text-slate-400">
                  <HardDrive className="h-3 w-3" />
                  Downloaded
                </div>
                <div className="font-medium text-white">
                  {formatBytes(progress.bytesDownloaded)}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1 text-sm text-slate-400">
                  <HardDrive className="h-3 w-3" />
                  Total Size
                </div>
                <div className="font-medium text-white">
                  {formatBytes(progress.totalBytes)}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1 text-sm text-slate-400">
                  <Zap className="h-3 w-3" />
                  Speed
                </div>
                <div className="font-medium text-white">
                  {formatSpeed(progress.speed)}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1 text-sm text-slate-400">
                  <Clock className="h-3 w-3" />
                  ETA
                </div>
                <div className="font-medium text-white">
                  {formatTime(progress.estimatedTimeRemaining)}
                </div>
              </div>
            </div>

            {progress.currentFile && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-sm text-slate-400">
                  <FileText className="h-3 w-3" />
                  Current File
                </div>
                <div className="font-mono text-sm bg-slate-700 p-2 rounded text-white">
                  {progress.currentFile}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button 
                onClick={stopClone}
                disabled={!isCloning}
                className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 border border-slate-600"
              >
                Stop Clone
              </button>
              <button 
                onClick={resetClone}
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 border border-slate-600"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
