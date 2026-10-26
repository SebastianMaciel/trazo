import { createRoot } from "react-dom/client";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/inter";
import "@fontsource-variable/literata";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/share-tech-mono";
import "@xyflow/react/dist/base.css";
import { App } from "./App";
import { applyTheme, savedTheme } from "./panels/ThemePicker";
import "./styles.css";
import "./themes.css";

applyTheme(savedTheme());
createRoot(document.getElementById("root")!).render(<App />);
