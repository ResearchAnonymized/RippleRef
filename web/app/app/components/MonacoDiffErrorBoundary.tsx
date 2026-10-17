'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';

type Props = {
  children: React.ReactNode;
  onRetry?: () => void;
};

type State = {
  hasError: boolean;
  message: string;
};

/** Catches Monaco lazy-chunk failures after dev server / .next rebuilds. */
export default class MonacoDiffErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Failed to load diff editor' };
  }

  componentDidCatch(error: Error) {
    console.warn('Monaco diff chunk error:', error);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: '' });
    this.props.onRetry?.();
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 px-6 py-10 text-center">
        <p className="text-amber-200 font-medium mb-2">IDE diff editor failed to load</p>
        <p className="text-slate-400 text-sm mb-4 max-w-md mx-auto">
          This often happens after a server restart while the tab was still open. Reload to fetch the
          latest script bundle.
        </p>
        <button
          type="button"
          onClick={this.handleRetry}
          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Reload page
        </button>
      </div>
    );
  }
}
