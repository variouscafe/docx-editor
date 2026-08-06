import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  /** 커스텀 폴백. 미제공 시 기본 폴백 사용. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** 어떤 영역인지(표시/로깅용). */
  area?: string;
}

interface State {
  error: Error | null;
}

/**
 * 렌더 크래시 격리 — 자식 트리에서 throw 되면 폴백으로 대체.
 * TipTap 등 복잡 영역의 런타임 에러가 앱 전체를 하얀 화면으로 만드는 것을 막는다.
 * reset() 은 자식을 다시 마운트(일시적 에러면 복구), 새로고침은 완전 리로드.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[ErrorBoundary${this.props.area ? `:${this.props.area}` : ""}]`,
      error,
      info,
    );
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return <DefaultFallback error={this.state.error} reset={this.reset} area={this.props.area} />;
    }
    return this.props.children;
  }
}

function DefaultFallback({
  error,
  reset,
  area,
}: {
  error: Error;
  reset: () => void;
  area?: string;
}) {
  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 p-8 text-center">
      <AlertTriangle className="size-8 text-destructive" />
      <div>
        <p className="text-sm font-semibold">
          {area ? `${area} 영역에 문제가 발생했습니다` : "문제가 발생했습니다"}
        </p>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          {error.message || "알 수 없는 오류입니다."}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          <RotateCcw className="size-3.5" /> 다시 시도
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          새로고침
        </button>
      </div>
    </div>
  );
}
