import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || 'Unexpected rendering error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[320px] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-lg border border-red-900/60 bg-[#0E1729] p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-slate-100">View Encountered an Error</h2>
            <p className="text-sm text-slate-400 mt-2">{this.state.errorMessage}</p>
            <button
              onClick={() => this.setState({ hasError: false, errorMessage: '' })}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-teal-600 hover:bg-teal-500 text-sm font-medium text-white transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Retry View
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
