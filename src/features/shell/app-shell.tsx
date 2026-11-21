import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	AskOnItem,
	AssistantContext,
	AssistantPanel,
	SelectionActions,
	useAssistant,
} from "@/features/assistant";
import { FileDrawer } from "@/features/code/file-drawer";
import { TerminalDrawer } from "@/features/code/terminal-drawer";
import { Tour } from "@/features/onboarding";
import { useCodeActions } from "@/lib/code";
import { useAnchorArrival } from "@/lib/errors/anchor";
import { useI18n } from "@/lib/i18n";
import { NotificationsProvider, useNotifications } from "@/lib/notifications";
import { usePrefs } from "@/lib/prefs";
import { useActiveProject } from "@/lib/projects";
import { useRights } from "@/lib/rights";
import { type RefActions, ShellProvider, useShell } from "@/lib/shell";
import { CommitDialog } from "@/ui/organisms/commit-dialog";
import { Inspector } from "@/ui/organisms/inspector";
import { Toaster } from "@/ui/organisms/toaster";
import { Shell } from "@/ui/templates/shell";
import { useActions, useShortcuts } from "./actions";
import { BareContext } from "./bare";
import { CloseGuard } from "./close-guard";
import { ContextBar } from "./context-bar";
import { useDropFolder } from "./drop-folder";
import { useCloseGuardEvent, useNativeMenu, useShellEvents } from "./events";
import { RouteAnnouncer, SkipLink } from "./page-chrome";
import { ProjectCloseAsk } from "./project-close";
import { RefDetail } from "./ref-detail";
import { ShortcutHelp } from "./shortcut-help";
import { Sidebar } from "./sidebar";
import { ViewMemory } from "./view-memory";
import { WhatsNew } from "./whats-new";

function Frame() {
	const { t } = useI18n();
	const { sidebarOpen, navSide, drawerSide, terminalDock } = usePrefs();
	const {
		inspectorOpen,
		setInspectorOpen,
		selectedRef,
		sideSelected,
		openRef,
		viewChanged,
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
	const { gate } = useRights();
	const { list: all, sync, commit, palette, fetch, push, back, forward } = useActions();
	// The count of pages that show without the shell: the first run and "No project is open".
	const [claims, setBare] = useState(0);
	const claimBare = useCallback(() => {
		setBare((n) => n + 1);
		return () => setBare((n) => n - 1);
	}, []);
	// Before the first page shows, the frame is bare: the shell does not flash before the first run.
	const first = useRouterState({
		select: (s) => (s.resolvedLocation?.pathname ?? "/") === "/",
	});
	const shown = useRef(false);
	if (!first) shown.current = true;
	const bare = (first && !shown.current) || claims > 0;
	// A bare page has no Ask bar: the actions that open it do nothing.
	const list = useMemo(
		() =>
			bare
				? all.map((a) =>
						a.id === "palette" || a.id === "project-switch" ? { ...a, disabled: true } : a,
					)
				: all,
		[all, bare],
	);
	useShortcuts(list);
	useNativeMenu(list);
	useShellEvents();
	useDropFolder();
	useCloseGuardEvent();
	useAnchorArrival();
	const { toasts, dismiss, hold } = useNotifications();
	// A detail belongs to the view that opened it: leaving the view closes it.
	const path = useRouterState({ select: (s) => s.location.pathname });
	// One assistant for every space: the shell holds its state, so a change of view keeps it.
	// The Ask page is the full assistant: it shows the same state, and the side panel leaves the frame.
	const full = path === "/ask";
	const chatOpen = assistantOpen || full;
	const navigate = useNavigate();
	const chat = useAssistant({ open: chatOpen, view: path, selected: selectedRef });
	// The Explain action of the inspector, the palette and the menu waits for a thread.
	const { current, busy, explain } = chat;
	useEffect(() => {
		if (!explainRef || !chatOpen || !current || busy) return;
		clearExplain();
		void explain(explainRef);
	}, [explainRef, chatOpen, current, busy, explain, clearExplain]);
	// A view that asks the assistant (a pull request, a conflict) leaves its text in the draft.
	const { setDraft } = chat;
	useEffect(() => {
		if (prefill === null || !chatOpen || !current) return;
		setDraft(prefill);
		clearPrefill();
	}, [prefill, chatOpen, current, setDraft, clearPrefill]);
	const open = useRef(detail);
	open.current = detail;
	// A change of view closes the detail and drops the selection of the view that it leaves.
	useEffect(() => {
		if (open.current) closeDetail();
		viewChanged(path);
	}, [path, closeDetail, viewChanged]);
	const toggle = list.find((a) => a.id === "toggle-sidebar");
	if (!toggle) throw new Error("Missing action: toggle-sidebar");
	return (
		<BareContext.Provider value={claimBare}>
			<SkipLink />
			<RouteAnnouncer />
			<Shell
				sidebarOpen={sidebarOpen}
				navSide={navSide}
				drawerSide={drawerSide}
				bare={bare}
				contextbar={
					bare ? null : (
						<ContextBar
							sync={sync}
							fetch={fetch}
							push={push}
							commit={commit}
							actions={list}
							palette={palette}
							back={back}
							forward={forward}
							toggleSidebar={toggle}
						/>
					)
				}
				sidebar={<Sidebar />}
				main={
					<AssistantContext.Provider value={chat}>
						<Outlet />
					</AssistantContext.Provider>
				}
				drawer={
					project && filesOpen ? (
						<FileDrawer key={project.id} onClose={() => setFilesOpen(false)} />
					) : null
				}
				bottom={
					// With no project the shell starts in the home folder: a sign-in needs it.
					<TerminalDrawer
						key={project?.id}
						open={terminalOpen}
						onHide={() => setTerminalOpen(false)}
					/>
				}
				bottomDock={terminalDock}
				assistantSide={chat.side}
				assistant={
					full ? null : (
						<AssistantPanel
							assistant={chat}
							open={assistantOpen}
							onClose={() => setAssistantOpen(false)}
							onOpenRef={openRef}
							onFull={() => void navigate({ to: "/ask" })}
						/>
					)
				}
				inspector={
					<Inspector
						open={inspectorOpen}
						onClose={() => setInspectorOpen(false)}
						title={detail?.title ?? t.inspector.title}
						// A link opens as a card over the page. The detail of a view and a row that a page selects stay a side panel.
						card={!detail && selectedRef !== null && !sideSelected}
					>
						{detail ? (
							detail.node
						) : selectedRef ? (
							<RefDetail refId={selectedRef} onOpen={openRef} />
						) : null}
					</Inspector>
				}
			/>
			<Toaster toasts={toasts} onDismiss={dismiss} onHold={hold} />
			<ShortcutHelp actions={list} />
			<SelectionActions onAsk={ask} />
			<AskOnItem />
			<CloseGuard />
			<ProjectCloseAsk />
			<WhatsNew />
			<Tour />
			<CommitDialog
				open={commitOpen}
				onOpenChange={setCommitOpen}
				onSubmit={runCommit}
				reason={gate("code.write").reason}
			/>
			<ViewMemory />
		</BareContext.Provider>
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
