/** Shared types/helpers for multi-LLM batch progress (independent parallel + legacy chain). */

export type LlmProviderProgress = {
  provider: string;
  model: string;
  passIndex: number;
  passTotal: number;
  stepName?: string;
  agent?: string;
  stepStatus?: string;
};

export type ActiveLlmMap = Record<string, LlmProviderProgress>;

/** Must match CHAIN_COLUMNS keys in BatchLlmPipelineView. */
export function providerColumnKey(provider: string, model: string): string {
  const p = provider.toLowerCase();
  const m = model.toLowerCase();
  if (p.includes('google') || m.includes('gemini')) return 'google';
  if (p.includes('openai') || m.includes('gpt')) return 'openai';
  if (p.includes('anthropic') || m.includes('claude')) return 'anthropic';
  if (m.startsWith('google/')) return 'google';
  if (m.startsWith('openai/')) return 'openai';
  if (m.startsWith('anthropic/')) return 'anthropic';
  return m.split('/')[0] ?? p;
}

export function mergeActiveLlm(
  prev: ActiveLlmMap | undefined,
  info: LlmProviderProgress
): ActiveLlmMap {
  const key = providerColumnKey(info.provider, info.model);
  return { ...prev, [key]: { ...prev?.[key], ...info } };
}

export function activeLlmCount(map: ActiveLlmMap | undefined): number {
  return map ? Object.keys(map).length : 0;
}

export function formatParallelProgressMessage(map: ActiveLlmMap | undefined): string {
  if (!map || Object.keys(map).length === 0) return 'Starting parallel multi-LLM…';
  const labels = Object.values(map).map((p) => {
    const step = p.stepName ? ` · ${p.stepName}` : '';
    return `${p.provider}${step}`;
  });
  return `Parallel (${labels.length}/3): ${labels.join(' | ')}`;
}
