import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Error capturado por ErrorBoundary:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-lg w-full bg-card border border-destructive/30 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0" />
              <h1 className="text-lg font-bold text-foreground">Ocurrió un error al cargar el sistema</h1>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              La aplicación encontró un problema inesperado. Puedes intentar recargar la página — si el problema persiste, comparte este mensaje con soporte técnico.
            </p>
            <pre className="text-xs bg-background border border-border rounded-lg p-3 mb-4 overflow-x-auto text-destructive whitespace-pre-wrap break-words max-h-40">
              {this.state.error.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all text-sm"
            >
              <RotateCcw className="w-4 h-4" /> Recargar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}