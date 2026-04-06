import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#1B2B3A] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-[2.5rem] p-8 text-center shadow-2xl">
            <div className="bg-red-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="text-2xl font-black text-gray-800 mb-2 uppercase tracking-tight">Ops! Algo deu errado</h2>
            <p className="text-gray-500 text-sm mb-8 font-medium">
              Ocorreu um erro inesperado no aplicativo. Por favor, recarregue a página para tentar novamente.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-[#F27D26] text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-orange-500/20 active:scale-95 transition-all"
            >
              Recarregar Página
            </button>
            {this.state.error && (
              <div className="mt-6 p-4 bg-gray-50 rounded-xl text-left overflow-auto max-h-32">
                <p className="text-xs text-red-600 font-mono">{this.state.error.message}</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
