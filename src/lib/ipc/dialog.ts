import { isTauri } from "@tauri-apps/api/core";
import { confirmMock, pickFileMock, pickMock } from "./mock";

/** The native folder picker. Returns null when the person cancels. */
export async function pickFolder(): Promise<string | null> {
	if (!isTauri()) return pickMock();
	const { open } = await import("@tauri-apps/plugin-dialog");
	const path = await open({ directory: true, multiple: false });
	return typeof path === "string" ? path : null;
}

const EXCEL = [{ name: "Excel", extensions: ["xlsx"] }];

/** The native picker for a workbook to read. Returns null when the person cancels. */
export async function pickWorkbook(): Promise<string | null> {
	if (!isTauri()) return pickFileMock();
	const { open } = await import("@tauri-apps/plugin-dialog");
	const path = await open({ multiple: false, filters: EXCEL });
	return typeof path === "string" ? path : null;
}

const PEM = [{ name: "Certificate", extensions: ["pem", "crt", "cer"] }];

/** The native picker for a PEM bundle. Returns null when the person cancels. */
export async function pickCertificate(): Promise<string | null> {
	if (!isTauri()) return pickFileMock();
	const { open } = await import("@tauri-apps/plugin-dialog");
	const path = await open({ multiple: false, filters: PEM });
	return typeof path === "string" ? path : null;
}

/** The native dialog for the workbook to write. Returns null when the person cancels. */
export async function saveWorkbook(name: string): Promise<string | null> {
	if (!isTauri()) return pickFileMock();
	const { save } = await import("@tauri-apps/plugin-dialog");
	return save({ defaultPath: `${name}.xlsx`, filters: EXCEL });
}

/** The native dialog for a file of any one extension to write. Returns null when the person cancels. */
export async function saveAs(name: string, ext: string): Promise<string | null> {
	if (!isTauri()) return `/mock/${name}.${ext}`;
	const { save } = await import("@tauri-apps/plugin-dialog");
	return save({
		defaultPath: `${name}.${ext}`,
		filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
	});
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
