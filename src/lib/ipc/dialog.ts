import { isTauri } from "@tauri-apps/api/core";
import { confirmMock, pickMock } from "./mock";

/** The native folder picker. Returns null when the person cancels. */
export async function pickFolder(): Promise<string | null> {
	if (!isTauri()) return pickMock();
	const { open } = await import("@tauri-apps/plugin-dialog");
	const path = await open({ directory: true, multiple: false });
	return typeof path === "string" ? path : null;
}

export async function confirmDialog(message: string): Promise<boolean> {
	if (!isTauri()) return confirmMock();
	const { ask } = await import("@tauri-apps/plugin-dialog");
	return ask(message, { kind: "info" });
}

export async function errorDialog(message: string): Promise<void> {
	if (!isTauri()) return;
	const { message: show } = await import("@tauri-apps/plugin-dialog");
	await show(message, { kind: "error" });
}
