'use client';

import React, { useState } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Eye, 
  Shield, 
  Clock,
  User,
  FileText,
  GitBranch,
  Zap
} from 'lucide-react';

interface RefactoringApprovalProps {
  refactoringRequest: {
    type: string;
    filePath: string;
    methodName?: string;
    newName?: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    impactAnalysis: any;
  };
  onApprove: (approved: boolean, comments?: string) => void;
  onClose: () => void;
}

export default function RefactoringApproval({ 
  refactoringRequest, 
  onApprove, 
  onClose 
}: RefactoringApprovalProps) {
  const [comments, setComments] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW': return 'text-green-400 bg-green-500/20 border-green-500/50';
      case 'MEDIUM': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50';
      case 'HIGH': return 'text-red-400 bg-red-500/20 border-red-500/50';
      default: return 'text-gray-400 bg-gray-500/20 border-gray-500/50';
    }
  };

  const getRiskIcon = (risk: string) => {
    switch (risk) {
      case 'LOW': return <CheckCircle className="w-4 h-4" />;
      case 'MEDIUM': return <AlertTriangle className="w-4 h-4" />;
      case 'HIGH': return <XCircle className="w-4 h-4" />;
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      onApprove(true, comments);
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      onApprove(false, comments);
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Refactoring Approval</h2>
                <p className="text-slate-400">Review and approve the refactoring operation</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Operation Details */}
          <div className="bg-slate-700 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-4">Operation Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-400">Type:</span>
                <p className="text-white font-medium">{refactoringRequest.type.replace('_', ' ')}</p>
              </div>
              <div>
                <span className="text-slate-400">File:</span>
                <p className="text-white font-medium">{refactoringRequest.filePath.split('/').pop()}</p>
              </div>
              <div>
                <span className="text-slate-400">Risk Level:</span>
                <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs border ${getRiskColor(refactoringRequest.riskLevel)}`}>
                  {getRiskIcon(refactoringRequest.riskLevel)}
                  <span>{refactoringRequest.riskLevel}</span>
                </div>
              </div>
              <div>
                <span className="text-slate-400">Requested By:</span>
                <p className="text-white font-medium">Current User</p>
              </div>
            </div>
          </div>

          {/* Impact Analysis Summary */}
          {refactoringRequest.impactAnalysis && (
            <div className="bg-slate-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-4">Impact Analysis</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-400">Files Affected:</span>
                  <p className="text-white font-medium">{refactoringRequest.impactAnalysis.impactedFilesCount || 0}</p>
                </div>
                <div>
                  <span className="text-slate-400">Dependencies:</span>
                  <p className="text-white font-medium">{refactoringRequest.impactAnalysis.dependenciesCount || 0}</p>
                </div>
                <div>
                  <span className="text-slate-400">Risk Level:</span>
                  <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs border ${
                    refactoringRequest.impactAnalysis.highRisk 
                      ? 'text-red-400 bg-red-500/20 border-red-500/50'
                      : 'text-green-400 bg-green-500/20 border-green-500/50'
                  }`}>
                    {refactoringRequest.impactAnalysis.highRisk ? (
                      <XCircle className="w-3 h-3" />
                    ) : (
                      <CheckCircle className="w-3 h-3" />
                    )}
                    <span>{refactoringRequest.impactAnalysis.highRisk ? 'HIGH RISK' : 'SAFE'}</span>
                  </div>
                </div>
                <div>
                  <span className="text-slate-400">Estimated Time:</span>
                  <p className="text-white font-medium">2-5 minutes</p>
                </div>
              </div>
            </div>
          )}

          {/* Recommendations */}
          {refactoringRequest.impactAnalysis?.recommendations && (
            <div className="bg-slate-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-4">Recommendations</h3>
              <ul className="space-y-2">
                {refactoringRequest.impactAnalysis.recommendations.map((rec: string, index: number) => (
                  <li key={index} className="flex items-start space-x-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-300">{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Comments Section */}
          <div className="bg-slate-700 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-4">Review Comments</h3>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Add your review comments here..."
              className="w-full h-24 bg-slate-600 border border-slate-500 rounded-lg p-3 text-white placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Approval Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-700">
            <div className="flex items-center space-x-4 text-sm text-slate-400">
              <div className="flex items-center space-x-1">
                <Clock className="w-4 h-4" />
                <span>Requested 2 minutes ago</span>
              </div>
              <div className="flex items-center space-x-1">
                <User className="w-4 h-4" />
                <span>Requires approval</span>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleReject}
                disabled={isRejecting || isApproving}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg transition-colors flex items-center space-x-2"
              >
                <XCircle className="w-4 h-4" />
                <span>{isRejecting ? 'Rejecting...' : 'Reject'}</span>
              </button>

              <button
                onClick={handleApprove}
                disabled={isApproving || isRejecting}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition-colors flex items-center space-x-2"
              >
                <CheckCircle className="w-4 h-4" />
                <span>{isApproving ? 'Approving...' : 'Approve'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
