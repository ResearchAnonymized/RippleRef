'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiError } from '../api/client';
import { User, UserPlus, ChevronRight, Briefcase, Clock, Code, Trash2, RefreshCw, AlertCircle } from 'lucide-react';
import { isRefineDemo } from '../lib/refineDemoMode';

const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || 'REFINE';

export interface UserProfile {
  id: string;
  name: string;
  role: string;
  email: string | null;
  createdAt: number;
  lastActiveAt: number;
  projectsCount: number;
  refactoringsCount: number;
}

interface UserProfileSelectorProps {
  onProfileSelected: (profile: UserProfile) => void;
  restoringSession?: boolean;
}

const ROLES = [
  { value: 'developer', label: 'Developer' },
  ...(isRefineDemo()
    ? []
    : [
        { value: 'researcher', label: 'Researcher' },
        { value: 'evaluator', label: 'Evaluator' },
      ]),
  { value: 'student', label: 'Student' },
  { value: 'other', label: 'Other' },
];

export default function UserProfileSelector({
  onProfileSelected,
  restoringSession = false,
}: UserProfileSelectorProps) {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('developer');
  const [newEmail, setNewEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [lastCachedName, setLastCachedName] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setBackendError(null);
    try {
      const users = await Promise.race([
        apiClient.listUsers(),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error('Request timed out after 12s')), 12_000)
        ),
      ]);
      setProfiles(users);
      setShowCreateForm(users.length === 0);
    } catch (err) {
      console.error('Failed to load user profiles', err);
      const msg =
        err instanceof ApiError && err.status === 0
          ? `Cannot reach the ${BRAND_NAME} API. Start the stack from the repository root (./start-refine.sh), then click Retry.`
          : err instanceof Error
            ? err.message
            : 'Failed to load profiles';
      setBackendError(msg);
      setProfiles([]);
      setShowCreateForm(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = localStorage.getItem('refactai-user-name')?.trim();
    if (cached) {
      setLastCachedName(cached);
      setNewName(cached);
    }
    void loadProfiles();
  }, [loadProfiles]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setBackendError(null);
    try {
      const profile = await apiClient.createUser(newName.trim(), newRole, newEmail.trim() || undefined);
      localStorage.setItem('refactai-user-id', profile.id);
      localStorage.setItem('refactai-user-name', profile.name);
      onProfileSelected(profile);
    } catch (err) {
      console.error('Failed to create profile', err);
      const msg =
        err instanceof ApiError && err.status === 0
          ? 'Cannot reach the API. Start the backend, then try again.'
          : err instanceof Error
            ? err.message
            : 'Failed to create profile';
      setBackendError(msg);
      alert(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleSelect = (profile: UserProfile) => {
    localStorage.setItem('refactai-user-id', profile.id);
    localStorage.setItem('refactai-user-name', profile.name);
    onProfileSelected(profile);
  };

  const handleDelete = async (e: React.MouseEvent, userId: string) => {
    e.stopPropagation();
    try {
      await apiClient.deleteUser(userId);
      setProfiles(prev => prev.filter(p => p.id !== userId));
    } catch (err) {
      console.error('Failed to delete profile', err);
      alert('Could not delete profile. Is the backend running?');
    }
  };

  const formatTime = (ts: number) => {
    if (!ts) return 'Never';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {restoringSession && (
          <p className="mb-4 text-center text-sm text-blue-300/90 animate-pulse">
            Restoring your saved profile…
          </p>
        )}
        {loading && (
          <p className="mb-4 text-center text-sm text-slate-500">Loading profiles…</p>
        )}
        <p className="mb-4 text-center text-xs text-slate-500">
          <a href="/dashboard?reset-profile=1" className="text-blue-400 underline hover:text-blue-300">
            Clear saved session
          </a>
        </p>

        {backendError && (
          <div className="mb-6 p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-left">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-amber-100/90">{backendError}</p>
                {lastCachedName && (
                  <p className="text-xs text-slate-400 mt-2">
                    Last signed-in as <span className="text-white font-medium">{lastCachedName}</span>.
                    After the API is running, click Retry and select that profile (or Create Profile to reuse the same name).
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void loadProfiles()}
                  className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-sm text-white hover:bg-slate-700"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Code className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">{BRAND_NAME}</h1>
          <p className="text-slate-400 text-sm">Select your profile to continue</p>
        </div>

        {/* Existing profiles */}
        {profiles.length > 0 && !showCreateForm && (
          <div className="space-y-3 mb-6">
            {profiles.map(profile => (
              <button
                key={profile.id}
                onClick={() => handleSelect(profile)}
                className="w-full bg-slate-800/70 border border-slate-700 hover:border-indigo-500/50 rounded-xl p-4 flex items-center gap-4 transition-all group text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <User className="w-6 h-6 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold">{profile.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 uppercase tracking-wide">
                      {profile.role}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Briefcase className="w-3 h-3" />
                      {profile.projectsCount} projects
                    </span>
                    <span className="flex items-center gap-1">
                      <Code className="w-3 h-3" />
                      {profile.refactoringsCount} refactorings
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTime(profile.lastActiveAt)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleDelete(e, profile.id)}
                    className="p-1.5 text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete profile"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Create new profile form */}
        {showCreateForm ? (
          <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-indigo-400" />
              Create Profile
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Name *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Role</label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-indigo-500"
                >
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Email <span className="text-slate-600">(optional)</span></label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || creating}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  {creating ? 'Creating...' : 'Create Profile'}
                </button>
                {profiles.length > 0 && (
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2.5 text-slate-400 hover:text-white transition-colors text-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full py-3 border border-dashed border-slate-600 hover:border-indigo-500/50 rounded-xl text-slate-400 hover:text-indigo-400 transition-all text-sm flex items-center justify-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Create New Profile
          </button>
        )}
      </div>
    </div>
  );
}
