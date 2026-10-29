import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { useWatchNotice } from "@/lib/code";
import { needsYouNotice, useFactoryEvents } from "@/lib/home";
import { format, type Messages, useI18n } from "@/lib/i18n";
import { commands, isTauri, unwrap } from "@/lib/ipc";
import { useNotifications } from "@/lib/notifications";
import { useShell } from "@/lib/shell";
import { useSyncTick } from "@/lib/sync";
import { useUpdateCheck } from "@/lib/updates";
import type { Action } from "./actions";

/** The palette actions that the native menu runs (REQ-012). The Rust menu holds the same ids. */
export const MENU_ACTIONS = [
	"project-open",
	"project-switch",
	"project-close",
	"sync",
	"commit",
	"palette",
	"toggle-sidebar",
	"toggle-inspector",
	"update-check",
] as const;

/** The text of each native menu item, in the language of the person. Keyed by item id. */
export const menuLabels = (t: Messages): Record<string, string> => ({
	app: t.menu.app,
	file: t.menu.file,
	edit: t.menu.edit,
	view: t.menu.view,
	window: t.menu.window,
	help: t.menu.help,
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
	commit: t.shell.commit,
	palette: t.palette.title,
	"toggle-sidebar": t.shell.toggleSidebar,
	"toggle-inspector": t.shell.toggleInspector,
	"update-check": t.menu.updateCheck,
});

/** The native menu: its labels follow the language, and a click runs the palette action. */
export function useNativeMenu(list: Action[]) {
	const { t } = useI18n();
	useEffect(() => {
		if (isTauri()) unwrap(commands.shellMenu(menuLabels(t))).catch((e) => console.error(e));
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

/** The sources of the notification centre: the update check, a failed sync, a moved remote head
 * and the factory events that need the person. */
export function useShellEvents() {
	const { t } = useI18n();
	const { push } = useNotifications();
	const { syncError } = useShell();
	const notice = useWatchNotice().data?.changes[0];
	const checkUpdate = useUpdateCheck();
	useSyncTick();

	// A question, an approval or a run that needs the person: one entry and one system notice (REQ-008).
	useFactoryEvents((event, payload) => {
		void needsYouNotice(event, payload, t)
			.then((n) => n && push(n))
			.catch((e) => console.error(e));
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: one check at start
	useEffect(() => {
		void checkUpdate(false);
	}, []);

	useEffect(() => {
		if (syncError)
			push({
				id: `sync:${Date.now()}`,
				kind: "error",
				title: t.notifications.syncFailed,
				body: syncError,
			});
	}, [syncError, push, t]);

	useEffect(() => {
		if (notice)
			push({
				id: `remote:${notice.name}:${notice.subject}`,
				kind: "info",
				title: format(t.notifications.remote, { count: notice.count, branch: notice.name }),
				body: `${notice.author}: ${notice.subject}`,
			});
	}, [notice, push, t]);
}
