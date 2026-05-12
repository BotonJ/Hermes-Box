import { render } from "preact";
import { App } from "./App";
import { initTheme } from "./lib/theme";
import "./app.css";

initTheme();
render(<App />, document.getElementById("app")!);
