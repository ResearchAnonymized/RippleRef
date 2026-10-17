/** Shared client helpers for /agents/refactor (interactive + batch). */

export function agentsPort(): string {
  return process.env.NEXT_PUBLIC_AGENTS_PORT || '8091';
}

export function agentsBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  return `http://127.0.0.1:${agentsPort()}`;
}

export function agentsRefactorUrl(): string {
  const base = agentsBaseUrl();
  return base ? `${base}/agents/refactor` : '/agents/refactor';
}

export function agentsHealthUrl(): string {
  const base = agentsBaseUrl();
  return base ? `${base}/agents/health` : '/agents/health';
}

export function agentsAnalyzeUrl(): string {
  const base = agentsBaseUrl();
  return base ? `${base}/agents/analyze` : '/agents/analyze';
}

/** Max wait for /agents/refactor in the browser. Scale with file size and smell count. */
export function getRefactorClientTimeoutMs(lineCount: number, smellCount: number): number {
  if (lineCount > 50_000) return 90 * 60 * 1000;
  if (lineCount > 10_000) return 65 * 60 * 1000;
  if (lineCount > 5000) return 55 * 60 * 1000;
  if (smellCount > 200 || lineCount > 800) return 45 * 60 * 1000;
  if (smellCount > 100 || lineCount > 400 || smellCount > 80) return 35 * 60 * 1000;
  if (smellCount > 40) return 25 * 60 * 1000;
  return 18 * 60 * 1000;
}

export function agentsProgressUrl(jobId: string): string {
  const base = agentsBaseUrl();
  return base ? `${base}/agents/progress/${jobId}` : `/agents/progress/${jobId}`;
}

/** Live agent steps (same SSE channel as Controlled Refactoring). */
export function subscribeAgentsProgress(
  jobId: string,
  onEvent: (evt: {
    type?: string;
    stepName?: string;
    agent?: string;
    message?: string;
    provider?: string;
    model?: string;
    passIndex?: number;
    passTotal?: number;
  }) => void
): () => void {
  if (typeof window === 'undefined' || !jobId) return () => {};
  let es: EventSource | null = null;
  try {
    es = new EventSource(agentsProgressUrl(jobId));
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as {
          type?: string;
          stepName?: string;
          agent?: string;
          message?: string;
          provider?: string;
          model?: string;
          passIndex?: number;
          passTotal?: number;
        };
        if (evt.type === 'keepalive') return;
        onEvent(evt);
        if (evt.type === 'done' && es) {
          es.close();
          es = null;
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      es?.close();
      es = null;
    };
  } catch {
    /* SSE unavailable */
  }
  return () => {
    es?.close();
    es = null;
  };
}

export function explainRefactorFetchError(err: unknown, smellCount = 0): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('AbortError') || msg.toLowerCase().includes('timeout')) {
    const mins = Math.round(getRefactorClientTimeoutMs(0, smellCount) / 60000);
    return `Timed out (~${mins} min limit). Try fewer smells, a smaller file, or refactor alone in Controlled mode.`;
  }
  if (
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('Load failed')
  ) {
    return (
      `Lost connection to agents (port ${agentsPort()}). The run may still have finished on the server — check agents/agents.log. ` +
      'Common causes: agents restarted (--reload), browser tab slept, or OOM on very large files. ' +
      'Retry this file alone; avoid editing agents/ during batch.'
    );
  }
  return msg;
}

export async function checkAgentsHealth(): Promise<{ ok: boolean; message?: string }> {
  try {
    const healthRes = await fetch(agentsHealthUrl(), { signal: AbortSignal.timeout(8000) });
    if (!healthRes.ok) {
      return {
        ok: false,
        message: `Agents health check failed (${healthRes.status}). Run ./restart_all.sh`,
      };
    }
    const health = await healthRes.json();
    if (!health.hasOpenRouterKey) {
      return {
        ok: false,
        message:
          'OpenRouter API key is not configured in agents/.env. Add OPENROUTER_API_KEY and restart agents.',
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      message:
        `Cannot connect to agents on port ${agentsPort()}. Run: ./start_daemon.sh start`,
    };
  }
}
