/**
 * Client-side refactoring report narrative + multi-format export helpers.
 * Used when the agents service does not return refactoringReport (older deploys).
 */

import { computeLineDiffStats } from './lineDiff';

/** Matches agents `refactoring_report` JSON + UI sections. */
export type RefactoringReportShape = {
  file: string;
  summary: string;
  detected_smells: Array<{ smell: string; location: string; evidence: string }>;
  applied_refactorings: Array<{
    type: string;
    before_location: string;
    after_location: string;
    description: string;
  }>;
  smell_refactoring_mapping: Array<{ smell: string; refactoring: string; benefit: string }>;
  change_metrics: {
    lines_added: number;
    lines_removed: number;
    lines_modified: number;
    refactoring_operations: number;
  };
  additional_cleanup_changes: string[];
  behavior_preservation: string;
  quality_improvement: string[];
  meta?: Record<string, unknown>;
};

function basename(path: string): string {
  const p = path.replace(/\\/g, '/');
  return p.split('/').pop() || path || 'unknown';
}

function humanizeId(id: string): string {
  return String(id || 'unknown')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function smellLocationClient(s: Record<string, unknown>): string {
  const ptr = (s.pointer as Record<string, unknown>) || {};
  const parts: string[] = [];
  for (const k of ['className', 'methodName', 'fieldName', 'name']) {
    const v = ptr[k] ?? s[k];
    if (v) parts.push(String(v));
  }
  const sl = (s.startLine as number) ?? (ptr.startLine as number);
  const el = (s.endLine as number) ?? (ptr.endLine as number);
  if (sl && el) parts.push(`lines ${sl}-${el}`);
  else if (sl) parts.push(`line ${sl}`);
  return parts.length ? parts.join(', ') : 'see file / detector region';
}

function evidenceClient(s: Record<string, unknown>): string {
  const t =
    (s.summary as string) ||
    (s.description as string) ||
    (s.title as string) ||
    (s.message as string) ||
    '';
  const one = String(t).trim().replace(/\s+/g, ' ');
  return one.length > 220 ? one.slice(0, 219) + '…' : one || '(no detector message)';
}

function benefitLine(technique: string): string {
  const t = technique.toLowerCase();
  if (t.includes('extract method')) return 'Reduces complexity and improves readability and reuse.';
  if (t.includes('extract class')) return 'Improves separation of responsibilities and modularity.';
  if (t.includes('rename')) return 'Improves understandability through clearer naming.';
  if (t.includes('simplify') || t.includes('conditional'))
    return 'Makes decision logic easier to read and maintain.';
  if (t.includes('duplication') || t.includes('duplicate')) return 'Removes repeated logic.';
  return 'Supports maintainability and clearer structure.';
}

export type ClientReportInput = {
  filePath: string;
  original: string;
  refactored: string;
  smells: Array<Record<string, unknown>>;
  agentAnalysis: {
    refactoringPlan?: Array<{
      smellId: string;
      severity?: string;
      location?: string;
      description?: string;
      technique?: string;
      action?: string;
      priority?: string;
    }>;
    decision?: string;
    reason?: string;
  } | null;
  applyResult: Record<string, unknown> | null | undefined;
  agentSteps: Array<{ name?: string; agent?: string; status?: string; details?: unknown; error?: string }>;
};

export function buildClientRefactoringReport(input: ClientReportInput): RefactoringReportShape | null {
  const { filePath, original, refactored, smells, agentAnalysis, applyResult, agentSteps } = input;
  if (!filePath) return null;

  const file = basename(filePath);
  const stats = computeLineDiffStats(original || '', refactored || '');
  const identical = (original || '').trim() === (refactored || '').trim();
  const wsCollapsed = (original || '').replace(/\s+/g, ' ').trim() === (refactored || '').replace(/\s+/g, ' ').trim();

  const detected_smells = (smells || [])
    .filter(s => (s.detectorId as string) !== 'general-improvements')
    .map(s => ({
      smell: humanizeId(String(s.detectorId || s.type || 'Code smell')),
      location: smellLocationClient(s),
      evidence: evidenceClient(s),
    }));

  const plan = agentAnalysis?.refactoringPlan || [];
  const applied_refactorings = plan.map(p => ({
    type: p.technique || 'Planned refactoring',
    before_location: p.location || 'see smell location',
    after_location: 'See refactored file / diff view',
    description: (p.action || p.description || '').slice(0, 500),
  }));

  const smell_refactoring_mapping = plan.map(p => ({
    smell: humanizeId(p.smellId || ''),
    refactoring: p.technique || 'General Refactoring',
    benefit: benefitLine(p.technique || ''),
  }));

  const ca = (applyResult?.deltas as Record<string, unknown>)?.comprehensiveAnalysis as
    | Record<string, unknown>
    | undefined;
  const bc = ca?.behavioral_correctness as Record<string, unknown> | undefined;
  const summaryBlock = ca?.summary as Record<string, unknown> | undefined;

  let behavior_preservation =
    'Review the diff and run tests to confirm behavior; client summary is heuristic only.';
  if (bc?.behavioral_correct === true) {
    behavior_preservation =
      'Heuristic analysis suggests external behavior may be preserved (signatures / control flow); verify with tests.';
  } else if (bc?.behavioral_correct === false) {
    behavior_preservation =
      'Heuristic analysis flagged possible behavior-impacting differences — review carefully before merging.';
  }

  const quality_improvement: string[] = [];
  const achievements = summaryBlock?.key_achievements as string[] | undefined;
  if (achievements?.length) quality_improvement.push(...achievements.slice(0, 12));
  const rp = ca?.refactoring_practices as Record<string, unknown> | undefined;
  const practices = rp?.practices_applied as string[] | undefined;
  if (practices?.length) {
    quality_improvement.push(`Patterns suggested by analysis: ${practices.join(', ')}`);
  }
  if (!quality_improvement.length) {
    quality_improvement.push('Improved readability', 'Improved maintainability (expected; confirm in diff)');
  }

  const deltas = applyResult?.deltas as Record<string, unknown> | undefined;
  const improvement =
    typeof deltas?.improvement === 'number' ? deltas.improvement : undefined;
  const beforeN = typeof deltas?.before === 'number' ? deltas.before : undefined;
  const afterN = typeof deltas?.after === 'number' ? deltas.after : undefined;

  let summary: string;
  if (identical) {
    summary =
      'No smell-driven refactoring detected from file comparison: original and refactored text are identical (or report not yet available from server).';
  } else if (wsCollapsed) {
    summary =
      'Only whitespace / formatting-level differences detected between before and after in this view.';
  } else {
    summary = `Refactored ${file}: ${stats.linesChanged} line-level hunks (+${stats.added} / -${stats.removed} / ~${stats.modified}).`;
    if (beforeN !== undefined && afterN !== undefined) {
      summary += ` Reported smells ${beforeN} → ${afterN}`;
      if (improvement !== undefined && improvement > 0) summary += ` (${improvement} fewer).`;
      else summary += '.';
    } else {
      summary += ' Open the diff and verification sections for detail.';
    }
    if (agentAnalysis?.decision) {
      summary += ` Agent decision: ${agentAnalysis.decision}.`;
    }
  }

  const additional_cleanup: string[] = [];
  if (!applyResult?.refactoringReport && identical) {
    additional_cleanup.push(
      'Tip: restart the agents service after upgrading so the server can attach a full refactoringReport payload.'
    );
  }

  return {
    file,
    summary,
    detected_smells,
    applied_refactorings,
    smell_refactoring_mapping,
    change_metrics: {
      lines_added: stats.added,
      lines_removed: stats.removed,
      lines_modified: stats.modified,
      refactoring_operations: plan.length || (stats.linesChanged > 0 ? 1 : 0),
    },
    additional_cleanup_changes: additional_cleanup,
    behavior_preservation,
    quality_improvement,
    meta: {
      source: 'client-fallback',
      agent_pipeline_steps: agentSteps?.length ?? 0,
    },
  };
}

export type ReportNarrativeExtras = {
  generatedAt?: string;
  workspaceLabel?: string;
  agentSteps?: Array<{ name?: string; agent?: string; status?: string; error?: string }>;
  agentAnalysisSummary?: string;
};

export function reportToMarkdown(report: RefactoringReportShape, extras?: ReportNarrativeExtras): string {
  const when = extras?.generatedAt || new Date().toISOString();
  const lines: string[] = [];
  lines.push(`# Refactoring report: ${report.file}`);
  lines.push('');
  lines.push(`_Generated: ${when}_`);
  if (extras?.workspaceLabel) lines.push(`_Workspace / context: ${extras.workspaceLabel}_`);
  lines.push('');
  lines.push('## Refactoring summary');
  lines.push(report.summary);
  lines.push('');
  lines.push('## Detected code smells');
  if (!report.detected_smells.length) lines.push('- _(none listed)_');
  else {
    for (const s of report.detected_smells) {
      lines.push(`- **${s.smell}** (${s.location})`);
      lines.push(`  - Evidence: ${s.evidence}`);
    }
  }
  lines.push('');
  lines.push('## Applied refactorings (planned or detected)');
  if (!report.applied_refactorings.length) lines.push('- _(none listed)_');
  else {
    for (const r of report.applied_refactorings) {
      lines.push(`- **${r.type}**`);
      lines.push(`  - Before: ${r.before_location}`);
      lines.push(`  - After: ${r.after_location}`);
      lines.push(`  - ${r.description}`);
    }
  }
  lines.push('');
  lines.push('## Smell → refactoring → benefit');
  lines.push('');
  lines.push('| Smell | Refactoring | Expected benefit |');
  lines.push('| --- | --- | --- |');
  for (const m of report.smell_refactoring_mapping) {
    lines.push(`| ${m.smell} | ${m.refactoring} | ${m.benefit} |`);
  }
  if (!report.smell_refactoring_mapping.length) lines.push('| — | — | — |');
  lines.push('');
  lines.push('## Change metrics');
  lines.push('');
  lines.push(`- Lines added: **${report.change_metrics.lines_added}**`);
  lines.push(`- Lines removed: **${report.change_metrics.lines_removed}**`);
  lines.push(`- Lines modified: **${report.change_metrics.lines_modified}**`);
  lines.push(`- Refactoring operations (count): **${report.change_metrics.refactoring_operations}**`);
  lines.push('');
  lines.push('## Additional cleanup (non-primary)');
  if (!report.additional_cleanup_changes.length) lines.push('- _(none flagged)_');
  else for (const c of report.additional_cleanup_changes) lines.push(`- ${c}`);
  lines.push('');
  lines.push('## Behavior preservation');
  lines.push(report.behavior_preservation);
  lines.push('');
  lines.push('## Expected quality improvement');
  for (const q of report.quality_improvement) lines.push(`- ${q}`);
  lines.push('');
  if (extras?.agentAnalysisSummary) {
    lines.push('## Agent analysis (pre-refactor)');
    lines.push(extras.agentAnalysisSummary);
    lines.push('');
  }
  if (extras?.agentSteps?.length) {
    lines.push('## Pipeline steps (agent log)');
    lines.push('');
    lines.push('| Step | Agent | Status |');
    lines.push('| --- | --- | --- |');
    for (const st of extras.agentSteps) {
      lines.push(
        `| ${st.name || '—'} | ${st.agent || '—'} | ${st.status || '—'}${st.error ? ` (${st.error})` : ''} |`
      );
    }
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push(
    '*This document is produced by RefactAI for documentation, research, and review. Automated narrative does not replace tests or human code review.*'
  );
  return lines.join('\n');
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function reportToHtml(report: RefactoringReportShape, extras?: ReportNarrativeExtras): string {
  const when = esc(extras?.generatedAt || new Date().toISOString());
  const h = (t: string) => esc(t).replace(/\n/g, '<br/>');

  const smellRows = report.detected_smells
    .map(
      s => `<tr><td><strong>${esc(s.smell)}</strong></td><td>${esc(s.location)}</td><td>${esc(s.evidence)}</td></tr>`
    )
    .join('');

  const appliedBlocks = report.applied_refactorings
    .map(
      r => `
    <div class="card">
      <h3>${esc(r.type)}</h3>
      <p><span class="label">Before:</span> ${esc(r.before_location)}</p>
      <p><span class="label">After:</span> ${esc(r.after_location)}</p>
      <p>${esc(r.description)}</p>
    </div>`
    )
    .join('');

  const mapRows = report.smell_refactoring_mapping
    .map(
      m =>
        `<tr><td>${esc(m.smell)}</td><td>${esc(m.refactoring)}</td><td>${esc(m.benefit)}</td></tr>`
    )
    .join('');

  const cleanup = report.additional_cleanup_changes.map(c => `<li>${esc(c)}</li>`).join('');
  const quality = report.quality_improvement.map(q => `<li>${esc(q)}</li>`).join('');

  let stepsHtml = '';
  if (extras?.agentSteps?.length) {
    const rows = extras.agentSteps
      .map(
        st =>
          `<tr><td>${esc(st.name || '')}</td><td>${esc(st.agent || '')}</td><td>${esc(st.status || '')}${st.error ? ` — ${esc(st.error)}` : ''}</td></tr>`
      )
      .join('');
    stepsHtml = `<h2>Pipeline steps</h2><table class="grid"><thead><tr><th>Step</th><th>Agent</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Refactoring report — ${esc(report.file)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #1e293b; line-height: 1.5; }
    h1 { color: #0f172a; border-bottom: 2px solid #38bdf8; padding-bottom: 0.5rem; }
    h2 { color: #0f172a; margin-top: 2rem; }
    .meta { color: #64748b; font-size: 0.9rem; }
    .summary { background: #f1f5f9; padding: 1rem; border-radius: 8px; border: 1px solid #e2e8f0; }
    table.grid { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.95rem; }
    table.grid th, table.grid td { border: 1px solid #cbd5e1; padding: 0.5rem 0.75rem; text-align: left; vertical-align: top; }
    table.grid th { background: #e2e8f0; }
    .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; margin: 0.75rem 0; background: #f8fafc; }
    .card h3 { margin-top: 0; color: #15803d; }
    .label { color: #64748b; font-weight: 600; }
    .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 0.85rem; }
  </style>
</head>
<body>
  <h1>Refactoring report</h1>
  <p class="meta">File: <strong>${esc(report.file)}</strong><br/>Generated: ${when}</p>
  ${extras?.workspaceLabel ? `<p class="meta">Context: ${esc(extras.workspaceLabel)}</p>` : ''}

  <h2>Refactoring summary</h2>
  <div class="summary">${h(report.summary)}</div>

  <h2>Detected code smells</h2>
  <table class="grid">
    <thead><tr><th>Smell</th><th>Location</th><th>Evidence</th></tr></thead>
    <tbody>${smellRows || '<tr><td colspan="3"><em>None listed</em></td></tr>'}</tbody>
  </table>

  <h2>Applied refactorings</h2>
  ${appliedBlocks || '<p><em>None listed</em></p>'}

  <h2>Smell → refactoring → benefit</h2>
  <table class="grid">
    <thead><tr><th>Smell</th><th>Refactoring</th><th>Benefit</th></tr></thead>
    <tbody>${mapRows || '<tr><td colspan="3"><em>None</em></td></tr>'}</tbody>
  </table>

  <h2>Change metrics</h2>
  <ul>
    <li>Lines added: <strong>${report.change_metrics.lines_added}</strong></li>
    <li>Lines removed: <strong>${report.change_metrics.lines_removed}</strong></li>
    <li>Lines modified: <strong>${report.change_metrics.lines_modified}</strong></li>
    <li>Refactoring operations: <strong>${report.change_metrics.refactoring_operations}</strong></li>
  </ul>

  <h2>Additional cleanup</h2>
  <ul>${cleanup || '<li><em>None flagged</em></li>'}</ul>

  <h2>Behavior preservation</h2>
  <p>${h(report.behavior_preservation)}</p>

  <h2>Expected quality improvement</h2>
  <ul>${quality}</ul>

  ${extras?.agentAnalysisSummary ? `<h2>Agent analysis (pre-refactor)</h2><p>${h(extras.agentAnalysisSummary)}</p>` : ''}
  ${stepsHtml}

  <div class="footer">
    Produced by RefactAI for documentation and review. Does not replace tests or human review.
  </div>
</body>
</html>`;
}
