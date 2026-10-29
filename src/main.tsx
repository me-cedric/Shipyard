import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/app";
import { isTauri } from "@/lib/ipc";
import { installMockIpc } from "@/lib/ipc/mock";
import "@/ui/tokens/tokens.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

// Outside Tauri (browser, Playwright) the generated mock serves the commands. The browser build
// opens the demo project first, so a reviewer reaches every space. The e2e build turns it off.
if (!isTauri()) installMockIpc({ demo: import.meta.env.VITE_MOCK_DEMO !== "0" });

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
