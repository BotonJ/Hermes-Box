import { Component, type ComponentChildren } from "preact";

interface Props {
  children: ComponentChildren;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[ErrorBoundary] Caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100vh", padding: "2rem",
          fontFamily: "monospace", background: "#1a1a2e", color: "#e0e0e0",
        }}>
          <h1 style={{ color: "#ff6b6b", marginBottom: "1rem" }}>HermesBox 启动失败</h1>
          <pre style={{
            background: "#16213e", padding: "1rem", borderRadius: "8px",
            maxWidth: "80vw", overflow: "auto", whiteSpace: "pre-wrap",
            fontSize: "13px", lineHeight: "1.5",
          }}>
            {this.state.error?.message ?? "Unknown error"}
            {"\n\n"}
            {this.state.error?.stack ?? ""}
          </pre>
          <button
            onClick={() => { localStorage.clear(); location.reload(); }}
            style={{
              marginTop: "1rem", padding: "8px 24px", cursor: "pointer",
              background: "#0f3460", color: "#e0e0e0", border: "1px solid #533483",
              borderRadius: "6px", fontSize: "14px",
            }}
          >
            清除缓存并重载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
