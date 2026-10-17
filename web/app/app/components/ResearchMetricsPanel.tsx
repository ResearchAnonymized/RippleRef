'use client';
import React, { useState } from 'react';
import {
  BarChart3, GitCompare, Shield, Cpu, Layers, Link2, Target,
  ChevronDown, TrendingDown, TrendingUp, Minus, Zap, Clock, Bug,
  CheckCircle2, XCircle, FileCode, Wrench, ListChecks, Download,
} from 'lucide-react';
import {
  buildResearchMetricsSheetCsv,
  defaultResearchMetricsSheetFilename,
  downloadResearchMetricsSheet,
} from '../lib/exportResearchMetricsCsv';

interface BeforeAfter {
  before: number; after: number; change: number;
  /** true = better, false = worse, null = neutral (structural counts) */
  improved: boolean | null;
}

interface ResearchMetricsProps {
  metrics: {
    meta?: {
      file?: string;
      verifyAccepted?: boolean;
      overallScore?: number;
      refactoringSuccessful?: boolean;
    };
    comparison?: Record<string, BeforeAfter>;
    code_smells?: {
      total?: BeforeAfter;
      improvement_percent?: number;
      reduced?: number;
      by_severity?: Record<string, BeforeAfter>;
    };
    quality?: {
      complexity?: BeforeAfter | Record<string, number>;
      maintainability?: BeforeAfter | Record<string, number>;
      lines_of_code?: BeforeAfter | Record<string, number>;
      methods?: BeforeAfter | Record<string, number>;
      testability?: BeforeAfter;
    };
    structural?: Record<string, number | boolean>;
    behavioral?: Record<string, boolean | undefined>;
    practices_applied?: string[];
    summary?: { key_achievements?: string[]; concerns?: string[] };
    deltas?: { before?: number; after?: number; improvement?: number };
    halstead?: Record<string, BeforeAfter>;
    method_lengths?: Record<string, BeforeAfter>;
    nesting_depth?: Record<string, BeforeAfter>;
    coupling?: Record<string, BeforeAfter>;
    cohesion?: Record<string, BeforeAfter>;
    diff_churn?: {
      lines_added: number; lines_removed: number; lines_modified: number;
      net_change: number; hunks: number; churn_rate_percent: number; total_changes: number;
    };
    semantic_preservation?: {
      overall_preservation_rate: number;
      classes?: { preservation_rate: number; removed: number; added: number };
      methods?: { preservation_rate: number; removed: number; added: number; removed_items?: string[] };
      fields?: { preservation_rate: number; removed: number; added: number };
    };
    token_efficiency?: {
      total_tokens: number; prompt_tokens: number; completion_tokens: number;
      cost_usd: number; meaningful_line_changes: number;
      changes_per_1k_tokens: number; cost_per_change_usd: number;
    };
    smell_resolution?: {
      by_type: Record<string, {
        before: number; after: number; resolved: number;
        introduced: number; net_change: number; resolution_rate: number;
      }>;
      total_before: number; total_after: number; total_resolved: number;
      overall_resolution_rate: number;
      types_fully_eliminated: number; types_with_regression: number;
    };
  } | null;
  pipelineMetadata?: {
    retryCount?: number;
    model?: string;
    rejectionCategory?: string;
  } | null;
  /** Used for CSV / Sheets export filenames and columns */
  exportContext?: { workspaceId?: string; filePath?: string };
}

const COMPARISON_LABELS: Record<string, { label: string; inverse?: boolean; unit?: string }> = {
  pmd_smell_total: { label: 'PMD smell total', inverse: true },
  complexity: { label: 'Cyclomatic complexity', inverse: true },
  maintainability: { label: 'Maintainability index' },
  testability: { label: 'Testability score' },
  lines_of_code: { label: 'Lines of code', inverse: true },
  method_count: { label: 'Method count' },
  smells_critical: { label: 'Critical smells', inverse: true },
  smells_major: { label: 'Major smells', inverse: true },
  smells_minor: { label: 'Minor smells', inverse: true },
  smells_info: { label: 'Info smells', inverse: true },
  smells_other: { label: 'Other smells', inverse: true },
};

/** Primary comparison keys (quality + size); severity keys shown in a sub-block below. */
const CORE_COMPARISON_KEYS = [
  'pmd_smell_total',
  'complexity',
  'maintainability',
  'testability',
  'lines_of_code',
  'method_count',
] as const;

const SMELL_SEVERITY_KEYS = [
  'smells_critical',
  'smells_major',
  'smells_minor',
  'smells_info',
  'smells_other',
] as const;

function DeltaArrow({ val, improved }: { val: number; improved: boolean | null }) {
  if (val === 0) return <Minus className="w-3 h-3 text-slate-500 inline" />;
  if (improved === null) {
    return val < 0
      ? <TrendingDown className="w-3 h-3 text-slate-400 inline" />
      : <TrendingUp className="w-3 h-3 text-slate-400 inline" />;
  }
  return improved
    ? <TrendingDown className="w-3 h-3 text-green-400 inline" />
    : <TrendingUp className="w-3 h-3 text-red-400 inline" />;
}

function MetricCard({ title, icon: Icon, children, defaultOpen }: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-700/30 transition-colors">
        <Icon className="w-4 h-4 text-blue-400 flex-shrink-0" />
        <span className="text-xs font-semibold text-white uppercase tracking-wider flex-1">{title}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-3 pb-3 border-t border-slate-700/50">{children}</div>}
    </div>
  );
}

function BARow({ label, data, unit }: {
  label: string; data?: BeforeAfter; unit?: string;
}) {
  if (!data) return null;
  const u = unit || '';
  const neutral = data.change === 0;
  const informational = data.improved === null && !neutral;
  return (
    <tr className="border-t border-slate-700/30">
      <td className="py-1.5 px-2 text-slate-400 text-xs">{label}</td>
      <td className="py-1.5 px-2 text-xs font-mono text-slate-300 text-right">{data.before}{u}</td>
      <td className="py-1.5 px-2 text-xs font-mono text-right">
        <span className={
          neutral ? 'text-slate-400'
            : informational ? 'text-slate-300'
            : data.improved ? 'text-green-400' : 'text-red-400'
        }>
          {data.after}{u}
        </span>
      </td>
      <td className="py-1.5 px-2 text-xs font-mono text-right">
        <DeltaArrow val={data.change} improved={data.improved} />
        <span className={`ml-1 ${
          neutral ? 'text-slate-500'
            : informational ? 'text-slate-400'
            : data.improved ? 'text-green-400' : 'text-red-400'
        }`}>
          {data.change > 0 ? '+' : ''}{typeof data.change === 'number' ? (Number.isInteger(data.change) ? data.change : data.change.toFixed(1)) : data.change}{u}
        </span>
      </td>
    </tr>
  );
}

function BATable({ children }: { children: React.ReactNode }) {
  return (
    <table className="w-full text-xs mt-2">
      <thead>
        <tr className="text-slate-500">
          <th className="text-left py-1 px-2 font-medium">Metric</th>
          <th className="text-right py-1 px-2 font-medium">Before</th>
          <th className="text-right py-1 px-2 font-medium">After</th>
          <th className="text-right py-1 px-2 font-medium">Change</th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function SectionLabelRow({ label }: { label: string }) {
  return (
    <tr className="border-t border-slate-600/50 bg-slate-800/40">
      <td colSpan={4} className="py-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </td>
    </tr>
  );
}

function hasBeforeAfterGroup(obj?: Record<string, BeforeAfter | undefined>): boolean {
  if (!obj) return false;
  return Object.values(obj).some(
    (d) => d && (d.before !== 0 || d.after !== 0 || d.change !== 0)
  );
}

function ComparisonRows({ comparison }: { comparison: Record<string, BeforeAfter> }) {
  const renderKey = (key: string) => {
    const data = comparison[key];
    if (!data) return null;
    const cfg = COMPARISON_LABELS[key] || { label: key.replace(/_/g, ' '), inverse: false };
    return <BARow key={key} label={cfg.label} data={data} unit={cfg.unit} />;
  };

  const hasSeverity = SMELL_SEVERITY_KEYS.some((k) => comparison[k]);

  return (
    <BATable>
      <SectionLabelRow label="Quality & size" />
      {CORE_COMPARISON_KEYS.map(renderKey)}
      {hasSeverity && (
        <>
          <SectionLabelRow label="Smell severity (PMD)" />
          {SMELL_SEVERITY_KEYS.map(renderKey)}
        </>
      )}
    </BATable>
  );
}

export default function ResearchMetricsPanel({ metrics, pipelineMetadata, exportContext }: ResearchMetricsProps) {
  if (!metrics) return null;

  const exportToSheets = () => {
    const iso = new Date().toISOString();
    const filePath = exportContext?.filePath ?? metrics.meta?.file ?? 'file';
    const csv = buildResearchMetricsSheetCsv({
      workspaceId: exportContext?.workspaceId,
      filePath,
      exportedAtIso: iso,
      metrics,
      pipelineMetadata,
    });
    downloadResearchMetricsSheet(defaultResearchMetricsSheetFilename(filePath, iso), csv);
  };

  const {
    meta, comparison, structural, behavioral,
    practices_applied, summary,
    halstead, method_lengths, nesting_depth, coupling, cohesion,
    diff_churn, semantic_preservation, token_efficiency, smell_resolution,
  } = metrics;

  const pmd = comparison?.pmd_smell_total;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <p className="text-[10px] text-slate-500 italic flex-1 min-w-[200px]">
          Computed before/after metrics from static analysis and refactor verification. Expand sections for specialized measures only.
        </p>
        <button
          type="button"
          onClick={exportToSheets}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30 transition-colors shrink-0"
          title="Download CSV for Excel or Google Sheets"
        >
          <Download className="w-3.5 h-3.5" />
          Export to Sheets (CSV)
        </button>
      </div>

      {meta && (
        <div className="flex flex-wrap gap-2 mb-3 text-xs">
          {meta.verifyAccepted !== undefined && (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded ${meta.verifyAccepted ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
              {meta.verifyAccepted ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              Verify {meta.verifyAccepted ? 'accepted' : 'rejected'}
            </span>
          )}
          {typeof meta.overallScore === 'number' && (
            <span className="px-2 py-1 rounded bg-slate-700/50 text-slate-300">
              Score: {meta.overallScore.toFixed(1)}/100
            </span>
          )}
          {pmd && (
            <span className="px-2 py-1 rounded bg-slate-700/50 text-slate-300">
              Smells: {pmd.before} → {pmd.after}
              {pmd.change !== 0 && (
                <span className={pmd.improved ? 'text-green-400 ml-1' : 'text-red-400 ml-1'}>
                  ({pmd.change > 0 ? '+' : ''}{pmd.change})
                </span>
              )}
            </span>
          )}
        </div>
      )}

      {comparison && Object.keys(comparison).length > 0 && (
        <MetricCard title="Before / After (computed)" icon={ListChecks} defaultOpen>
          <ComparisonRows comparison={comparison} />
        </MetricCard>
      )}

      {behavioral && Object.entries(behavioral).some(([, v]) => v !== undefined) && (
        <MetricCard title="Behavioral Checks" icon={Shield}>
          <ul className="mt-2 space-y-1 text-xs">
            {Object.entries(behavioral)
              .filter(([, v]) => v !== undefined)
              .map(([k, ok]) => (
                <li key={k} className="flex items-center gap-2 text-slate-300">
                  {ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                  <span>{k.replace(/_/g, ' ')}</span>
                </li>
              ))}
          </ul>
        </MetricCard>
      )}

      {structural && Object.values(structural).some((v) => v === true || (typeof v === 'number' && v > 0)) && (
        <MetricCard title="Structural Changes" icon={Wrench}>
          <ul className="mt-2 space-y-1 text-xs text-slate-300">
            {!!structural.methods_extracted && <li>Methods extracted: {String(structural.methods_extracted)}</li>}
            {!!structural.methods_renamed && <li>Methods renamed: {String(structural.methods_renamed)}</li>}
            {!!structural.classes_split && <li>Classes split: {String(structural.classes_split)}</li>}
            {structural.duplicate_code_removed ? <li>Duplicate code removed</li> : null}
            {structural.naming_improved ? <li>Naming improved</li> : null}
          </ul>
        </MetricCard>
      )}

      {practices_applied && practices_applied.length > 0 && (
        <MetricCard title="Practices Applied" icon={ListChecks}>
          <ul className="mt-2 list-disc list-inside text-xs text-slate-300">
            {practices_applied.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </MetricCard>
      )}

      {summary && ((summary.key_achievements?.length ?? 0) > 0 || (summary.concerns?.length ?? 0) > 0) && (
        <MetricCard title="Narrative Summary" icon={FileCode}>
          {summary.key_achievements && summary.key_achievements.length > 0 && (
            <div className="mt-2">
              <SummaryHeading title="Achievements" color="text-green-400" />
              <ul className="list-disc list-inside text-xs text-slate-400 mt-1">
                {summary.key_achievements.map((item, i) => <li key={`a-${i}`}>{item}</li>)}
              </ul>
            </div>
          )}
          {summary.concerns && summary.concerns.length > 0 && (
            <div className="mt-2">
              <SummaryHeading title="Concerns" color="text-amber-400" />
              <ul className="list-disc list-inside text-xs text-slate-400 mt-1">
                {summary.concerns.map((item, i) => <li key={`c-${i}`}>{item}</li>)}
              </ul>
            </div>
          )}
        </MetricCard>
      )}

      {hasBeforeAfterGroup(halstead) && (
        <MetricCard title="Halstead Complexity" icon={Cpu}>
          <BATable>
            <BARow label="Volume" data={halstead?.volume} />
            <BARow label="Difficulty" data={halstead?.difficulty} />
            <BARow label="Effort" data={halstead?.effort} />
            <BARow label="Est. Bugs" data={halstead?.estimated_bugs} />
            <BARow label="Vocabulary" data={halstead?.vocabulary} />
          </BATable>
        </MetricCard>
      )}

      {hasBeforeAfterGroup(method_lengths) && (
        <MetricCard title="Method Length Distribution" icon={BarChart3}>
          <BATable>
            <BARow label="Count" data={method_lengths?.count} />
            <BARow label="Mean Length" data={method_lengths?.mean} unit=" lines" />
            <BARow label="Median Length" data={method_lengths?.median} unit=" lines" />
            <BARow label="Max Length" data={method_lengths?.max} unit=" lines" />
            <BARow label="Std Dev" data={method_lengths?.stdev} />
          </BATable>
        </MetricCard>
      )}

      {hasBeforeAfterGroup(nesting_depth) && (
        <MetricCard title="Nesting Depth" icon={Layers}>
          <BATable>
            <BARow label="Max Depth" data={nesting_depth?.max} />
            <BARow label="Avg Depth" data={nesting_depth?.average} />
            <BARow label="Deep Nests (>3)" data={nesting_depth?.deep_nests} />
          </BATable>
        </MetricCard>
      )}

      {hasBeforeAfterGroup(coupling) && (
        <MetricCard title="Coupling (CBO)" icon={Link2}>
          <BATable>
            <BARow label="CBO (External Types)" data={coupling?.cbo} />
            <BARow label="Import Count" data={coupling?.import_count} />
            <BARow label="Type References" data={coupling?.type_references} />
          </BATable>
        </MetricCard>
      )}

      {hasBeforeAfterGroup(cohesion) && (
        <MetricCard title="Cohesion (LCOM)" icon={Target}>
          <BATable>
            <BARow label="LCOM Score" data={cohesion?.lcom} />
            <BARow label="Methods" data={cohesion?.methods} />
            <BARow label="Fields" data={cohesion?.fields} />
          </BATable>
        </MetricCard>
      )}

      {diff_churn && (diff_churn.lines_added > 0 || diff_churn.lines_removed > 0 || diff_churn.hunks > 0) && (
        <MetricCard title="Diff Churn" icon={GitCompare}>
          <div className="grid grid-cols-4 gap-2 mt-2">
            <div className="text-center">
              <div className="text-lg font-bold text-green-400">+{diff_churn.lines_added}</div>
              <div className="text-[10px] text-slate-500">Added</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-400">-{diff_churn.lines_removed}</div>
              <div className="text-[10px] text-slate-500">Removed</div>
            </div>
            <StatCell value={String(diff_churn.hunks)} label="Hunks" color="text-amber-400" />
            <StatCell value={`${diff_churn.churn_rate_percent}%`} label="Churn Rate" color="text-blue-400" />
          </div>
        </MetricCard>
      )}

      {semantic_preservation && (
        <MetricCard title="Semantic Preservation" icon={Shield}>
          <div className="mt-2 flex items-center gap-3">
            <div className={`text-2xl font-bold ${
              semantic_preservation.overall_preservation_rate >= 90 ? 'text-green-400' :
              semantic_preservation.overall_preservation_rate >= 70 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {semantic_preservation.overall_preservation_rate}%
            </div>
            <div className="text-xs text-slate-400">Public API preserved</div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
            {semantic_preservation.classes && (
              <div className="text-center bg-slate-800/50 rounded p-1.5">
                <div className="font-bold text-slate-300">{semantic_preservation.classes.preservation_rate}%</div>
                <StatLabel label="Classes" />
              </div>
            )}
            {semantic_preservation.methods && (
              <div className="text-center bg-slate-800/50 rounded p-1.5">
                <div className="font-bold text-slate-300">{semantic_preservation.methods.preservation_rate}%</div>
                <StatLabel label="Methods" />
              </div>
            )}
            {semantic_preservation.fields && (
              <div className="text-center bg-slate-800/50 rounded p-1.5">
                <div className="font-bold text-slate-300">{semantic_preservation.fields.preservation_rate}%</div>
                <StatLabel label="Fields" />
              </div>
            )}
          </div>
          {semantic_preservation.methods?.removed_items && semantic_preservation.methods.removed_items.length > 0 && (
            <div className="mt-2 text-[10px] text-red-400">
              Removed: {semantic_preservation.methods.removed_items.slice(0, 3).join(', ')}
            </div>
          )}
        </MetricCard>
      )}

      {token_efficiency && token_efficiency.total_tokens > 0 && (
        <MetricCard title="Token Efficiency" icon={Zap}>
          <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
            <StatCell value={token_efficiency.total_tokens.toLocaleString()} label="Total Tokens" color="text-blue-400" />
            <StatCell value={String(token_efficiency.changes_per_1k_tokens)} label="Changes/1K Tokens" color="text-green-400" />
            <StatCell value={`$${token_efficiency.cost_usd.toFixed(4)}`} label="Total Cost" color="text-amber-400" />
          </div>
        </MetricCard>
      )}

      {smell_resolution && smell_resolution.total_before > 0 && Object.keys(smell_resolution.by_type || {}).length > 0 && (
        <MetricCard title="Smell Resolution by Type" icon={Bug}>
          <div className="flex items-center gap-3 mt-2 mb-2">
            <div className={`text-2xl font-bold ${
              smell_resolution.overall_resolution_rate > 10 ? 'text-green-400' :
              smell_resolution.overall_resolution_rate > 0 ? 'text-amber-400' : 'text-slate-400'
            }`}>
              {smell_resolution.overall_resolution_rate}%
            </div>
            <SmellResolutionSummary sr={smell_resolution} />
          </div>
          <div className="overflow-x-auto rounded border border-slate-700/50">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 bg-slate-800/80">
                  <th className="text-left py-1.5 px-2 font-medium">Smell Type</th>
                  <th className="text-right py-1.5 px-2 font-medium">Before</th>
                  <th className="text-right py-1.5 px-2 font-medium">After</th>
                  <th className="text-right py-1.5 px-2 font-medium">Resolved</th>
                  <th className="text-right py-1.5 px-2 font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(smell_resolution.by_type)
                  .sort(([, a], [, b]) => b.resolution_rate - a.resolution_rate)
                  .map(([type, data]) => (
                    <tr key={type} className={`border-t border-slate-700/30 ${
                      data.net_change < 0 ? 'bg-green-500/5' : data.net_change > 0 ? 'bg-red-500/5' : ''
                    }`}>
                      <td className="py-1 px-2 text-amber-300">{type}</td>
                      <td className="py-1 px-2 text-right font-mono text-slate-400">{data.before}</td>
                      <td className="py-1 px-2 text-right font-mono">
                        <span className={data.net_change < 0 ? 'text-green-400' : data.net_change > 0 ? 'text-red-400' : 'text-slate-400'}>
                          {data.after}
                        </span>
                      </td>
                      <td className="py-1 px-2 text-right font-mono text-green-400">
                        {data.resolved > 0 ? `+${data.resolved}` : '—'}
                      </td>
                      <td className="py-1 px-2 text-right font-mono">
                        <span className={data.resolution_rate > 0 ? 'text-green-400' : 'text-slate-500'}>
                          {data.resolution_rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </MetricCard>
      )}

      {pipelineMetadata && (
        <MetricCard title="Pipeline Metadata" icon={Clock}>
          <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
            <StatCell value={String(pipelineMetadata.retryCount ?? 0)} label="Retries" color="text-blue-400" />
            <div className="text-center bg-slate-800/50 rounded p-1.5">
              <div className="font-bold text-slate-300 text-[10px] truncate">{pipelineMetadata.model || '—'}</div>
              <StatLabel label="Model" />
            </div>
            {pipelineMetadata.rejectionCategory && (
              <div className="text-center bg-red-500/10 rounded p-1.5">
                <div className="font-bold text-red-400 text-[10px]">{pipelineMetadata.rejectionCategory}</div>
                <StatLabel label="Rejection" />
              </div>
            )}
          </div>
        </MetricCard>
      )}
    </div>
  );
}

function SummaryHeading({ title, color }: { title: string; color: string }) {
  return <div className={`text-[10px] font-semibold uppercase ${color}`}>{title}</div>;
}

function StatLabel({ label }: { label: string }) {
  return <div className="text-[10px] text-slate-500">{label}</div>;
}

function StatCell({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <StatLabel label={label} />
    </div>
  );
}

function SmellResolutionSummary({ sr }: { sr: NonNullable<ResearchMetricsProps['metrics']>['smell_resolution'] }) {
  if (!sr) return null;
  return (
    <div className="text-xs text-slate-400">
      {sr.total_resolved} of {sr.total_before} smells resolved
      {sr.types_fully_eliminated > 0 && (
        <span className="text-green-400 ml-1">({sr.types_fully_eliminated} types eliminated)</span>
      )}
    </div>
  );
}
