import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { useWatchNotice } from "@/lib/code";
import { useFileChanges } from "@/lib/files";
import { needsYouNotice, useFactoryEvents, useInboxActions, usePendingNoticeIds } from "@/lib/home";
import { format, type Messages, useI18n } from "@/lib/i18n";
import { commands, isTauri, unwrap } from "@/lib/ipc";
import { logError } from "@/lib/log";
import {
	checkNotices,
	fresh,
	noticeTarget,
	reviewDraftNotice,
	runEndedNotice,
	scanNotices,
	useNotifications,
} from "@/lib/notifications";
import { usePrefs } from "@/lib/prefs";
import { useProjectActions } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { TICK_EVENT, useSyncTick } from "@/lib/sync";
import { useUpdateCheck } from "@/lib/updates";
import type { Action } from "./actions";

/** The palette actions that the native menu runs (REQ-012). The Rust menu holds the same ids. */
export const MENU_ACTIONS = [
	"project-open",
	"project-switch",
	"project-close",
	"sync",
	"fetch",
	"push",
	"commit",
	"palette",
	"toggle-sidebar",
	"toggle-inspector",
	"toggle-assistant",
	"toggle-theme",
	"go-home",
	"go-design",
	"go-specs",
	"go-work",
	"go-factory",
	"go-code",
	"go-knowledge",
	"go-settings",
	"shortcuts-help",
	"update-check",
	"nav-back",
	"nav-forward",
	"manual",
	"text-larger",
	"text-smaller",
	"text-reset",
] as const;

/** The text of each native menu item, in the language of the person. Keyed by item id. */
export const menuLabels = (t: Messages): Record<string, string> => ({
	app: t.menu.app,
	file: t.menu.file,
	edit: t.menu.edit,
	view: t.menu.view,
	window: t.menu.window,
	help: t.menu.help,
	go: t.ui.menu.go,
	about: t.menu.about,
	quit: t.menu.quit,
	undo: t.menu.undo,
	redo: t.menu.redo,
	cut: t.menu.cut,
	copy: t.menu.copy,
	paste: t.menu.paste,
	selectAll: t.menu.selectAll,
	minimize: t.menu.minimize,
	maximize: t.menu.maximize,
	fullscreen: t.menu.fullscreen,
	closeWindow: t.menu.closeWindow,
	"project-open": t.projects.open,
	"project-switch": t.menu.projectSwitch,
	"project-close": t.projects.close,
	sync: t.shell.sync,
	fetch: t.workspace.view.fetchOnly,
	push: t.workspace.view.push,
	commit: t.shell.commit,
	palette: t.palette.title,
	"toggle-sidebar": t.shell.toggleSidebar,
	"toggle-inspector": t.shell.toggleInspector,
	"toggle-assistant": t.ui.menu.toggleAssistant,
	"toggle-theme": t.ui.menu.toggleTheme,
	"go-home": t.space.home,
	"go-design": t.space.design,
	"go-specs": t.space.specs,
	"go-work": t.space.work,
	"go-factory": t.space.factory,
	"go-code": t.space.code,
	"go-knowledge": t.space.knowledge,
	"go-settings": t.space.settings,
	"shortcuts-help": t.ui.menu.shortcuts,
	"update-check": t.menu.updateCheck,
	"nav-back": t.workspace.view.back,
	"nav-forward": t.workspace.view.forward,
	manual: t.knowledge.manual.open,
	"text-larger": t.workspace.view.textLarger,
	"text-smaller": t.workspace.view.textSmaller,
	"text-reset": t.workspace.view.textReset,
});

/** The native menu: its labels follow the language, and a click runs the palette action. */
export function useNativeMenu(list: Action[]) {
	const { t } = useI18n();
	useEffect(() => {
		if (isTauri()) unwrap(commands.shellMenu(menuLabels(t))).catch(logError);
	}, [t]);

	// The listener reads the latest list, so it is set once.
	const latest = useRef(list);
	latest.current = list;
	useEffect(() => {
		if (!isTauri()) return;
		const off = listen<string>("menu-action", (e) => {
			const action = latest.current.find((a) => a.id === e.payload);
			if (action && !action.disabled) action.run();
		});
		return () => void off.then((f) => f());
	}, []);
}

/** The window asks to close while a run or an assistant turn works: the shell shows the guard. */
export function useCloseGuardEvent() {
	const { setCloseGuardOpen } = useShell();
	useEffect(() => {
		if (!isTauri()) return;
		const off = listen("close-guard", () => setCloseGuardOpen(true));
		return () => void off.then((f) => f());
	}, [setCloseGuardOpen]);
}

/** The menu bar panel switched the project: the window goes to the project with its own switcher flow. */
export const PROJECT_SWITCHED_EVENT = "project-switched";

/** The menu bar panel opens an item: the window shows it in the inspector. The payload is its ref. */
export const OPEN_REF_EVENT = "open-ref";

function useOpenRefEvent() {
	const { openRef } = useShell();
	const latest = useRef(openRef);
	latest.current = openRef;
	useEffect(() => {
		if (!isTauri()) return;
		const off = listen<string>(OPEN_REF_EVENT, (e) => latest.current(e.payload));
		return () => void off.then((f) => f());
	}, []);
}

function useProjectSwitchedEvent() {
	const { switchTo } = useProjectActions();
	const latest = useRef(switchTo);
	latest.current = switchTo;
	useEffect(() => {
		if (!isTauri()) return;
		const off = listen<string>(
			PROJECT_SWITCHED_EVENT,
			(e) => void latest.current(e.payload).catch(logError),
		);
		return () => void off.then((f) => f());
	}, []);
}

/**
 * On each sync tick: reads the checks of the pull requests of the person from the code host, and
 * the last reports of the scans. The first read of a session makes no entry.
 */
function useTickNotices() {
	const { t } = useI18n();
	const { push } = useNotifications();
	const latest = useRef(t);
	latest.current = t;
	const seen = useRef(new Set<string>());
	// A read primes one source of one project, and only when the read worked.
	const primed = useRef(new Set<string>());
	useEffect(() => {
		if (!isTauri()) return;
		const read = async () => {
			const project = (await unwrap(commands.projectsActive()).catch(() => null))?.id ?? "";
			const [rows, view] = await Promise.all([
				unwrap(commands.codeMyChecks()).catch(() => null),
				unwrap(commands.codeQuality()).catch(() => null),
			]);
			const sources = [
				["checks", rows && checkNotices(rows, latest.current)],
				["scans", view && scanNotices(view, latest.current)],
			] as const;
			for (const [name, found] of sources) {
				if (!found) continue;
				const key = `${project}:${name}`;
				const list = fresh(found, seen.current, !primed.current.has(key));
				primed.current.add(key);
				for (const n of list) void push(n);
			}
		};
		const off = listen(TICK_EVENT, () => void read().catch(logError));
		return () => void off.then((f) => f());
	}, [push]);
}

export const UPDATE_CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** The sources of the notification centre: the update check, a failed sync, a moved remote head
 * and the factory events that need the person. */
export function useShellEvents() {
	const { t } = useI18n();
	const { push, resolve } = useNotifications();
	const { syncError, openRef } = useShell();
	const inbox = useInboxActions();
	const notice = useWatchNotice().data?.changes[0];
	const checkUpdate = useUpdateCheck();
	// An action done anywhere (Inbox, run page, a button here) takes its notice away.
	const pending = usePendingNoticeIds();
	useEffect(() => {
		if (pending) resolve(pending.live, pending.at);
	}, [pending, resolve]);
	useSyncTick();
	useFileChanges();
	useTickNotices();
	useProjectSwitchedEvent();
	useOpenRefEvent();

	// A question, an approval or a run that needs the person: one entry and one system notice (REQ-008).
	// A run that ends and an automatic review draft add their own entry (their own switch).
	useFactoryEvents((event, payload) => {
		void (async () => {
			const n = await needsYouNotice(event, payload, t);
			// The buttons act where the person reads: Approve and Refuse send at once, Answer opens the run.
			const id = Number(payload.id);
			const actions =
				event === "factory-approval"
					? [
							{ label: t.home.approve, run: () => void inbox.approve(id).catch(logError) },
							{ label: t.home.reject, run: () => void inbox.reject(id).catch(logError) },
						]
					: event === "factory-question"
						? [{ label: t.home.notice.answer, run: () => openRef(`run:${payload.run}`) }]
						: undefined;
			if (n) await push({ ...n, actions });
			// The failure shows once: the run source covers it, unless the person turned it off.
			const off = (await unwrap(commands.prefsGet()).catch(() => null))?.notifyOff ?? [];
			const more =
				event === "factory-run"
					? await runEndedNotice(payload.run, t, n !== null && !off.includes("run"))
					: event === "factory-review"
						? await reviewDraftNotice(payload.id, t)
						: null;
			if (more) await push(more);
		})().catch(logError);
	});

	// One check at start and one every 6 hours, while the switch in Settings / Me is on.
	const { autoUpdateCheck, loaded } = usePrefs();
	// biome-ignore lint/correctness/useExhaustiveDependencies: `checkUpdate` changes with the language
	useEffect(() => {
		if (!loaded || !autoUpdateCheck) return;
		void checkUpdate(false);
		const timer = setInterval(() => void checkUpdate(false), UPDATE_CHECK_EVERY_MS);
		return () => clearInterval(timer);
	}, [loaded, autoUpdateCheck]);

	useEffect(() => {
		if (syncError)
			push({
				id: `sync:${Date.now()}`,
				kind: "error",
				title: t.notifications.syncFailed,
				detail: syncError,
				target: noticeTarget({ source: "sync-failure" }),
			});
	}, [syncError, push, t]);

	useEffect(() => {
		if (notice)
			push({
				id: `remote:${notice.name}:${notice.subject}`,
				kind: "info",
				title: format(t.notifications.remote, { count: notice.count, branch: notice.name }),
				body: `${notice.author}: ${notice.subject}`,
				target: noticeTarget({ source: "remote-head" }),
			});
	}, [notice, push, t]);
}
