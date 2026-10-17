'use client';

import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, Cell,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Minus, CheckCircle, AlertTriangle,
  XCircle, ArrowRight, Sparkles, Shield, Bug, Activity,
} from 'lucide-react';

interface RefactoringMetricsChartsProps {
  deltas?: {
    before?: number;
    after?: number;
    improvement?: number;
    qualityMetrics?: {
      before?: { complexity?: number; maintainability?: number; testability?: number };
      after?: { complexity?: number; maintainability?: number; testability?: number };
      change?: { complexity?: number; maintainability?: number; testability?: number };
    };
    comprehensiveAnalysis?: {
      summary?: { overall_score?: number; refactoring_successful?: boolean; key_achievements?: string[]; concerns?: string[] };
      improvements?: { code_smells_reduced?: number; structural_changes?: { methods_extracted?: number; classes_split?: number; identifiers_renamed?: number } };
      behavioral_correctness?: { method_signatures_preserved?: number; exceptions_preserved?: number; framework_contracts_preserved?: number };
    };
  };
  improvementStats?: {
    before?: { total: number; critical: number; major: number; minor: number };
    after?: { total: number; critical: number; major: number; minor: number };
    delta?: { total: number; critical: number; major: number; minor: number };
  };
}

const COLORS = {
  before: '#64748b',
  after: '#10b981',
  critical: '#ef4444',
  major: '#f59e0b',
  minor: '#8b5cf6',
  positive: '#10b981',
  negative: '#ef4444',
  neutral: '#64748b',
};

const tooltipStyle = {
  backgroundColor: '#1e293b',
  border: '1px solid #475569',
  borderRadius: '8px',
  color: '#f1f5f9',
  fontSize: '12px',
};

function GaugeBar({ label, before, after, max, lowerIsBetter, unit }: {
  label: string; before: number; after: number; max: number; lowerIsBetter?: boolean; unit?: string;
}) {
  const delta = after - before;
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  const unchanged = Math.abs(delta) < 0.1;
  const beforePct = Math.min(100, (before / max) * 100);
  const afterPct = Math.min(100, (after / max) * 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-300 font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">{before}{unit || ''}</span>
          <ArrowRight className="w-3 h-3 text-slate-600" />
          <span className={unchanged ? 'text-slate-400' : improved ? 'text-green-400 font-semibold' : 'text-orange-400 font-semibold'}>
            {typeof after === 'number' ? Number(after.toFixed(1)) : after}{unit || ''}
          </span>
          {!unchanged && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${improved ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
              {delta > 0 ? '+' : ''}{Number(delta.toFixed(1))}
            </span>
          )}
        </div>
      </div>
      <div className="relative h-3 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-slate-500/50 transition-all duration-700"
          style={{ width: `${beforePct}%` }}
        />
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${unchanged ? 'bg-slate-400' : improved ? 'bg-green-500' : 'bg-orange-500'}`}
          style={{ width: `${afterPct}%` }}
        />
      </div>
    </div>
  );
}

function interpretSmellChanges(stats: { before: { total: number; critical: number; major: number; minor: number }; after: { total: number; critical: number; major: number; minor: number } }): { text: string; type: 'good' | 'neutral' | 'concern' }[] {
  const items: { text: string; type: 'good' | 'neutral' | 'concern' }[] = [];
  const totalDelta = stats.after.total - stats.before.total;
  const critDelta = stats.after.critical - stats.before.critical;
  const majDelta = stats.after.major - stats.before.major;
  const minDelta = stats.after.minor - stats.before.minor;

  if (totalDelta < 0) {
    items.push({ type: 'good', text: `Total smells reduced by ${Math.abs(totalDelta)} (${stats.before.total} → ${stats.after.total}). Code smells are patterns in source code that indicate deeper problems (Fowler, 2018). Fewer smells = lower defect probability and easier maintenance.` });
  } else if (totalDelta === 0) {
    items.push({ type: 'neutral', text: `Total smell count unchanged at ${stats.before.total}. The refactoring restructured the code layout without introducing new detectable issues. Structural improvements (e.g., extracted methods) may still improve readability.` });
  } else {
    items.push({ type: 'concern', text: `Total smells increased by ${totalDelta} (${stats.before.total} → ${stats.after.total}). This is common when Extract Method creates new small methods — each method adds potential detection points for the static analyzer. The structural improvement may still be valuable despite the higher count.` });
  }

  if (critDelta < 0) {
    items.push({ type: 'good', text: `Critical issues reduced by ${Math.abs(critDelta)} (${stats.before.critical} → ${stats.after.critical}). Critical smells include God Class, Long Method (>100 lines), and Duplicate Code — they have the highest correlation with defect density.` });
  } else if (critDelta > 0) {
    items.push({ type: 'concern', text: `Critical issues increased by ${critDelta} (${stats.before.critical} → ${stats.after.critical}). These need attention — critical smells like God Class or Long Method significantly increase defect risk.` });
  } else if (stats.before.critical > 0) {
    items.push({ type: 'neutral', text: `Critical issues unchanged at ${stats.before.critical}. These are high-impact smells (God Class, Long Method) that may require more targeted refactoring.` });
  }

  if (majDelta < 0) {
    items.push({ type: 'good', text: `Major issues reduced by ${Math.abs(majDelta)} (${stats.before.major} → ${stats.after.major}). Major smells include Feature Envy, Data Class, and high complexity — reducing them improves code cohesion.` });
  } else if (majDelta > 0) {
    items.push({ type: 'concern', text: `Major issues increased by ${majDelta} (${stats.before.major} → ${stats.after.major}). Review the new major smells to ensure they aren't introducing coupling or cohesion problems.` });
  }

  if (minDelta !== 0) {
    const dir = minDelta < 0 ? 'decreased' : 'increased';
    items.push({ type: minDelta <= 0 ? 'good' : 'neutral', text: `Minor issues ${dir} by ${Math.abs(minDelta)} (${stats.before.minor} → ${stats.after.minor}). Minor smells (magic numbers, naming conventions, long lines) have low defect correlation but affect readability.` });
  }

  return items;
}

interface MetricInterpretation {
  metric: string;
  before: number;
  after: number;
  direction: 'up' | 'down' | 'same';
  verdict: 'good' | 'neutral' | 'concern';
  explanation: string;
  definition: string;
  whatItMeans: string;
}

function interpretQualityDetailed(qm: { before?: { complexity?: number; maintainability?: number; testability?: number }; after?: { complexity?: number; maintainability?: number; testability?: number } }): MetricInterpretation[] {
  const results: MetricInterpretation[] = [];
  const cb = qm.before?.complexity || 0, ca = qm.after?.complexity || 0;
  const mb = qm.before?.maintainability || 0, ma = qm.after?.maintainability || 0;
  const tb = qm.before?.testability || 0, ta = qm.after?.testability || 0;

  // Complexity
  const cDir = ca < cb ? 'down' : ca > cb ? 'up' : 'same';
  results.push({
    metric: 'Cyclomatic Complexity',
    before: cb, after: ca,
    direction: cDir,
    verdict: cDir === 'down' ? 'good' : cDir === 'same' ? 'neutral' : 'concern',
    definition: 'Measures the number of independent execution paths through the code (if/else, for, while, switch/case, &&, ||). Higher values = more paths to test.',
    explanation: ca < cb
      ? `Reduced from ${cb} to ${ca}. Fewer branching paths make the code easier to test and less prone to bugs.`
      : ca > cb
        ? `Increased from ${cb} to ${ca}. Extracted helper methods may have added new branching points. Review the new methods for unnecessary conditions.`
        : `Unchanged at ${cb}. The refactoring restructured code layout without altering the logical flow.`,
    whatItMeans: ca <= 10 ? 'Low complexity (≤10): easy to test, low bug risk.'
      : ca <= 20 ? 'Moderate complexity (11–20): manageable, but consider extracting methods for complex paths.'
      : ca <= 50 ? 'High complexity (21–50): hard to test thoroughly. Consider breaking into smaller methods.'
      : 'Very high complexity (>50): significant refactoring recommended to reduce bug risk.',
  });

  // Maintainability
  const mDir = ma > mb ? 'up' : ma < mb ? 'down' : 'same';
  results.push({
    metric: 'Maintainability Index',
    before: Number(mb.toFixed(1)), after: Number(ma.toFixed(1)),
    direction: mDir,
    verdict: mDir === 'up' ? 'good' : mDir === 'same' ? 'neutral' : 'concern',
    definition: 'Derived from the Halstead Volume, Cyclomatic Complexity, and Lines of Code (formula: MI = 171 − 5.2·ln(HV) − 0.23·CC − 16.2·ln(LOC)). Higher = easier to maintain. Scale: 0–100.',
    explanation: ma > mb
      ? `Improved from ${mb.toFixed(1)} to ${ma.toFixed(1)}. The code is now easier to understand, modify, and extend.`
      : ma < mb
        ? `Decreased from ${mb.toFixed(1)} to ${ma.toFixed(1)}. This typically happens when refactoring adds helper methods (increases LOC and Halstead volume) without reducing complexity proportionally. The structural improvement may still be worthwhile despite the index decrease.`
        : `Unchanged at ${mb.toFixed(1)}. The refactoring maintained the same balance of complexity, volume, and size.`,
    whatItMeans: ma >= 85 ? 'Highly maintainable (≥85): clean, well-structured code.'
      : ma >= 65 ? 'Moderately maintainable (65–84): acceptable, but could benefit from simplification.'
      : ma >= 20 ? 'Low maintainability (20–64): difficult to change safely. Refactoring recommended.'
      : 'Very low maintainability (<20): extremely hard to modify. Significant restructuring needed.',
  });

  // Testability
  const tDir = ta > tb ? 'up' : ta < tb ? 'down' : 'same';
  results.push({
    metric: 'Testability Score',
    before: Number(tb.toFixed(1)), after: Number(ta.toFixed(1)),
    direction: tDir,
    verdict: tDir === 'up' ? 'good' : tDir === 'same' ? 'neutral' : 'concern',
    definition: 'Estimates how easily the code can be unit-tested, based on method size, parameter counts, dependency coupling, and cyclomatic complexity. Higher = easier to test. Scale: 0–100.',
    explanation: ta > tb
      ? `Improved from ${tb.toFixed(1)} to ${ta.toFixed(1)}. Smaller methods with fewer dependencies are easier to isolate and test.`
      : ta < tb
        ? `Decreased from ${tb.toFixed(1)} to ${ta.toFixed(1)}. New extracted methods may have introduced additional dependencies or parameters. Consider reducing parameter counts.`
        : `Unchanged at ${tb.toFixed(1)}. The method structure remained comparable for testing purposes.`,
    whatItMeans: ta >= 80 ? 'Highly testable (≥80): easy to write focused unit tests.'
      : ta >= 50 ? 'Moderately testable (50–79): most methods can be tested, some may need mocking.'
      : ta >= 20 ? 'Low testability (20–49): many methods are hard to isolate. Dependency injection may help.'
      : 'Very low testability (<20): code is tightly coupled. Significant refactoring needed for testing.',
  });

  return results;
}

export default function RefactoringMetricsCharts({ deltas, improvementStats }: RefactoringMetricsChartsProps) {
  if (!deltas && !improvementStats) return null;

  const qm = deltas?.qualityMetrics;
  const analysis = deltas?.comprehensiveAnalysis;

  // Smell data for horizontal bar chart
  const smellsData = improvementStats ? [
    { name: 'Critical', Before: improvementStats.before?.critical || 0, After: improvementStats.after?.critical || 0, color: COLORS.critical },
    { name: 'Major', Before: improvementStats.before?.major || 0, After: improvementStats.after?.major || 0, color: COLORS.major },
    { name: 'Minor', Before: improvementStats.before?.minor || 0, After: improvementStats.after?.minor || 0, color: COLORS.minor },
  ] : [];

  const totalBefore = improvementStats?.before?.total || 0;
  const totalAfter = improvementStats?.after?.total || 0;
  const totalDelta = totalAfter - totalBefore;

  // Radar data for quality metrics
  const radarData = qm ? [
    { subject: 'Complexity', Before: Math.min(100, (qm.before?.complexity || 0) * 10), After: Math.min(100, (qm.after?.complexity || 0) * 10), fullMark: 100 },
    { subject: 'Maintainability', Before: qm.before?.maintainability || 0, After: qm.after?.maintainability || 0, fullMark: 100 },
    { subject: 'Testability', Before: qm.before?.testability || 0, After: qm.after?.testability || 0, fullMark: 100 },
  ] : [];

  // Overall score
  const overallScore = analysis?.summary?.overall_score;

  return (
    <div className="space-y-5">
      {/* ── Overall Verdict ── */}
      {overallScore != null && (
        <div className={`rounded-xl p-4 border flex items-center gap-4 ${
          overallScore >= 60 ? 'bg-green-500/10 border-green-500/30' :
          overallScore >= 40 ? 'bg-amber-500/10 border-amber-500/30' :
          'bg-red-500/10 border-red-500/30'
        }`}>
          <div className={`text-3xl font-bold ${
            overallScore >= 60 ? 'text-green-400' : overallScore >= 40 ? 'text-amber-400' : 'text-red-400'
          }`}>
            {overallScore.toFixed(0)}
          </div>
          <div>
            <div className="text-white font-semibold text-sm flex items-center gap-1.5">
              {overallScore >= 60 ? <CheckCircle className="w-4 h-4 text-green-400" /> :
               overallScore >= 40 ? <AlertTriangle className="w-4 h-4 text-amber-400" /> :
               <XCircle className="w-4 h-4 text-red-400" />}
              {overallScore >= 60 ? 'Good Refactoring' : overallScore >= 40 ? 'Partial Improvement' : 'Insufficient Improvement'}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {overallScore >= 60 ? 'Structural improvements detected with behavioral preservation.' :
               overallScore >= 40 ? 'Some changes applied but behavior may be affected. Review the metrics below.' :
               'The refactoring did not meet quality thresholds. Behavioral checks or smell reduction failed.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Code Smells: Before/After ── */}
      {improvementStats && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
              <Bug className="w-4 h-4 text-red-400" />
              Code Smells
            </h4>
            <div className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${
              totalDelta < 0 ? 'bg-green-500/20 text-green-400' :
              totalDelta === 0 ? 'bg-slate-600 text-slate-300' :
              'bg-orange-500/20 text-orange-400'
            }`}>
              {totalBefore} → {totalAfter}
              {totalDelta !== 0 && ` (${totalDelta > 0 ? '+' : ''}${totalDelta})`}
            </div>
          </div>

          {/* Horizontal grouped bar chart */}
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={smellsData} layout="vertical" barSize={14} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis type="number" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis dataKey="name" type="category" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} width={55} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Bar dataKey="Before" fill={COLORS.before} name="Before" radius={[0, 3, 3, 0]} />
              <Bar dataKey="After" name="After" radius={[0, 3, 3, 0]}>
                {smellsData.map((entry, i) => (
                  <Cell key={i} fill={entry.After <= entry.Before ? COLORS.positive : COLORS.negative} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Interpretation */}
          {improvementStats.before && improvementStats.after && (
            <div className="mt-3 space-y-2">
              <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1 px-1">
                <Sparkles className="w-3 h-3" /> Interpretation
              </div>
              {interpretSmellChanges({ before: improvementStats.before, after: improvementStats.after }).map((item, i) => (
                <div key={i} className={`rounded-lg p-2.5 border text-xs leading-relaxed ${
                  item.type === 'good' ? 'bg-green-500/5 border-green-500/20 text-green-200' :
                  item.type === 'concern' ? 'bg-orange-500/5 border-orange-500/20 text-orange-200' :
                  'bg-slate-900/50 border-slate-700/30 text-slate-300'
                }`}>
                  <span className="mr-1">{item.type === 'good' ? '✓' : item.type === 'concern' ? '⚠' : '—'}</span>
                  {item.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Quality Metrics ── */}
      {qm && (() => {
        const metrics = interpretQualityDetailed(qm);
        return (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-1.5 mb-3">
            <Activity className="w-4 h-4 text-blue-400" />
            Quality Metrics
          </h4>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Radar */}
            {radarData.length > 0 && (
              <div>
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#334155" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name="Before" dataKey="Before" stroke={COLORS.before} fill={COLORS.before} fillOpacity={0.3} strokeWidth={2} />
                    <Radar name="After" dataKey="After" stroke={COLORS.after} fill={COLORS.after} fillOpacity={0.3} strokeWidth={2} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Right: Gauge bars */}
            <div className="space-y-4 flex flex-col justify-center">
              <GaugeBar
                label="Cyclomatic Complexity"
                before={qm.before?.complexity || 0}
                after={qm.after?.complexity || 0}
                max={Math.max(50, (qm.before?.complexity || 0) * 1.5)}
                lowerIsBetter
              />
              <GaugeBar
                label="Maintainability Index"
                before={qm.before?.maintainability || 0}
                after={qm.after?.maintainability || 0}
                max={100}
              />
              <GaugeBar
                label="Testability Score"
                before={qm.before?.testability || 0}
                after={qm.after?.testability || 0}
                max={100}
              />
            </div>
          </div>

          {/* Detailed per-metric interpretation cards */}
          <div className="mt-4 space-y-3">
            {metrics.map((m) => (
              <div key={m.metric} className={`rounded-lg border p-3 ${
                m.verdict === 'good' ? 'bg-green-500/5 border-green-500/20' :
                m.verdict === 'concern' ? 'bg-orange-500/5 border-orange-500/20' :
                'bg-slate-900/50 border-slate-700/30'
              }`}>
                {/* Header row */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    {m.verdict === 'good' ? <TrendingUp className="w-3.5 h-3.5 text-green-400" /> :
                     m.verdict === 'concern' ? <TrendingDown className="w-3.5 h-3.5 text-orange-400" /> :
                     <Minus className="w-3.5 h-3.5 text-slate-400" />}
                    <span className="text-xs font-semibold text-white">{m.metric}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400">{m.before}</span>
                    <ArrowRight className="w-3 h-3 text-slate-600" />
                    <span className={`text-xs font-bold ${
                      m.verdict === 'good' ? 'text-green-400' :
                      m.verdict === 'concern' ? 'text-orange-400' : 'text-slate-300'
                    }`}>{m.after}</span>
                  </div>
                </div>

                {/* What is this metric */}
                <p className="text-[11px] text-slate-500 mb-1.5 leading-relaxed italic">
                  {m.definition}
                </p>

                {/* What happened */}
                <p className="text-xs text-slate-300 leading-relaxed mb-1.5">
                  {m.explanation}
                </p>

                {/* What the current value means */}
                <div className={`text-[11px] px-2 py-1 rounded ${
                  m.verdict === 'good' ? 'bg-green-500/10 text-green-300' :
                  m.verdict === 'concern' ? 'bg-orange-500/10 text-orange-300' :
                  'bg-slate-800 text-slate-400'
                }`}>
                  {m.whatItMeans}
                </div>
              </div>
            ))}
          </div>
        </div>
        );
      })()}

      {/* ── Behavioral Safety ── */}
      {analysis?.behavioral_correctness && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-1.5 mb-3">
            <Shield className="w-4 h-4 text-purple-400" />
            Behavioral Safety Check
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Method Signatures', val: analysis.behavioral_correctness.method_signatures_preserved,
                definition: 'Verifies that all public method signatures (name, return type, parameters) remain identical after refactoring. A failure means callers of this class would break.',
                passText: 'Preserved — no breaking changes to the public API.',
                failText: 'Changed — some public method signatures were modified. Dependent code may need updates.' },
              { label: 'Exception Handling', val: analysis.behavioral_correctness.exceptions_preserved,
                definition: 'Checks that thrown exceptions and catch blocks remain consistent. Changing exception handling can alter error propagation paths.',
                passText: 'Preserved — error handling behavior is unchanged.',
                failText: 'Modified — exception handling was altered. Verify that callers handle errors correctly.' },
              { label: 'Framework Contracts', val: analysis.behavioral_correctness.framework_contracts_preserved,
                definition: 'Ensures annotations (@Override, @Transactional, @Bean, etc.) and framework integration points are intact.',
                passText: 'Preserved — annotations and framework hooks remain intact.',
                failText: 'Changed — framework annotations or hooks were modified. This may affect runtime behavior.' },
            ].map((item) => {
              const ok = !!item.val;
              return (
                <div key={item.label} className={`rounded-lg p-3 border ${ok ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {ok ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                    <span className={`text-xs font-semibold ${ok ? 'text-green-300' : 'text-red-300'}`}>{item.label}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 italic mb-1.5 leading-relaxed">{item.definition}</p>
                  <p className={`text-[11px] ${ok ? 'text-green-300' : 'text-red-300'}`}>{ok ? item.passText : item.failText}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-3 bg-slate-900/50 rounded-lg p-3 border border-slate-700/30">
            <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Summary
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {[analysis.behavioral_correctness.method_signatures_preserved,
                analysis.behavioral_correctness.exceptions_preserved,
                analysis.behavioral_correctness.framework_contracts_preserved,
              ].every(v => !!v)
                ? 'All behavioral checks passed. The refactoring preserved the public API, exception handling, and framework annotations — no breaking changes were introduced. This confirms the refactoring is behavior-preserving (a key principle from Fowler\'s definition of refactoring).'
                : 'Some behavioral checks flagged issues. In Fowler\'s definition, refactoring must not alter external behavior. Review the diff carefully to ensure dependent classes and tests still function correctly.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Key Achievements / Concerns ── */}
      {analysis?.summary && (
        (analysis.summary.key_achievements?.length || analysis.summary.concerns?.length) ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {analysis.summary.key_achievements && analysis.summary.key_achievements.length > 0 && (
              <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-green-300 flex items-center gap-1.5 mb-2">
                  <CheckCircle className="w-4 h-4" /> Achievements
                </h4>
                <ul className="space-y-1.5">
                  {analysis.summary.key_achievements.map((a, i) => (
                    <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                      <span className="text-green-400 mt-0.5 shrink-0">✓</span> {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.summary.concerns && analysis.summary.concerns.length > 0 && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-amber-300 flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="w-4 h-4" /> Concerns
                </h4>
                <ul className="space-y-1.5">
                  {analysis.summary.concerns.map((c, i) => (
                    <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                      <span className="text-amber-400 mt-0.5 shrink-0">!</span> {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null
      )}
    </div>
  );
}
