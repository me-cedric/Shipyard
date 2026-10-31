import { Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { AskOnItem, AssistantPanel, SelectionActions, useAssistant } from "@/features/assistant";
import { FileDrawer } from "@/features/code/file-drawer";
import { TerminalDrawer } from "@/features/code/terminal-drawer";
import { useCodeActions } from "@/lib/code";
import { useI18n } from "@/lib/i18n";
import { NotificationsProvider, useNotifications } from "@/lib/notifications";
import { usePrefs } from "@/lib/prefs";
import { useActiveProject } from "@/lib/projects";
import { type RefActions, ShellProvider, useShell } from "@/lib/shell";
import { CommitDialog } from "@/ui/organisms/commit-dialog";
import { Inspector } from "@/ui/organisms/inspector";
import { Toaster } from "@/ui/organisms/toaster";
import { Shell } from "@/ui/templates/shell";
import { useActions, useShortcuts } from "./actions";
import { CloseGuard } from "./close-guard";
import { ContextBar } from "./context-bar";
import { useCloseGuardEvent, useNativeMenu, useShellEvents } from "./events";
import { PaletteHost } from "./palette-host";
import { RefDetail } from "./ref-detail";
import { ShortcutHelp } from "./shortcut-help";
import { Sidebar } from "./sidebar";
import { StatusBar } from "./status-bar";
import { ViewMemory } from "./view-memory";
import { WhatsNew } from "./whats-new";

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
		explainRef,
		clearExplain,
		prefill,
		clearPrefill,
		ask,
		filesOpen,
		setFilesOpen,
		terminalOpen,
		setTerminalOpen,
	} = useShell();
	const project = useActiveProject().data;
	const { commit: runCommit } = useCodeActions();
	const { list, sync, commit, assistant, palette, files, terminal } = useActions();
	useShortcuts(list);
	useNativeMenu(list);
	useShellEvents();
	useCloseGuardEvent();
	const { toasts, dismiss } = useNotifications();
	// A detail belongs to the view that opened it: leaving the view closes it.
	const path = useRouterState({ select: (s) => s.location.pathname });
	// One assistant for every space: the shell holds its state, so a change of view keeps it.
	const chat = useAssistant({ open: assistantOpen, view: path, selected: selectedRef });
	// The Explain action of the inspector, the palette and the menu waits for a thread.
	const { current, busy, explain } = chat;
	useEffect(() => {
		if (!explainRef || !assistantOpen || !current || busy) return;
		clearExplain();
		void explain(explainRef);
	}, [explainRef, assistantOpen, current, busy, explain, clearExplain]);
	// A view that asks the assistant (a pull request, a conflict) leaves its text in the draft.
	const { setDraft } = chat;
	useEffect(() => {
		if (prefill === null || !assistantOpen || !current) return;
		setDraft(prefill);
		clearPrefill();
	}, [prefill, assistantOpen, current, setDraft, clearPrefill]);
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
				contextbar={
					<ContextBar
						sync={sync}
						assistant={assistant}
						palette={palette}
						files={files}
						terminal={terminal}
					/>
				}
				sidebar={<Sidebar toggle={toggle} />}
				main={<Outlet />}
				drawer={
					project && filesOpen ? (
						<FileDrawer key={project.id} onClose={() => setFilesOpen(false)} />
					) : null
				}
				bottom={
					project ? (
						<TerminalDrawer
							key={project.id}
							open={terminalOpen}
							onHide={() => setTerminalOpen(false)}
						/>
					) : null
				}
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
				statusbar={<StatusBar commit={commit} />}
			/>
			<Toaster toasts={toasts} onDismiss={dismiss} />
			<PaletteHost actions={list} />
			<ShortcutHelp actions={list} />
			<SelectionActions onAsk={ask} />
			<AskOnItem />
			<CloseGuard />
			<WhatsNew />
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
