'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Target, TrendingUp, BarChart3, ChevronDown, ChevronUp, CheckCircle, Code, Eye,
} from 'lucide-react';
import type { SavedRefactoringReportBundle } from '../lib/savedRefactoringReport';
import RefactoringReportPanel from './RefactoringReportPanel';
import RefactoringEvidencePanel from './RefactoringEvidencePanel';
import RefactoringVisualSummary from './RefactoringVisualSummary';
import RefactoringMetricsCharts from './RefactoringMetricsCharts';
import ResearchMetricsPanel from './ResearchMetricsPanel';
import type { RefactoringReportShape } from '../lib/refactoringReportDocument';

const CodeComparisonMonacoDiff = dynamic(() => import('./CodeComparisonMonacoDiff'), {
  ssr: false,
  loading: () => <div className="h-48 flex items-center justify-center text-slate-400 text-sm">Loading diff…</div>,
});

function Section({
  title,
  icon: Icon,
  iconColor,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ElementType;
  iconColor?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-700/50 rounded-lg overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-800/40 hover:bg-slate-700/30 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Icon className={`w-4 h-4 ${iconColor || 'text-slate-400'}`} />
          {title}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
}

export default function FullSavedRefactoringReportView({
  bundle,
  showDiff = false,
  onToggleDiff,
}: {
  bundle: SavedRefactoringReportBundle;
  showDiff?: boolean;
  onToggleDiff?: () => void;
}) {
  const applyResult = bundle.applyResult || {};
  const deltas = (applyResult.deltas as Record<string, unknown>) || {};
  const report =
    bundle.refactoringReport ||
    (applyResult.refactoringReport as RefactoringReportShape | undefined) ||
    null;
  const exportBase =
    bundle.filePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || 'refactoring-report';
  const language = bundle.filePath.endsWith('.java') ? 'java' : 'plaintext';
  const changes = applyResult.changes as
    | { added?: number; removed?: number; modified?: number; linesChanged?: number }
    | undefined;

  return (
    <div className="space-y-4">
      <div className="bg-cyan-950/30 border border-cyan-600/40 rounded-lg px-4 py-3 text-sm text-cyan-100">
        <p className="font-medium">Saved full report</p>
        <p className="text-xs text-cyan-200/80 mt-1">
          Archived {new Date(bundle.savedAt).toLocaleString()} — restores the complete review view without
          re-running refactoring.
        </p>
      </div>

      <RefactoringReportPanel
        report={report}
        exportBasename={`${exportBase}-report`}
        expandSectionsForPaper
        narrativeExtras={{ workspaceLabel: bundle.workspaceId, generatedAt: new Date(bundle.savedAt).toISOString() }}
      />

      {changes && (
        <div className="bg-slate-800/50 border border-slate-600 rounded-lg p-3 text-sm flex flex-wrap gap-4 items-center">
          <span className="text-white font-semibold flex items-center gap-1">
            <Code className="w-4 h-4 text-blue-400" />
            Line changes
          </span>
          <span className="text-green-400">+{changes.added ?? 0}</span>
          <span className="text-red-400">−{changes.removed ?? 0}</span>
          <span className="text-yellow-300">~{changes.modified ?? changes.linesChanged ?? 0}</span>
          {onToggleDiff && (
            <button
              type="button"
              onClick={onToggleDiff}
              className="ml-auto px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-md flex items-center gap-1"
            >
              <Eye className="w-3.5 h-3.5" />
              {showDiff ? 'Hide diff' : 'View diff'}
            </button>
          )}
        </div>
      )}

      {showDiff && (
        <Section title="Before / after diff" icon={Eye} iconColor="text-cyan-400" defaultOpen>
          <CodeComparisonMonacoDiff
            original={bundle.originalContent}
            modified={bundle.refactoredContent}
            language={language}
            height="min(50vh, 480px)"
          />
        </Section>
      )}

      {deltas && Object.keys(deltas).length > 0 && (
        <RefactoringVisualSummary
          deltas={deltas}
          improvementStats={bundle.improvementStats || undefined}
          researchMetrics={bundle.researchMetrics || undefined}
        />
      )}

      {deltas && (
        <Section title="Refactoring evidence & analysis" icon={Target} iconColor="text-blue-400">
          <RefactoringEvidencePanel
            deltas={deltas}
            steps={(applyResult.steps as never[]) || []}
            originalContent={bundle.originalContent}
            refactoredContent={bundle.refactoredContent}
            codeSmells={bundle.codeSmells || []}
            rejectionReasons={bundle.refactoringRejected?.rejectionReason || (applyResult.rejectionReason as never)}
            researchMetrics={(bundle.researchMetrics as never) || null}
            pipelineMetadata={(bundle.pipelineMetadata as never) || null}
          />
        </Section>
      )}

      {(deltas || bundle.improvementStats) && (
        <Section title="Metrics & charts" icon={TrendingUp} iconColor="text-green-400">
          <RefactoringMetricsCharts deltas={deltas} improvementStats={bundle.improvementStats || undefined} />
        </Section>
      )}

      {(bundle.researchMetrics || bundle.pipelineMetadata) && (
        <Section title="Research metrics (detailed)" icon={BarChart3} iconColor="text-purple-400" defaultOpen={false}>
          <ResearchMetricsPanel
            metrics={bundle.researchMetrics as never}
            pipelineMetadata={bundle.pipelineMetadata as never}
            exportContext={{ workspaceId: bundle.workspaceId, filePath: bundle.filePath }}
          />
        </Section>
      )}

      {applyResult.refactoredArtifactPath != null && (
        <p className="text-xs text-slate-500 font-mono break-all">
          Saved in project: {String(applyResult.refactoredArtifactPath)}
        </p>
      )}
    </div>
  );
}

