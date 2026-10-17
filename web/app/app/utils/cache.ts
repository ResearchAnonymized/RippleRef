// Simple in-memory cache with TTL support
interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class MemoryCache {
  private cache = new Map<string, CacheItem<any>>();
  private maxSize = 100; // Maximum number of items

  set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void { // Default 5 minutes
    // Remove expired items if cache is full
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    // Check if item has expired
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data as T;
  }

  has(key: string): boolean {
    const item = this.cache.get(key);
    
    if (!item) {
      return false;
    }

    // Check if item has expired
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, item] of Array.from(this.cache.entries())) {
      if (now - item.timestamp > item.ttl) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.cache.delete(key));

    // If still full, remove oldest items
    if (this.cache.size >= this.maxSize) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, Math.floor(this.maxSize / 2));
      toRemove.forEach(([key]) => this.cache.delete(key));
    }
  }

  size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }
}

// Global cache instance
export const cache = new MemoryCache();

// Cache key generators
export const CacheKeys = {
  workspace: (id: string) => `workspace:${id}`,
  assessment: (workspaceId: string) => `assessment:${workspaceId}`,
  plan: (workspaceId: string) => `plan:${workspaceId}`,
  files: (workspaceId: string) => `files:${workspaceId}`,
  fileContent: (workspaceId: string, filePath: string) => `fileContent:${workspaceId}:${filePath}`,
  fileAnalysis: (workspaceId: string, filePath: string) => `fileAnalysis:${workspaceId}:${filePath}`,
  dependencyGraph: (workspaceId: string) => `dependencyGraph:${workspaceId}`,
  dependencyAnalysis: (workspaceId: string, filePath: string) => `dependencyAnalysis:${workspaceId}:${filePath}`,
  rippleEffect: (workspaceId: string, filePath: string) => `rippleEffect:${workspaceId}:${filePath}`,
} as const;

// Cache TTL constants (in milliseconds)
export const CacheTTL = {
  SHORT: 2 * 60 * 1000,      // 2 minutes
  MEDIUM: 5 * 60 * 1000,     // 5 minutes
  LONG: 15 * 60 * 1000,      // 15 minutes
  VERY_LONG: 60 * 60 * 1000, // 1 hour
} as const;

// Cache utility functions
export const cacheUtils = {
  // Invalidate all cache entries for a workspace
  invalidateWorkspace: (workspaceId: string) => {
    const keys = cache.keys();
    keys.forEach(key => {
      if (key.includes(workspaceId)) {
        cache.delete(key);
      }
    });
  },

  // Invalidate specific cache entry
  invalidate: (key: string) => {
    cache.delete(key);
  },

  // Get cache statistics
  getStats: () => ({
    size: cache.size(),
    keys: cache.keys(),
  }),

  // Clear all cache
  clear: () => {
    cache.clear();
  },

  // Preload data with caching
  preload: async <T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = CacheTTL.MEDIUM
  ): Promise<T> => {
    // Check cache first
    const cached = cache.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch and cache
    const data = await fetcher();
    cache.set(key, data, ttl);
    return data;
  },
};

// React hook for cached data
export function useCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = CacheTTL.MEDIUM,
  dependencies: any[] = []
): {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await cacheUtils.preload(key, fetcher, ttl);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [key, fetcher, ttl, ...dependencies]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}

// Import React for the hook
import React from 'react';
