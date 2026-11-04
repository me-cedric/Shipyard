import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, errorDialog, toFailure, unwrap } from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";

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
			run: () =>
				void unwrap(commands.terminalLaunch("", true)).catch((e) =>
					errorDialog(toFailure(e).message),
				),
		}),
		[label],
	);
}
