/** Dynamic import for Monaco diff with one automatic reload on stale dev chunks. */

const RETRY_KEY = 'refactai-monaco-chunk-retry';

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'ChunkLoadError') return true;
  return /loading chunk/i.test(error.message);
}

export function loadMonacoDiffChunk() {
  return import('../components/CodeComparisonMonacoDiff').catch((error: unknown) => {
    if (isChunkLoadError(error) && typeof window !== 'undefined') {
      if (!sessionStorage.getItem(RETRY_KEY)) {
        sessionStorage.setItem(RETRY_KEY, '1');
        window.location.reload();
        return new Promise<typeof import('../components/CodeComparisonMonacoDiff')>(() => {});
      }
      sessionStorage.removeItem(RETRY_KEY);
    }
    throw error;
  });
}
