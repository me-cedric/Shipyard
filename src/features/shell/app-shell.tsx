import { Outlet } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { ShellProvider, useShell } from "@/lib/shell";
import { Inspector } from "@/ui/organisms/inspector";
import { Shell } from "@/ui/templates/shell";
import { useActions, useShortcuts } from "./actions";
import { PaletteHost } from "./palette-host";
import { RefDetail } from "./ref-detail";
import { Sidebar } from "./sidebar";
import { StatusBar } from "./status-bar";
import { ViewMemory } from "./view-memory";

function Frame() {
	const { t } = useI18n();
	const { sidebarOpen } = usePrefs();
	const { inspectorOpen, setInspectorOpen, selectedRef, openRef } = useShell();
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
						{selectedRef ? <RefDetail refId={selectedRef} onOpen={openRef} /> : null}
					</Inspector>
				}
				statusbar={<StatusBar sync={sync} commit={commit} />}
			/>
			<PaletteHost actions={list} />
			<ViewMemory />
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
