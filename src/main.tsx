import { render } from "preact";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initTheme, getEffectiveTheme } from "./lib/theme";
import { applyHermesColors } from "./lib/hermes-colors";
import "./app.css";

initTheme();
applyHermesColors(getEffectiveTheme()).catch(() => {});
render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
  document.getElementById("app")!,
);
