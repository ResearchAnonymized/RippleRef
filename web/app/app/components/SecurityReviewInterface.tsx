'use client';

import { useState } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Shield,
  Eye,
  FileText,
  Clock,
  User,
  Send
} from 'lucide-react';

interface SecurityVulnerability {
  id: string;
  title: string;
  description: string;
  severity: string;
  category: string;
  filePath: string;
  startLine: number;
  endLine: number;
  codeSnippet: string;
  recommendation: string;
  cweId: string;
  owaspCategory: string;
  cvssScore?: number;
  reviewStatus?: string;
  reviewComment?: string;
  reviewedBy?: string;
}

interface SecurityReviewInterfaceProps {
  vulnerability: SecurityVulnerability;
  onReviewSubmit: (reviewData: ReviewData) => void;
  onClose: () => void;
}

interface ReviewData {
  vulnerabilityId: string;
  action: 'approve_fix' | 'mark_false_positive' | 'accept_risk' | 'request_changes';
  comment: string;
  severity?: string;
  assignee?: string;
  dueDate?: string;
}

/**
 * Human-in-the-Loop Security Review Interface
 * 
 * Allows security experts to:
 * - Review identified vulnerabilities
 * - Mark false positives
 * - Accept risks with justification
 * - Approve automated fixes
 * - Add comments and context
 * - Adjust severity ratings
 */
export default function SecurityReviewInterface({
  vulnerability,
  onReviewSubmit,
  onClose
}: SecurityReviewInterfaceProps) {
  const [selectedAction, setSelectedAction] = useState<ReviewData['action'] | null>(null);
  const [comment, setComment] = useState('');
  const [adjustedSeverity, setAdjustedSeverity] = useState(vulnerability.severity);
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedAction) {
      alert('Please select an action');
      return;
    }

    if (!comment.trim()) {
      alert('Please provide a comment explaining your decision');
      return;
    }

    setIsSubmitting(true);

    const reviewData: ReviewData = {
      vulnerabilityId: vulnerability.id,
      action: selectedAction,
      comment: comment.trim(),
      severity: adjustedSeverity !== vulnerability.severity ? adjustedSeverity : undefined,
      assignee: assignee.trim() || undefined,
      dueDate: dueDate || undefined,
    };

    try {
      await onReviewSubmit(reviewData);
      onClose();
    } catch (error) {
      console.error('Failed to submit review:', error);
      alert('Failed to submit review. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getActionIcon = (action: ReviewData['action']) => {
    switch (action) {
      case 'approve_fix': return <CheckCircle className="w-5 h-5" />;
      case 'mark_false_positive': return <XCircle className="w-5 h-5" />;
      case 'accept_risk': return <AlertTriangle className="w-5 h-5" />;
      case 'request_changes': return <MessageSquare className="w-5 h-5" />;
    }
  };

  const actionOptions = [
    {
      value: 'approve_fix' as const,
      label: 'Approve Fix',
      description: 'Approve the automated fix for this vulnerability',
      icon: CheckCircle,
      color: 'green'
    },
    {
      value: 'mark_false_positive' as const,
      label: 'Mark as False Positive',
      description: 'This is not a real security vulnerability',
      icon: XCircle,
      color: 'blue'
    },
    {
      value: 'accept_risk' as const,
      label: 'Accept Risk',
      description: 'Accept this risk with proper justification',
      icon: AlertTriangle,
      color: 'yellow'
    },
    {
      value: 'request_changes' as const,
      label: 'Request Changes',
      description: 'Request modifications to the proposed fix',
      icon: MessageSquare,
      color: 'purple'
    }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8" />
              <div>
                <h2 className="text-2xl font-bold">Security Review</h2>
                <p className="text-blue-100 text-sm">Human-in-the-Loop Vulnerability Assessment</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-blue-800 p-2 rounded-lg transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Vulnerability Details */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getSeverityColor(vulnerability.severity)}`}>
                  {vulnerability.severity.toUpperCase()}
                </span>
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700">
                  {vulnerability.category}
                </span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {vulnerability.title}
              </h3>
              <p className="text-gray-600 mb-4">{vulnerability.description}</p>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <FileText className="w-4 h-4" />
                  <span>{vulnerability.filePath}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Eye className="w-4 h-4" />
                  <span>Lines {vulnerability.startLine}-{vulnerability.endLine}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Shield className="w-4 h-4" />
                  <span>CWE: {vulnerability.cweId}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <AlertTriangle className="w-4 h-4" />
                  <span>OWASP: {vulnerability.owaspCategory}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Code Snippet */}
          <div className="mt-4">
            <h4 className="font-semibold text-gray-900 mb-2">Code Snippet</h4>
            <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
              {vulnerability.codeSnippet}
            </pre>
          </div>

          {/* Recommendation */}
          <div className="mt-4">
            <h4 className="font-semibold text-gray-900 mb-2">Recommended Fix</h4>
            <p className="text-gray-600 bg-blue-50 p-4 rounded-lg border border-blue-200">
              {vulnerability.recommendation}
            </p>
          </div>
        </div>

        {/* Review Actions */}
        <div className="p-6 space-y-6">
          <div>
            <h4 className="font-semibold text-gray-900 mb-4">Select Review Action</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {actionOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedAction(option.value)}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    selectedAction === option.value
                      ? `border-${option.color}-500 bg-${option.color}-50`
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-${option.color}-100 flex items-center justify-center`}>
                      <option.icon className={`w-5 h-5 text-${option.color}-600`} />
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-gray-900 mb-1">{option.label}</h5>
                      <p className="text-sm text-gray-600">{option.description}</p>
                    </div>
                    {selectedAction === option.value && (
                      <CheckCircle className={`w-5 h-5 text-${option.color}-600`} />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Severity Adjustment */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">Adjust Severity (Optional)</h4>
            <div className="flex gap-2">
              {['critical', 'high', 'medium', 'low', 'info'].map((severity) => (
                <button
                  key={severity}
                  onClick={() => setAdjustedSeverity(severity)}
                  className={`px-4 py-2 rounded-lg capitalize transition-all ${
                    adjustedSeverity === severity
                      ? getSeverityColor(severity)
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {severity}
                </button>
              ))}
            </div>
          </div>

          {/* Comment */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">
              Review Comment <span className="text-red-500">*</span>
            </h4>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Provide a detailed explanation for your decision..."
              className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
            <p className="text-sm text-gray-500 mt-2">
              Explain why you made this decision. This will be part of the audit trail.
            </p>
          </div>

          {/* Assignment & Due Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Assign To (Optional)</h4>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="Enter assignee email or username"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Due Date (Optional)</h4>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-6 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedAction || !comment.trim() || isSubmitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {isSubmitting ? 'Submitting...' : 'Submit Review'}
          </button>
        </div>
      </div>
    </div>
  );
}

