import { Outlet } from "@tanstack/react-router";
import { useCodeActions } from "@/lib/code";
import { useI18n } from "@/lib/i18n";
import { NotificationsProvider, useNotifications } from "@/lib/notifications";
import { usePrefs } from "@/lib/prefs";
import { ShellProvider, useShell } from "@/lib/shell";
import { CommitDialog } from "@/ui/organisms/commit-dialog";
import { Inspector } from "@/ui/organisms/inspector";
import { Toaster } from "@/ui/organisms/toaster";
import { Shell } from "@/ui/templates/shell";
import { useActions, useShortcuts } from "./actions";
import { useNativeMenu, useShellEvents } from "./events";
import { PaletteHost } from "./palette-host";
import { RefDetail } from "./ref-detail";
import { Sidebar } from "./sidebar";
import { StatusBar } from "./status-bar";
import { ViewMemory } from "./view-memory";

function Frame() {
	const { t } = useI18n();
	const { sidebarOpen } = usePrefs();
	const { inspectorOpen, setInspectorOpen, selectedRef, openRef, commitOpen, setCommitOpen } =
		useShell();
	const { commit: runCommit } = useCodeActions();
	const { list, sync, commit } = useActions();
	useShortcuts(list);
	useNativeMenu(list);
	useShellEvents();
	const { toasts, dismiss } = useNotifications();
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
			<Toaster toasts={toasts} onDismiss={dismiss} />
			<PaletteHost actions={list} />
			<CommitDialog open={commitOpen} onOpenChange={setCommitOpen} onSubmit={runCommit} />
			<ViewMemory />
		</>
	);
}

export function AppShell() {
	return (
		<ShellProvider>
			<NotificationsProvider>
				<Frame />
			</NotificationsProvider>
		</ShellProvider>
	);
}
