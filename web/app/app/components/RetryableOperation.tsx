'use client';

import React, { useState, useCallback } from 'react';
import { RefreshCw, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface RetryableOperationProps {
  operation: () => Promise<any>;
  onSuccess?: (result: any) => void;
  onError?: (error: Error) => void;
  maxRetries?: number;
  retryDelay?: number;
  children: (props: {
    execute: () => Promise<void>;
    isExecuting: boolean;
    error: Error | null;
    retryCount: number;
    canRetry: boolean;
    lastSuccess: boolean;
  }) => React.ReactNode;
}

export default function RetryableOperation({
  operation,
  onSuccess,
  onError,
  maxRetries = 3,
  retryDelay = 1000,
  children
}: RetryableOperationProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [lastSuccess, setLastSuccess] = useState(false);

  const execute = useCallback(async () => {
    setIsExecuting(true);
    setError(null);
    setLastSuccess(false);

    let currentRetry = 0;

    while (currentRetry <= maxRetries) {
      try {
        const result = await operation();
        setLastSuccess(true);
        setRetryCount(currentRetry);
        onSuccess?.(result);
        break;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setRetryCount(currentRetry);

        if (currentRetry === maxRetries) {
          onError?.(error);
          break;
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelay * (currentRetry + 1)));
        currentRetry++;
      }
    }

    setIsExecuting(false);
  }, [operation, onSuccess, onError, maxRetries, retryDelay]);

  const canRetry = retryCount < maxRetries && !isExecuting;

  return (
    <>
      {children({
        execute,
        isExecuting,
        error,
        retryCount,
        canRetry,
        lastSuccess
      })}
    </>
  );
}

// Hook for easy retry functionality
export const useRetryableOperation = (
  operation: () => Promise<any>,
  options: {
    maxRetries?: number;
    retryDelay?: number;
    onSuccess?: (result: any) => void;
    onError?: (error: Error) => void;
  } = {}
) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [lastSuccess, setLastSuccess] = useState(false);

  const execute = useCallback(async () => {
    setIsExecuting(true);
    setError(null);
    setLastSuccess(false);

    const { maxRetries = 3, retryDelay = 1000, onSuccess, onError } = options;
    let currentRetry = 0;

    while (currentRetry <= maxRetries) {
      try {
        const result = await operation();
        setLastSuccess(true);
        setRetryCount(currentRetry);
        onSuccess?.(result);
        break;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setRetryCount(currentRetry);

        if (currentRetry === maxRetries) {
          onError?.(error);
          break;
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelay * (currentRetry + 1)));
        currentRetry++;
      }
    }

    setIsExecuting(false);
  }, [operation, options]);

  const canRetry = retryCount < (options.maxRetries || 3) && !isExecuting;

  return {
    execute,
    isExecuting,
    error,
    retryCount,
    canRetry,
    lastSuccess
  };
};

// Error display component
export function ErrorDisplay({ 
  error, 
  retryCount, 
  canRetry, 
  onRetry, 
  isRetrying = false 
}: {
  error: Error | null;
  retryCount: number;
  canRetry: boolean;
  onRetry: () => void;
  isRetrying?: boolean;
}) {
  if (!error) return null;

  return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-4">
      <div className="flex items-start space-x-3">
        <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h4 className="text-red-400 font-semibold mb-2">Operation Failed</h4>
          <p className="text-slate-300 text-sm mb-3">{error.message}</p>
          
          {retryCount > 0 && (
            <div className="flex items-center space-x-2 text-xs text-slate-400 mb-3">
              <Clock className="w-3 h-3" />
              <span>Retry attempt: {retryCount}</span>
            </div>
          )}

          {canRetry && (
            <button
              onClick={onRetry}
              disabled={isRetrying}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center space-x-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
              <span>{isRetrying ? 'Retrying...' : 'Retry'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Success display component
export function SuccessDisplay({ 
  message = "Operation completed successfully",
  showIcon = true 
}: {
  message?: string;
  showIcon?: boolean;
}) {
  return (
    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 mb-4">
      <div className="flex items-center space-x-3">
        {showIcon && <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />}
        <p className="text-emerald-400 font-medium">{message}</p>
      </div>
    </div>
  );
}
