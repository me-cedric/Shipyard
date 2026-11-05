import { isTauri } from "@tauri-apps/api/core";
import { confirmMock, pickFileMock, pickMock, saveMock } from "./mock";

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

const ZIP = [{ name: "Zip", extensions: ["zip"] }];

/** The native picker for a plugin zip. Returns null when the person cancels. */
export async function pickPlugin(): Promise<string | null> {
	if (!isTauri()) return pickFileMock();
	const { open } = await import("@tauri-apps/plugin-dialog");
	const path = await open({ multiple: false, filters: ZIP });
	return typeof path === "string" ? path : null;
}

const JSON_FILE = [{ name: "JSON", extensions: ["json"] }];

/** The native picker for a theme file. Returns null when the person cancels. */
export async function pickTheme(): Promise<string | null> {
	if (!isTauri()) return pickFileMock();
	const { open } = await import("@tauri-apps/plugin-dialog");
	const path = await open({ multiple: false, filters: JSON_FILE });
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

const LAST_DIR = "shipyard.saveDir";

/**
 * The native "Save as" dialog for a file of one extension, with the name and the type filled in.
 * It opens in the folder of the last save. Returns null when the person cancels.
 */
export async function saveAs(name: string, ext: string): Promise<string | null> {
	if (!isTauri()) return saveMock(`/mock/${name}.${ext}`);
	const { save } = await import("@tauri-apps/plugin-dialog");
	const dir = localStorage.getItem(LAST_DIR);
	const path = await save({
		defaultPath: dir ? `${dir}/${name}.${ext}` : `${name}.${ext}`,
		filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
	});
	if (path) localStorage.setItem(LAST_DIR, path.replace(/[\\/][^\\/]*$/, ""));
	return path;
}

const IMAGE = [{ name: "Image", extensions: ["png", "jpg", "jpeg"] }];

/** The native picker for a PNG or JPEG picture. Returns null when the person cancels. */
export async function pickImage(): Promise<string | null> {
	if (!isTauri()) return pickFileMock();
	const { open } = await import("@tauri-apps/plugin-dialog");
	const path = await open({ multiple: false, filters: IMAGE });
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
