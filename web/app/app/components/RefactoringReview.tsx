'use client';

import React, { useState } from 'react';
import { X, CheckCircle, AlertTriangle, FileText, GitBranch, Eye, Play, RotateCcw } from 'lucide-react';

interface RefactoringReviewProps {
  isOpen: boolean;
  onClose: () => void;
  onApprove: (approved: boolean) => void;
  refactoringRequest: {
    type: string;
    filePath: string;
    methodName: string;
    newName: string;
  };
  previewData: {
    originalContent: string;
    refactoredContent: string;
    changes: {
      linesChanged: number;
      charactersChanged: number;
      hasChanges: boolean;
    };
    riskLevel: string;
    affectedFiles: number;
    dependencies: number;
  };
}

export default function RefactoringReview({
  isOpen,
  onClose,
  onApprove,
  refactoringRequest,
  previewData
}: RefactoringReviewProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'changes' | 'impact'>('preview');
  const [isApproving, setIsApproving] = useState(false);

  if (!isOpen) return null;

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'HIGH': return 'text-red-400 bg-red-500/20 border-red-500/50';
      case 'MEDIUM': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50';
      case 'LOW': return 'text-green-400 bg-green-500/20 border-green-500/50';
      default: return 'text-slate-400 bg-slate-500/20 border-slate-500/50';
    }
  };

  const highlightChanges = (original: string, refactored: string) => {
    const originalLines = original.split('\n');
    const refactoredLines = refactored.split('\n');
    const maxLines = Math.max(originalLines.length, refactoredLines.length);
    
    return Array.from({ length: maxLines }, (_, i) => {
      const originalLine = originalLines[i] || '';
      const refactoredLine = refactoredLines[i] || '';
      const isChanged = originalLine !== refactoredLine;
      
      return {
        lineNumber: i + 1,
        original: originalLine,
        refactored: refactoredLine,
        isChanged,
        isAdded: !originalLine && refactoredLine,
        isRemoved: originalLine && !refactoredLine
      };
    });
  };

  const diffLines = highlightChanges(previewData.originalContent, previewData.refactoredContent);

  const handleApprove = async (approved: boolean) => {
    setIsApproving(true);
    try {
      await onApprove(approved);
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-600 max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-600">
          <div className="flex items-center space-x-3">
            <Eye className="w-6 h-6 text-blue-400" />
            <div>
              <h3 className="text-lg font-semibold text-white">
                🔍 Review Refactoring: {refactoringRequest.type.replace('_', ' ')}
              </h3>
              <p className="text-sm text-slate-400 font-mono">
                {refactoringRequest.filePath}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Risk Assessment */}
        <div className="p-4 bg-slate-700/50 border-b border-slate-600">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className={`px-3 py-1 rounded-full border text-sm font-medium ${getRiskColor(previewData.riskLevel)}`}>
                {previewData.riskLevel} RISK
              </div>
              <div className="flex items-center space-x-4 text-sm text-slate-300">
                <div className="flex items-center space-x-1">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span>{previewData.affectedFiles} files affected</span>
                </div>
                <div className="flex items-center space-x-1">
                  <GitBranch className="w-4 h-4 text-purple-400" />
                  <span>{previewData.dependencies} dependencies</span>
                </div>
              </div>
            </div>
            <div className="text-sm text-slate-400">
              {previewData.changes.linesChanged} lines • {previewData.changes.charactersChanged} characters
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-600">
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'preview'
                ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-700/50'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            📄 Code Preview
          </button>
          <button
            onClick={() => setActiveTab('changes')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'changes'
                ? 'text-purple-400 border-b-2 border-purple-400 bg-slate-700/50'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            🔍 Changes (Diff)
          </button>
          <button
            onClick={() => setActiveTab('impact')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'impact'
                ? 'text-amber-400 border-b-2 border-amber-400 bg-slate-700/50'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            ⚡ Impact Analysis
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {activeTab === 'preview' && (
            <div className="p-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-slate-300 mb-2">Original Code</h4>
                  <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap bg-slate-900/50 p-3 rounded border max-h-96 overflow-auto">
                    {previewData.originalContent}
                  </pre>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-slate-300 mb-2">Refactored Code</h4>
                  <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap bg-slate-900/50 p-3 rounded border max-h-96 overflow-auto">
                    {previewData.refactoredContent}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'changes' && (
            <div className="p-4">
              <div className="bg-slate-900/50 rounded border overflow-hidden">
                {diffLines.map((line, index) => (
                  <div
                    key={index}
                    className={`flex text-xs font-mono ${
                      line.isAdded
                        ? 'bg-green-500/20 text-green-300'
                        : line.isRemoved
                        ? 'bg-red-500/20 text-red-300'
                        : line.isChanged
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'text-slate-300'
                    }`}
                  >
                    <div className="w-12 px-2 py-1 text-slate-500 border-r border-slate-600 bg-slate-800/50">
                      {line.lineNumber}
                    </div>
                    <div className="flex-1 px-2 py-1">
                      {line.isAdded && <span className="text-green-400">+ </span>}
                      {line.isRemoved && <span className="text-red-400">- </span>}
                      {line.isChanged && !line.isAdded && !line.isRemoved && <span className="text-amber-400">~ </span>}
                      {line.refactored || line.original}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'impact' && (
            <div className="p-4">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                    <div className="flex items-center space-x-2 mb-2">
                      <FileText className="w-5 h-5 text-blue-400" />
                      <span className="text-sm font-medium text-slate-300">Files Affected</span>
                    </div>
                    <div className="text-2xl font-bold text-blue-400">{previewData.affectedFiles}</div>
                    <div className="text-xs text-slate-400">Java files will be modified</div>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                    <div className="flex items-center space-x-2 mb-2">
                      <GitBranch className="w-5 h-5 text-purple-400" />
                      <span className="text-sm font-medium text-slate-300">Dependencies</span>
                    </div>
                    <div className="text-2xl font-bold text-purple-400">{previewData.dependencies}</div>
                    <div className="text-xs text-slate-400">Related components</div>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                    <div className="flex items-center space-x-2 mb-2">
                      <AlertTriangle className="w-5 h-5 text-amber-400" />
                      <span className="text-sm font-medium text-slate-300">Risk Level</span>
                    </div>
                    <div className={`text-2xl font-bold ${previewData.riskLevel === 'HIGH' ? 'text-red-400' : previewData.riskLevel === 'MEDIUM' ? 'text-yellow-400' : 'text-green-400'}`}>
                      {previewData.riskLevel}
                    </div>
                    <div className="text-xs text-slate-400">Impact assessment</div>
                  </div>
                </div>

                <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                  <h4 className="text-sm font-medium text-slate-300 mb-3">Recommendations</h4>
                  <ul className="space-y-2 text-sm text-slate-400">
                    <li className="flex items-start space-x-2">
                      <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      <span>Review the changes carefully before applying</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      <span>Ensure all necessary imports are updated</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      <span>Run tests after refactoring to verify functionality</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      <span>Consider creating a backup before proceeding</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer with Approval Actions */}
        <div className="p-4 border-t border-slate-600 bg-slate-700/50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-400">
              💡 Review all changes carefully before approving the refactoring
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => handleApprove(false)}
                disabled={isApproving}
                className="px-4 py-2 text-sm bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reject</span>
              </button>
              <button
                onClick={() => handleApprove(true)}
                disabled={isApproving}
                className="px-6 py-2 text-sm bg-green-600 hover:bg-green-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {isApproving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Approving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Approve & Execute</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
