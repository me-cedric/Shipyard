import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, errorDialog, infoDialog, toFailure, unwrap } from "@/lib/ipc";
import { copyText } from "@/lib/menus";
import { usePrefs } from "@/lib/prefs";

/** The folder as a `cd` command for a shell: single quotes keep each character as it is. */
export const cdCommand = (folder: string) => `cd '${folder.replaceAll("'", "'\\''")}'`;

/**
 * Opens the terminal app in a folder of the project (empty: the project folder). An app that takes
 * no folder only opens: the command for the folder goes to the clipboard, and `note` says so.
 */
export async function launchTerminal(folder: string, note: string) {
	try {
		const left = await unwrap(commands.terminalLaunch(folder, true));
		if (left && (await copyText(cdCommand(left)))) await infoDialog(note);
	} catch (e) {
		await errorDialog(toFailure(e).message);
	}
}

/** "Open in the terminal app": the label names the app of Settings / Me when one is set. */
export function useOpenInTerminalApp() {
	const { t } = useI18n();
	const { terminalApp } = usePrefs();
	const apps = useQuery({
		queryKey: ["terminal", "apps"],
		queryFn: () => unwrap(commands.terminalApps()),
		enabled: Boolean(terminalApp),
	}).data;
	const app = apps?.find((a) => a.id === terminalApp)?.label;
	const label = app ? format(t.workspace.view.openApp, { app }) : t.workspace.view.openTerminalApp;
	return useMemo(
		() => ({
			label,
			run: () => void launchTerminal("", t.reports.terminal.paste),
		}),
		[label, t],
	);
}
