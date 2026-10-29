import { Outlet } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { RefChip } from "@/ui/molecules/ref-chip";
import { Inspector } from "@/ui/organisms/inspector";
import { Shell } from "@/ui/templates/shell";
import { useActions, useShortcuts } from "./actions";
import { PaletteHost } from "./palette-host";
import { ShellProvider, useShell } from "./shell-state";
import { Sidebar } from "./sidebar";
import { StatusBar } from "./status-bar";

function Frame() {
	const { t } = useI18n();
	const { sidebarOpen } = usePrefs();
	const { inspectorOpen, setInspectorOpen, selectedRef } = useShell();
	const { list, sync, commit } = useActions();
	useShortcuts(list);
	const toggle = list.find((a) => a.id === "toggle-sidebar");
	if (!toggle) throw new Error("Missing action: toggle-sidebar");
	return (
		<>
			<Shell
				sidebarOpen={sidebarOpen}
				sidebar={<Sidebar toggle={toggle} />}
				main={<Outlet />}
				inspector={
					<Inspector
						open={inspectorOpen}
						onClose={() => setInspectorOpen(false)}
						title={t.inspector.title}
					>
						{selectedRef ? <RefChip refId={selectedRef} state="unresolved" /> : null}
					</Inspector>
				}
				statusbar={<StatusBar sync={sync} commit={commit} />}
			/>
			<PaletteHost actions={list} />
		</>
	);
}

export function AppShell() {
	return (
		<ShellProvider>
			<Frame />
		</ShellProvider>
	);
}
