'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
}

export default class ErrorBoundary extends Component<Props, State> {
  private maxRetries = 3;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      retryCount: 0
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    // Call the onError callback if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log error to external service (in production)
    if (process.env.NODE_ENV === 'production') {
      // TODO: Send to error reporting service
      console.error('Production error:', { error: error.message, stack: error.stack, errorInfo });
    }
  }

  handleRetry = () => {
    if (this.state.retryCount < this.maxRetries) {
      this.setState(prevState => ({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: prevState.retryCount + 1
      }));
    }
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const canRetry = this.state.retryCount < this.maxRetries;
      const isLastRetry = this.state.retryCount === this.maxRetries - 1;

      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-8">
          <div className="max-w-2xl mx-auto text-center">
            <div className="relative mb-8">
              <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center mx-auto shadow-2xl">
                <AlertTriangle className="w-12 h-12 text-red-400" />
              </div>
              <div className="absolute -inset-2 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-full blur-xl"></div>
            </div>

            <h1 className="text-3xl font-bold text-white mb-4">Something went wrong</h1>
            <p className="text-slate-300 text-lg mb-8">
              We encountered an unexpected error. Don't worry, your data is safe.
            </p>

            {/* Error Details (Development Only) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="bg-slate-800/50 rounded-lg p-6 mb-8 text-left">
                <h3 className="text-red-400 font-semibold mb-3 flex items-center">
                  <Bug className="w-4 h-4 mr-2" />
                  Error Details (Development)
                </h3>
                <div className="text-sm text-slate-300 space-y-2">
                  <div>
                    <strong>Error:</strong> {this.state.error.message}
                  </div>
                  {this.state.error.stack && (
                    <div>
                      <strong>Stack:</strong>
                      <pre className="mt-2 p-3 bg-slate-900 rounded text-xs overflow-auto max-h-40">
                        {this.state.error.stack}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {canRetry && (
                <button
                  onClick={this.handleRetry}
                  className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-8 py-4 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 inline-flex items-center justify-center"
                >
                  <RefreshCw className="w-5 h-5 mr-3" />
                  {isLastRetry ? 'Last Retry' : `Retry (${this.maxRetries - this.state.retryCount} left)`}
                </button>
              )}
              
              <button
                onClick={this.handleGoHome}
                className="bg-slate-700 hover:bg-slate-600 text-white px-8 py-4 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 inline-flex items-center justify-center"
              >
                <Home className="w-5 h-5 mr-3" />
                Go to Home
              </button>

              <button
                onClick={this.handleReload}
                className="bg-slate-600 hover:bg-slate-500 text-white px-8 py-4 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 inline-flex items-center justify-center"
              >
                <RefreshCw className="w-5 h-5 mr-3" />
                Reload Page
              </button>
            </div>

            {/* Retry Counter */}
            {this.state.retryCount > 0 && (
              <p className="text-slate-400 text-sm mt-6">
                Retry attempt: {this.state.retryCount} of {this.maxRetries}
              </p>
            )}

            {/* Help Text */}
            <div className="mt-8 p-4 bg-slate-800/30 rounded-lg">
              <p className="text-slate-400 text-sm">
                If this problem persists, please try refreshing the page or contact support.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook for functional components to trigger error boundary
export const useErrorHandler = () => {
  const throwError = (error: Error) => {
    throw error;
  };

  const handleAsyncError = (error: Error) => {
    console.error('Async error:', error);
    // In a real app, you might want to show a toast notification
    // or send to an error reporting service
  };

  return { throwError, handleAsyncError };
};
