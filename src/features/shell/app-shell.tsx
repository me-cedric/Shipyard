import { Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { AssistantPanel, useAssistant } from "@/features/assistant";
import { useCodeActions } from "@/lib/code";
import { useI18n } from "@/lib/i18n";
import { NotificationsProvider, useNotifications } from "@/lib/notifications";
import { usePrefs } from "@/lib/prefs";
import { type RefActions, ShellProvider, useShell } from "@/lib/shell";
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
	const {
		inspectorOpen,
		setInspectorOpen,
		selectedRef,
		openRef,
		detail,
		closeDetail,
		commitOpen,
		setCommitOpen,
		assistantOpen,
		setAssistantOpen,
	} = useShell();
	const { commit: runCommit } = useCodeActions();
	const { list, sync, commit, assistant } = useActions();
	useShortcuts(list);
	useNativeMenu(list);
	useShellEvents();
	const { toasts, dismiss } = useNotifications();
	// A detail belongs to the view that opened it: leaving the view closes it.
	const path = useRouterState({ select: (s) => s.location.pathname });
	// One assistant for every space: the shell holds its state, so a change of view keeps it.
	const chat = useAssistant({ open: assistantOpen, view: path, selected: selectedRef });
	const open = useRef(detail);
	open.current = detail;
	// biome-ignore lint/correctness/useExhaustiveDependencies: only a change of view closes the detail
	useEffect(() => {
		if (open.current) closeDetail();
	}, [path, closeDetail]);
	const toggle = list.find((a) => a.id === "toggle-sidebar");
	if (!toggle) throw new Error("Missing action: toggle-sidebar");
	return (
		<>
			<Shell
				sidebarOpen={sidebarOpen}
				sidebar={<Sidebar toggle={toggle} />}
				main={<Outlet />}
				assistantSide={chat.side}
				assistant={
					<AssistantPanel
						assistant={chat}
						open={assistantOpen}
						onClose={() => setAssistantOpen(false)}
						onOpenRef={openRef}
					/>
				}
				inspector={
					<Inspector
						open={inspectorOpen}
						onClose={() => setInspectorOpen(false)}
						title={detail?.title ?? t.inspector.title}
					>
						{detail ? (
							detail.node
						) : selectedRef ? (
							<RefDetail refId={selectedRef} onOpen={openRef} />
						) : null}
					</Inspector>
				}
				statusbar={<StatusBar sync={sync} commit={commit} assistant={assistant} />}
			/>
			<Toaster toasts={toasts} onDismiss={dismiss} />
			<PaletteHost actions={list} />
			<CommitDialog open={commitOpen} onOpenChange={setCommitOpen} onSubmit={runCommit} />
			<ViewMemory />
		</>
	);
}

export function AppShell({ refActions }: { refActions?: RefActions }) {
	return (
		<ShellProvider refActions={refActions}>
			<NotificationsProvider>
				<Frame />
			</NotificationsProvider>
		</ShellProvider>
	);
}
