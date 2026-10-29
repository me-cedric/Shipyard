import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/app";
import { isTauri } from "@/lib/ipc";
import { installMockIpc } from "@/lib/ipc/mock";
import "@/ui/tokens/tokens.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

// Outside Tauri (browser, Playwright) the generated mock serves the commands.
if (!isTauri()) installMockIpc();

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
