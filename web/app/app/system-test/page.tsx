'use client';

import React, { useState } from 'react';

type Row = { name: string; ok: boolean; detail: string };

export default function SystemTestPage() {
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  const run = async () => {
    setRunning(true);
    const out: Row[] = [];

    const add = (name: string, ok: boolean, detail: string) => {
      out.push({ name, ok, detail });
      setRows([...out]);
    };

    try {
      try {
        const r = await fetch('/api/health');
        add('Backend /api/health', r.ok, r.ok ? await r.text() : `${r.status}`);
      } catch (e) {
        add('Backend /api/health', false, String(e));
      }

      try {
        const r = await fetch('http://localhost:8091/agents/health');
        const t = await r.text();
        add('Agents :8091 /agents/health', r.ok, t.slice(0, 200));
      } catch (e) {
        add('Agents :8091 /agents/health', false, String(e));
      }

      let ws: string | null = null;
      try {
        const r = await fetch('/api/workspaces');
        if (r.ok) {
          const list = await r.json();
          if (Array.isArray(list) && list[0]?.id) {
            ws = list[0].id;
            add('Workspaces list', true, `using first id: ${ws}`);
          } else add('Workspaces list', false, 'empty or bad shape');
        } else add('Workspaces list', false, `${r.status}`);
      } catch (e) {
        add('Workspaces list', false, String(e));
      }

      if (ws) {
        let javaPath = '';
        try {
          const r = await fetch(`/api/workspaces/${ws}/files`);
          const files = await r.json();
          if (Array.isArray(files)) {
            const j = files.find((f: any) => String(f.relativePath || f.path || '').endsWith('.java'));
            javaPath = j?.relativePath || j?.path || '';
          }
          add('Find sample .java', !!javaPath, javaPath || 'none');
        } catch (e) {
          add('Find sample .java', false, String(e));
        }

        if (javaPath) {
          try {
            const r = await fetch('/api/workspace-enhanced-analysis/analyze-file', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ workspaceId: ws, filePath: javaPath }),
            });
            const data = r.ok ? await r.json() : null;
            const n = Array.isArray(data?.codeSmells) ? data.codeSmells.length : -1;
            add('Static smells (analyze-file)', r.ok, `codeSmells=${n}`);
          } catch (e) {
            add('Static smells (analyze-file)', false, String(e));
          }

          try {
            const enc = encodeURIComponent(javaPath);
            const r = await fetch(`/api/workspaces/${ws}/dependencies/file?filePath=${enc}`);
            const data = r.ok ? await r.json() : null;
            const depN = Array.isArray(data?.dependencies)
              ? data.dependencies.length
              : (data?.dependencies && typeof data.dependencies === 'object' ? Object.keys(data.dependencies).length : 0);
            const revN = Array.isArray(data?.reverseDependencies)
              ? data.reverseDependencies.length
              : (data?.reverseDependencies && typeof data.reverseDependencies === 'object'
                  ? Object.keys(data.reverseDependencies).length
                  : 0);
            add('Static file dependencies', r.ok, `out=${depN} in=${revN}`);
          } catch (e) {
            add('Static file dependencies', false, String(e));
          }

          try {
            const enc = encodeURIComponent(javaPath);
            const r = await fetch(`/api/workspaces/${ws}/dependencies/ripple-effect?filePath=${enc}`);
            const data = r.ok ? await r.json() : null;
            const cnt = data?.impactCount ?? '?';
            add('Static ripple-effect set', r.ok, `impactCount=${cnt}`);
          } catch (e) {
            add('Static ripple-effect set', false, String(e));
          }
        }
      }
    } finally {
      setRunning(false);
    }
  };

  const failed = rows.filter((r) => !r.ok).length;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8">
      <h1 className="text-2xl font-bold mb-2">System test (browser)</h1>
      <p className="text-slate-400 text-sm mb-6 max-w-2xl">
        Quick checks: API health, workspaces, static smells, dependencies, ripple-effect. For full upload + agent
        checks, run <code className="bg-slate-800 px-1 rounded">./scripts/system_e2e_test.sh</code> from the repo root.
      </p>
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg font-medium"
      >
        {running ? 'Running…' : 'Run checks'}
      </button>
      {rows.length > 0 && (
        <p className={`mt-4 text-sm ${failed ? 'text-amber-300' : 'text-emerald-300'}`}>
          {failed ? `${failed} failed` : 'All checks passed'}
        </p>
      )}
      <ul className="mt-6 space-y-2 font-mono text-sm">
        {rows.map((r) => (
          <li key={r.name} className="border border-slate-700 rounded p-3 bg-slate-800/50">
            <span className={r.ok ? 'text-emerald-400' : 'text-red-400'}>{r.ok ? '✓' : '✗'}</span>{' '}
            <span className="text-white">{r.name}</span>
            <div className="text-slate-400 mt-1 break-all">{r.detail}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
