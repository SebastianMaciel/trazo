import { createRoot } from "react-dom/client";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "@xyflow/react/dist/base.css";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);
