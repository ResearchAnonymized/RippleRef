'use client';

import React, { useState } from 'react';
import {
  CheckCircle, XCircle, AlertTriangle, BarChart3, Shield, GitBranch,
  ChevronDown, ChevronUp, ArrowRight, Minus, TrendingDown, TrendingUp,
  FileCode, Layers, BookOpen, GitCompare, Zap, Clock, Bug, Cpu, Link2, Target
} from 'lucide-react';

interface BeforeAfter {
  before: number; after: number; change: number; improved: boolean | null;
}

interface EvidencePanelProps {
  deltas: any;
  steps?: any[];
  originalContent?: string;
  refactoredContent?: string;
  codeSmells?: any[];
  improvementStats?: {
    before?: { total: number; critical: number; major: number; minor: number };
    after?: { total: number; critical: number; major: number; minor: number };
  } | null;
  rejectionReasons?: string | string[] | null;
  researchMetrics?: {
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
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : Number(n.toFixed(1)).toString();
}

function MetricRow({ label, before, after, unit, lowerIsBetter, neutral }: {
  label: string; before: number; after: number; unit?: string;
  lowerIsBetter?: boolean; neutral?: boolean;
}) {
  const diff = after - before;
  const unchanged = Math.abs(diff) < 0.05;
  const improved = neutral ? null : (lowerIsBetter ? diff < 0 : diff > 0);
  return (
    <tr className="border-b border-slate-700/50 last:border-0">
      <td className="py-2.5 px-3 text-sm text-slate-300 font-medium">{label}</td>
      <td className="py-2.5 px-3 text-sm text-slate-400 text-center font-mono">{fmt(before)}{unit || ''}</td>
      <td className="py-2.5 px-3 text-center">
        <ArrowRight className="w-3.5 h-3.5 text-slate-500 inline" />
      </td>
      <td className="py-2.5 px-3 text-sm text-center font-mono font-semibold">
        <span className={
          unchanged ? 'text-slate-400'
            : improved === null ? 'text-slate-300'
            : improved ? 'text-green-400' : 'text-orange-400'
        }>
          {fmt(after)}{unit || ''}
        </span>
      </td>
      <td className="py-2.5 px-3 text-center">
        {unchanged ? (
          <span className="text-xs text-slate-500 flex items-center justify-center gap-1">
            <Minus className="w-3 h-3" /> No change
          </span>
        ) : improved === null ? (
          <span className="text-xs text-slate-400 flex items-center justify-center gap-1">
            {diff < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
            {diff > 0 ? '+' : ''}{fmt(diff)}{unit || ''}
          </span>
        ) : improved ? (
          <span className="text-xs text-green-400 flex items-center justify-center gap-1">
            {lowerIsBetter ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
            {lowerIsBetter ? '' : '+'}{fmt(diff)}{unit || ''} improved
          </span>
        ) : (
          <span className="text-xs text-orange-400 flex items-center justify-center gap-1">
            {lowerIsBetter ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {diff > 0 ? '+' : ''}{fmt(diff)}{unit || ''}
          </span>
        )}
      </td>
    </tr>
  );
}

function SectionHeader({ icon: Icon, title, color, badge }: {
  icon: any; title: string; color: string; badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h4 className="text-white font-semibold flex items-center gap-2">
        <Icon className={`w-4.5 h-4.5 ${color}`} />
        {title}
      </h4>
      {badge}
    </div>
  );
}

export default function RefactoringEvidencePanel({ deltas, steps, originalContent, refactoredContent, codeSmells, improvementStats, rejectionReasons, researchMetrics, pipelineMetadata }: EvidencePanelProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    metrics: false, traceability: false, behavioral: false, practices: false
  });

  const analysis = deltas?.comprehensiveAnalysis;
  const qm = deltas?.qualityMetrics;

  if (!analysis && !qm) {
    return null;
  }

  const toggle = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const summary = analysis?.summary || {};
  const improvements = analysis?.improvements || {};
  const behavioral = analysis?.behavioral_correctness || {};
  const practices = analysis?.refactoring_practices || {};
  const metrics = analysis?.metrics || {};

  const overallScore = summary.overall_score ?? 0;
  const verifyAccepted = deltas?.verifyAccepted === true;
  const verifyRejected = deltas?.verifyAccepted === false;
  const isSuccessful = verifyAccepted || (!verifyRejected && summary.refactoring_successful !== false);

  const smellPlan = steps?.find((s: any) => s.name === 'Smell Analysis');
  const planItems = smellPlan?.details?.plan || [];

  const scoreColor = overallScore >= 70 ? 'text-green-400' : overallScore >= 40 ? 'text-yellow-400' : 'text-red-400';
  const scoreBg = overallScore >= 70 ? 'bg-green-500/10 border-green-500/30' : overallScore >= 40 ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-red-500/10 border-red-500/30';

  return (
    <div className="space-y-4">
      {/* Overall Score Banner */}
      <div className={`rounded-xl border p-5 ${scoreBg}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">Refactoring Quality Score</div>
            <div className={`text-4xl font-bold ${scoreColor}`}>{overallScore.toFixed(1)}<span className="text-lg text-slate-500">/100</span></div>
          </div>
          <div className="text-right">
            <div className={`flex items-center gap-2 text-sm font-medium ${isSuccessful ? 'text-green-400' : 'text-red-400'}`}>
              {isSuccessful ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
              {isSuccessful ? 'Refactoring Accepted' : 'Refactoring Rejected'}
            </div>
            {summary.key_achievements?.length > 0 && (
              <div className="text-xs text-slate-500 mt-1">{summary.key_achievements.length} improvements verified</div>
            )}
          </div>
        </div>
        {summary.key_achievements?.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-700/50">
            <div className="flex flex-wrap gap-2">
              {summary.key_achievements.map((a: string, i: number) => (
                <span key={i} className="text-xs bg-green-500/15 text-green-400 px-2.5 py-1 rounded-full border border-green-500/20">
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}
        {/* Advisory: heuristic behavioral notes when verify passed but analysis flagged items */}
        {isSuccessful && summary.concerns?.length > 0 && (
          <div className="mt-3 pt-3 border-t border-amber-500/30">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">Review recommended</span>
            </div>
            <div className="space-y-1.5">
              {summary.concerns.map((concern: string, i: number) => (
                <div key={i} className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 text-xs text-amber-200/90">
                  {concern}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Rejection Reasons + Concerns — unified "Why Rejected" section */}
        {!isSuccessful && (rejectionReasons || summary.concerns?.length > 0) && (() => {
          const explanations: Record<string, string> = {
            'no_smell_reduction': 'The static analyzer detected the same number of code smells before and after refactoring. The LLM made structural changes, but they did not eliminate the specific patterns the detector flags.',
            'too_similar':
              'The refactored text is ≥99.5% similar to the original after normalizing whitespace—usually comments, formatting, or a one-line tweak. The run is rejected unless PMD smell count actually drops. Compare the diff tab; metrics (smells, maintainability) are computed separately from this similarity check.',
            'empty_catch': 'The refactored code contains empty catch blocks, which suppress errors silently.',
            'api_broken': 'Public method signatures were changed, which would break callers of this class.',
            'methods_lost': 'Too many methods were removed compared to the original, indicating possible code loss.',
            'size_change': 'The file size changed dramatically (more than 2.5x larger or less than 40% of original).',
            'IDENTICAL_CODE': 'The LLM returned exactly the same code as the input after multiple retries.',
            'Method signatures changed': 'Public method signatures were altered, which may break callers depending on this class. Behavioral preservation requires keeping the same public API.',
            'Conditional logic changed': 'If/else or switch logic was restructured. This can change the execution path and produce different results for the same inputs.',
            'Exception handling changed': 'Try/catch blocks or thrown exceptions were modified. This can change how errors propagate and are handled by callers.',
            'Return types changed': 'Return types of methods were modified. This breaks the contract between this class and its callers.',
            'Framework contracts changed': 'Annotations, implemented interfaces, or framework-specific patterns were altered, which may break runtime behavior.',
          };
          const reasonItems = rejectionReasons
            ? (Array.isArray(rejectionReasons) ? rejectionReasons : [rejectionReasons])
            : [];
          const concernItems = (summary.concerns || []).filter(
            (c: string) => !reasonItems.some(r => r.toLowerCase().includes(c.toLowerCase()))
          );
          return (
            <div className="mt-3 pt-3 border-t border-red-500/30">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs font-semibold text-red-300 uppercase tracking-wider">Why Rejected</span>
              </div>
              <div className="space-y-1.5">
                {reasonItems.map((reason, i) => {
                  const reasonKey = reason.split('(')[0].trim();
                  const explanation = explanations[reasonKey];
                  return (
                    <div key={`r-${i}`} className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                      <div className="text-xs font-mono text-red-300">{reason}</div>
                      {explanation && <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{explanation}</p>}
                    </div>
                  );
                })}
                {concernItems.map((concern: string, i: number) => {
                  const explanation = explanations[concern];
                  return (
                    <div key={`c-${i}`} className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                      <div className="text-xs text-red-300 font-medium">{concern}</div>
                      {explanation && <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{explanation}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Section 1: Before/After Metrics Table */}
      <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 overflow-hidden">
        <button onClick={() => toggle('metrics')} className="w-full flex items-center justify-between p-4 hover:bg-slate-700/30 transition-colors">
          <SectionHeader icon={BarChart3} title="Before / After Metrics Comparison" color="text-blue-400" />
          {expandedSections.metrics ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {expandedSections.metrics && (
          <div className="px-4 pb-4">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-600">
                  <th className="py-2 px-3 text-left text-xs text-slate-500 uppercase tracking-wider">Metric</th>
                  <th className="py-2 px-3 text-center text-xs text-slate-500 uppercase tracking-wider">Before</th>
                  <th className="py-2 px-3 text-center text-xs text-slate-500 uppercase tracking-wider w-8"></th>
                  <th className="py-2 px-3 text-center text-xs text-slate-500 uppercase tracking-wider">After</th>
                  <th className="py-2 px-3 text-center text-xs text-slate-500 uppercase tracking-wider">Change</th>
                </tr>
              </thead>
              <tbody>
                <MetricRow
                  label="Code Smells (verify step)"
                  before={
                    improvementStats?.before?.total ??
                    deltas?.before ??
                    improvements.code_smells?.before ??
                    0
                  }
                  after={
                    improvementStats?.after?.total ??
                    deltas?.after ??
                    improvements.code_smells?.after ??
                    0
                  }
                  lowerIsBetter
                />
                {(qm?.before || metrics.complexity) && (
                  <MetricRow
                    label="Cyclomatic Complexity"
                    before={qm?.before?.complexity ?? metrics.complexity?.before ?? 0}
                    after={qm?.after?.complexity ?? metrics.complexity?.after ?? 0}
                    lowerIsBetter
                  />
                )}
                {(qm?.before || metrics.maintainability) && (
                  <MetricRow
                    label="Maintainability Index"
                    before={qm?.before?.maintainability ?? metrics.maintainability?.before ?? 0}
                    after={qm?.after?.maintainability ?? metrics.maintainability?.after ?? 0}
                  />
                )}
                {(qm?.before?.testability != null || metrics.testability) && (
                  <MetricRow
                    label="Testability Score"
                    before={qm?.before?.testability ?? metrics.testability?.before ?? 0}
                    after={qm?.after?.testability ?? metrics.testability?.after ?? 0}
                  />
                )}
                {metrics.lines_of_code && (
                  <MetricRow
                    label="Lines of Code"
                    before={metrics.lines_of_code.before}
                    after={metrics.lines_of_code.after}
                    lowerIsBetter
                  />
                )}
                {metrics.methods && (
                  <MetricRow
                    label="Method Count"
                    before={metrics.methods.before}
                    after={metrics.methods.after}
                  />
                )}

                {/* ── Research Metrics: Halstead ── */}
                {researchMetrics?.halstead?.volume && (
                  <>
                    <tr><td colSpan={5} className="pt-3 pb-1 px-3"><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Cpu className="w-3 h-3" /> Halstead Complexity</span></td></tr>
                    <MetricRow label="  Volume" before={researchMetrics.halstead.volume.before} after={researchMetrics.halstead.volume.after} lowerIsBetter />
                    {researchMetrics.halstead.difficulty && <MetricRow label="  Difficulty" before={researchMetrics.halstead.difficulty.before} after={researchMetrics.halstead.difficulty.after} lowerIsBetter />}
                    {researchMetrics.halstead.effort && <MetricRow label="  Effort" before={researchMetrics.halstead.effort.before} after={researchMetrics.halstead.effort.after} lowerIsBetter />}
                    {researchMetrics.halstead.estimated_bugs && <MetricRow label="  Est. Bugs" before={researchMetrics.halstead.estimated_bugs.before} after={researchMetrics.halstead.estimated_bugs.after} lowerIsBetter />}
                  </>
                )}

                {/* ── Research Metrics: Method Length Distribution ── */}
                {researchMetrics?.method_lengths?.mean && (
                  <>
                    <tr><td colSpan={5} className="pt-3 pb-1 px-3"><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><BarChart3 className="w-3 h-3" /> Method Length Distribution</span></td></tr>
                    {researchMetrics.method_lengths.count && <MetricRow label="  Method Count" before={researchMetrics.method_lengths.count.before} after={researchMetrics.method_lengths.count.after} />}
                    <MetricRow label="  Mean Length" before={researchMetrics.method_lengths.mean.before} after={researchMetrics.method_lengths.mean.after} lowerIsBetter />
                    {researchMetrics.method_lengths.max && <MetricRow label="  Max Length" before={researchMetrics.method_lengths.max.before} after={researchMetrics.method_lengths.max.after} lowerIsBetter />}
                    {researchMetrics.method_lengths.stdev && <MetricRow label="  Std Dev" before={researchMetrics.method_lengths.stdev.before} after={researchMetrics.method_lengths.stdev.after} lowerIsBetter />}
                  </>
                )}

                {/* ── Research Metrics: Nesting Depth ── */}
                {researchMetrics?.nesting_depth?.max && (
                  <>
                    <tr><td colSpan={5} className="pt-3 pb-1 px-3"><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Layers className="w-3 h-3" /> Nesting Depth</span></td></tr>
                    <MetricRow label="  Max Depth" before={researchMetrics.nesting_depth.max.before} after={researchMetrics.nesting_depth.max.after} lowerIsBetter />
                    {researchMetrics.nesting_depth.average && <MetricRow label="  Avg Depth" before={researchMetrics.nesting_depth.average.before} after={researchMetrics.nesting_depth.average.after} lowerIsBetter />}
                    {researchMetrics.nesting_depth.deep_nests && <MetricRow label="  Deep Nests (>3)" before={researchMetrics.nesting_depth.deep_nests.before} after={researchMetrics.nesting_depth.deep_nests.after} lowerIsBetter />}
                  </>
                )}

                {/* ── Research Metrics: Coupling (CBO) ── */}
                {researchMetrics?.coupling?.cbo && (
                  <>
                    <tr><td colSpan={5} className="pt-3 pb-1 px-3"><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Link2 className="w-3 h-3" /> Coupling (CBO)</span></td></tr>
                    <MetricRow label="  CBO" before={researchMetrics.coupling.cbo.before} after={researchMetrics.coupling.cbo.after} lowerIsBetter />
                    {researchMetrics.coupling.import_count && <MetricRow label="  Import Count" before={researchMetrics.coupling.import_count.before} after={researchMetrics.coupling.import_count.after} lowerIsBetter />}
                    {researchMetrics.coupling.type_references && <MetricRow label="  Type References" before={researchMetrics.coupling.type_references.before} after={researchMetrics.coupling.type_references.after} lowerIsBetter />}
                  </>
                )}

                {/* ── Research Metrics: Cohesion (LCOM) ── */}
                {researchMetrics?.cohesion?.lcom && (
                  <>
                    <tr><td colSpan={5} className="pt-3 pb-1 px-3"><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Target className="w-3 h-3" /> Cohesion (LCOM)</span></td></tr>
                    <MetricRow label="  LCOM Score" before={researchMetrics.cohesion.lcom.before} after={researchMetrics.cohesion.lcom.after} lowerIsBetter />
                    {researchMetrics.cohesion.methods && (
                      <MetricRow label="  Methods" before={researchMetrics.cohesion.methods.before} after={researchMetrics.cohesion.methods.after} neutral />
                    )}
                    {researchMetrics.cohesion.fields && (
                      <MetricRow label="  Fields" before={researchMetrics.cohesion.fields.before} after={researchMetrics.cohesion.fields.after} neutral />
                    )}
                  </>
                )}
              </tbody>
            </table>

            {improvements.code_smells?.improvement_percent != null && improvements.code_smells.improvement_percent > 0 && (
              <div className="mt-3 p-2.5 bg-green-500/10 border border-green-500/20 rounded-lg text-center">
                <span className="text-green-400 text-sm font-semibold">
                  {improvements.code_smells.improvement_percent.toFixed(1)}% smell reduction achieved
                </span>
              </div>
            )}

            {/* ── Single-value Research Metrics Cards ── */}
            {researchMetrics && (researchMetrics.diff_churn || researchMetrics.semantic_preservation || researchMetrics.token_efficiency || researchMetrics.smell_resolution) && (
              <div className="mt-4 space-y-3">

                {/* Diff Churn */}
                {researchMetrics.diff_churn && (
                  <div className="bg-slate-900/50 rounded-lg border border-slate-700/40 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <GitCompare className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-xs font-semibold text-white uppercase tracking-wider">Diff Churn</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="text-center">
                        <div className="text-lg font-bold text-green-400">+{researchMetrics.diff_churn.lines_added}</div>
                        <div className="text-[10px] text-slate-500">Added</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-red-400">-{researchMetrics.diff_churn.lines_removed}</div>
                        <div className="text-[10px] text-slate-500">Removed</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-amber-400">{researchMetrics.diff_churn.hunks}</div>
                        <div className="text-[10px] text-slate-500">Hunks</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-blue-400">{researchMetrics.diff_churn.churn_rate_percent}%</div>
                        <div className="text-[10px] text-slate-500">Churn Rate</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Semantic Preservation */}
                {researchMetrics.semantic_preservation && (
                  <div className="bg-slate-900/50 rounded-lg border border-slate-700/40 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Shield className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-xs font-semibold text-white uppercase tracking-wider">Semantic Preservation</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={`text-3xl font-bold ${
                        researchMetrics.semantic_preservation.overall_preservation_rate >= 90 ? 'text-green-400' :
                        researchMetrics.semantic_preservation.overall_preservation_rate >= 70 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {researchMetrics.semantic_preservation.overall_preservation_rate}%
                      </div>
                      <div className="flex-1 grid grid-cols-3 gap-2 text-xs">
                        {researchMetrics.semantic_preservation.classes && (
                          <div className="text-center bg-slate-800/50 rounded p-1.5">
                            <div className="font-bold text-slate-300">{researchMetrics.semantic_preservation.classes.preservation_rate}%</div>
                            <div className="text-[10px] text-slate-500">Classes</div>
                          </div>
                        )}
                        {researchMetrics.semantic_preservation.methods && (
                          <div className="text-center bg-slate-800/50 rounded p-1.5">
                            <div className="font-bold text-slate-300">{researchMetrics.semantic_preservation.methods.preservation_rate}%</div>
                            <div className="text-[10px] text-slate-500">Methods</div>
                          </div>
                        )}
                        {researchMetrics.semantic_preservation.fields && (
                          <div className="text-center bg-slate-800/50 rounded p-1.5">
                            <div className="font-bold text-slate-300">{researchMetrics.semantic_preservation.fields.preservation_rate}%</div>
                            <div className="text-[10px] text-slate-500">Fields</div>
                          </div>
                        )}
                      </div>
                    </div>
                    {researchMetrics.semantic_preservation.methods?.removed_items && researchMetrics.semantic_preservation.methods.removed_items.length > 0 && (
                      <div className="mt-2 text-[10px] text-red-400">
                        Removed methods: {researchMetrics.semantic_preservation.methods.removed_items.slice(0, 3).join(', ')}
                      </div>
                    )}
                  </div>
                )}

                {/* Token Efficiency */}
                {researchMetrics.token_efficiency && researchMetrics.token_efficiency.total_tokens > 0 && (
                  <div className="bg-slate-900/50 rounded-lg border border-slate-700/40 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Zap className="w-3.5 h-3.5 text-yellow-400" />
                      <span className="text-xs font-semibold text-white uppercase tracking-wider">Token Efficiency</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div className="text-center bg-slate-800/50 rounded p-1.5">
                        <div className="font-bold text-blue-400">{researchMetrics.token_efficiency.total_tokens.toLocaleString()}</div>
                        <div className="text-[10px] text-slate-500">Total Tokens</div>
                      </div>
                      <div className="text-center bg-slate-800/50 rounded p-1.5">
                        <div className="font-bold text-green-400">{researchMetrics.token_efficiency.changes_per_1k_tokens}</div>
                        <div className="text-[10px] text-slate-500">Changes / 1K Tokens</div>
                      </div>
                      <div className="text-center bg-slate-800/50 rounded p-1.5">
                        <div className="font-bold text-amber-400">${researchMetrics.token_efficiency.cost_usd.toFixed(4)}</div>
                        <div className="text-[10px] text-slate-500">Total Cost</div>
                      </div>
                      <div className="text-center bg-slate-800/50 rounded p-1.5">
                        <div className="font-bold text-purple-400">${researchMetrics.token_efficiency.cost_per_change_usd.toFixed(4)}</div>
                        <div className="text-[10px] text-slate-500">Cost / Change</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Smell Resolution Summary */}
                {researchMetrics.smell_resolution && researchMetrics.smell_resolution.total_before > 0 && (
                  <div className="bg-slate-900/50 rounded-lg border border-slate-700/40 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Bug className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs font-semibold text-white uppercase tracking-wider">Smell Resolution by Type</span>
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`text-2xl font-bold ${
                        researchMetrics.smell_resolution.overall_resolution_rate > 10 ? 'text-green-400' :
                        researchMetrics.smell_resolution.overall_resolution_rate > 0 ? 'text-amber-400' : 'text-slate-400'
                      }`}>
                        {researchMetrics.smell_resolution.overall_resolution_rate}%
                      </div>
                      <div className="text-xs text-slate-400">
                        {researchMetrics.smell_resolution.total_resolved} of {researchMetrics.smell_resolution.total_before} resolved
                        {researchMetrics.smell_resolution.types_fully_eliminated > 0 && (
                          <span className="text-green-400 ml-1">({researchMetrics.smell_resolution.types_fully_eliminated} types eliminated)</span>
                        )}
                      </div>
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
                          {Object.entries(researchMetrics.smell_resolution.by_type)
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
                  </div>
                )}

                {/* Pipeline Metadata */}
                {pipelineMetadata && (
                  <div className="bg-slate-900/50 rounded-lg border border-slate-700/40 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-semibold text-white uppercase tracking-wider">Pipeline Metadata</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="text-center bg-slate-800/50 rounded p-1.5">
                        <div className="font-bold text-blue-400">{pipelineMetadata.retryCount ?? 0}</div>
                        <div className="text-[10px] text-slate-500">Retries</div>
                      </div>
                      <div className="text-center bg-slate-800/50 rounded p-1.5">
                        <div className="font-bold text-slate-300 text-[10px] truncate">{pipelineMetadata.model || '—'}</div>
                        <div className="text-[10px] text-slate-500">Model</div>
                      </div>
                      {pipelineMetadata.rejectionCategory && (
                        <div className="text-center bg-red-500/10 rounded p-1.5">
                          <div className="font-bold text-red-400 text-[10px]">{pipelineMetadata.rejectionCategory}</div>
                          <div className="text-[10px] text-slate-500">Rejection</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 2: Refactoring Traceability */}
      <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 overflow-hidden">
        <button onClick={() => toggle('traceability')} className="w-full flex items-center justify-between p-4 hover:bg-slate-700/30 transition-colors">
          <SectionHeader icon={GitBranch} title="Smell → Technique Traceability" color="text-purple-400"
            badge={<span className="text-xs bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded-full">{practices.practices_applied?.length || 0} techniques applied</span>}
          />
          {expandedSections.traceability ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {expandedSections.traceability && (
          <div className="px-4 pb-4">
            {/* Show refactoring plan mapping */}
            {planItems.length > 0 ? (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {planItems.map((item: any, i: number) => (
                  <div key={i} className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/30">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            item.severity === 'CRITICAL' ? 'bg-red-500/80 text-white' :
                            item.severity === 'MAJOR' ? 'bg-orange-500/80 text-white' :
                            'bg-yellow-500/80 text-white'
                          }`}>{item.severity}</span>
                          <span className="text-sm text-white font-medium">{item.smellId}</span>
                          <span className="text-xs text-slate-500">{item.location}</span>
                        </div>
                        <p className="text-xs text-slate-400 mb-1.5">{item.description?.slice(0, 120)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1 pl-2 border-l-2 border-purple-500/40">
                      <BookOpen className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                      <span className="text-xs text-purple-300 font-medium">{item.technique}</span>
                      <ArrowRight className="w-3 h-3 text-slate-600" />
                      <span className="text-xs text-slate-400">{item.action}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : practices.practices_applied?.length > 0 ? (
              <div className="space-y-2">
                {practices.practices_applied.map((p: string, i: number) => (
                  <div key={i} className="flex items-center gap-3 bg-slate-900/50 rounded-lg p-3 border border-slate-700/30">
                    <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <span className="text-sm text-slate-300">{p}</span>
                    <span className="text-xs text-slate-500 ml-auto">(Fowler catalog)</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">No specific refactoring techniques were recorded.</p>
            )}

            {/* Structural changes summary */}
            {improvements.structural_changes && (
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                {improvements.structural_changes.methods_extracted > 0 && (
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2.5 text-center">
                    <div className="text-lg font-bold text-blue-400">{improvements.structural_changes.methods_extracted}</div>
                    <div className="text-xs text-slate-400">Methods Extracted</div>
                  </div>
                )}
                {improvements.structural_changes.classes_split > 0 && (
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-2.5 text-center">
                    <div className="text-lg font-bold text-purple-400">{improvements.structural_changes.classes_split}</div>
                    <div className="text-xs text-slate-400">Classes Split</div>
                  </div>
                )}
                {improvements.structural_changes.methods_renamed > 0 && (
                  <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-2.5 text-center">
                    <div className="text-lg font-bold text-cyan-400">{improvements.structural_changes.methods_renamed}</div>
                    <div className="text-xs text-slate-400">Methods Renamed</div>
                  </div>
                )}
                {improvements.structural_changes.naming_improved && (
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2.5 text-center">
                    <CheckCircle className="w-5 h-5 text-green-400 mx-auto" />
                    <div className="text-xs text-slate-400 mt-1">Naming Improved</div>
                  </div>
                )}
              </div>
            )}

            {/* Smells removed / added */}
            {(improvements.code_smells?.smells_removed?.length > 0 || improvements.code_smells?.smells_added?.length > 0) && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                {improvements.code_smells.smells_removed.length > 0 && (
                  <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                    <div className="text-xs text-green-400 font-semibold mb-1.5">Smells Resolved</div>
                    <div className="flex flex-wrap gap-1">
                      {improvements.code_smells.smells_removed.map((s: string, i: number) => (
                        <span key={i} className="text-xs bg-green-500/15 text-green-400 px-2 py-0.5 rounded">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {improvements.code_smells.smells_added.length > 0 && (
                  <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-3">
                    <div className="text-xs text-orange-400 font-semibold mb-1.5">New Smells Introduced</div>
                    <div className="flex flex-wrap gap-1">
                      {improvements.code_smells.smells_added.map((s: string, i: number) => (
                        <span key={i} className="text-xs bg-orange-500/15 text-orange-400 px-2 py-0.5 rounded">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 3: Behavioral Preservation */}
      <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 overflow-hidden">
        <button onClick={() => toggle('behavioral')} className="w-full flex items-center justify-between p-4 hover:bg-slate-700/30 transition-colors">
          <SectionHeader icon={Shield} title="Behavioral Preservation Evidence" color="text-emerald-400"
            badge={
              behavioral.behavioral_correct !== undefined ? (
                <span className={`text-xs px-2 py-0.5 rounded-full ${behavioral.behavioral_correct ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                  {behavioral.behavioral_correct ? 'Behavior Preserved' : 'Issues Detected'}
                </span>
              ) : null
            }
          />
          {expandedSections.behavioral ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {expandedSections.behavioral && (
          <div className="px-4 pb-4">
            {Object.keys(behavioral).length > 0 ? (
              <div className="space-y-1.5">
                {[
                  { key: 'method_signatures_preserved', label: 'Method Signatures Preserved', desc: 'Public API contracts remain unchanged' },
                  { key: 'exception_handling_preserved', label: 'Exception Handling Preserved', desc: 'Error handling patterns maintained' },
                  { key: 'framework_contracts_preserved', label: 'Framework Contracts Preserved', desc: 'Spring/JUnit/framework annotations intact' },
                  { key: 'conditional_logic_preserved', label: 'Conditional Logic Preserved', desc: 'Decision paths and control flow maintained' },
                  { key: 'critical_method_calls_preserved', label: 'Critical Method Calls Preserved', desc: 'Important invocations not removed' },
                ].map(({ key, label, desc }) => {
                  const val = behavioral[key];
                  if (val === undefined) return null;
                  return (
                    <div key={key} className="flex items-center gap-3 p-2.5 bg-slate-900/40 rounded-lg">
                      {val ? (
                        <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <span className={`text-sm font-medium ${val ? 'text-green-300' : 'text-red-300'}`}>{label}</span>
                        <span className="text-xs text-slate-500 ml-2">{desc}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">No behavioral analysis data available.</p>
            )}
            {behavioral.note && (
              <p className="text-xs text-slate-500 mt-2 italic">{behavioral.note}</p>
            )}
          </div>
        )}
      </div>

      {/* Section 4: Applied Refactoring Practices */}
      {practices.practices_applied?.length > 0 && (
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 overflow-hidden">
          <button onClick={() => toggle('practices')} className="w-full flex items-center justify-between p-4 hover:bg-slate-700/30 transition-colors">
            <SectionHeader icon={Layers} title="Applied Refactoring Practices (Fowler Catalog)" color="text-amber-400"
              badge={<span className="text-xs bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full">{practices.practices_applied.length} practices</span>}
            />
            {expandedSections.practices ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {expandedSections.practices && (
            <div className="px-4 pb-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {practices.practices_applied.map((p: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                    <FileCode className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span className="text-sm text-amber-300 font-medium">{p}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-3">
                Practices identified based on structural analysis of code changes, mapped to Martin Fowler&apos;s refactoring catalog.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
