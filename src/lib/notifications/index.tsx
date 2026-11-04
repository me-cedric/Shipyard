import { useRouter } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { commands, type EventSource, unwrap } from "@/lib/ipc";
import { logError } from "@/lib/log";
import { useShell } from "@/lib/shell";

export * from "./sources";

/** The source of an event, from the first part of its id. An id with another prefix has no source. */
const SOURCES: Record<string, EventSource> = {
	question: "question",
	approval: "approval",
	run: "run",
	sync: "sync-failure",
	update: "update",
	remote: "remote-head",
	"run-ended": "run-ended",
	"pr-checks": "pr-checks",
	"scan-failed": "scan-failed",
	"review-draft": "review-draft",
};

/** These sources reach the system only when the notice is `needs-you`. The older ones always do. */
const QUIET: EventSource[] = ["run-ended", "pr-checks", "scan-failed", "review-draft"];

/** `needs-you` is the class that also goes to the system (spec `shell`, REQ-008). */
export type NoticeKind = "info" | "error" | "needs-you";

/** Where a notice leads: a page or a ref (it opens in the inspector). */
export type NoticeTarget = { route: string } | { ref: string };

/** One button of a notice: Retry, Open, Download. */
export type NoticeAction = { label: string; run: () => void };

export type Notice = {
	/** The source and the thing: the same id gives one entry, once. */
	id: string;
	kind: NoticeKind;
	title: string;
	body?: string;
	/** The long text of a failure. The centre folds it. */
	detail?: string;
	/** The centre opens it when the person clicks the row. */
	target?: NoticeTarget;
	action?: NoticeAction;
	time: number;
	read: boolean;
};

type Ctx = {
	items: Notice[];
	/** The entries that show as a toast now. */
	toasts: Notice[];
	unread: number;
	/**
	 * Adds an event. A second call with the same id does nothing. A source in `Prefs.notifyOff`
	 * adds nothing, to the centre and to the system alike. Resolves true when it added the event.
	 */
	push: (n: NoticeInput) => Promise<boolean>;
	markRead: () => void;
	clear: () => void;
	dismiss: (id: string) => void;
};

export type NoticeInput = Pick<
	Notice,
	"id" | "kind" | "title" | "body" | "detail" | "target" | "action"
>;

const Context = createContext<Ctx | null>(null);

/** How long a toast stays. The entry stays in the centre. */
const TOAST_MS = 6000;

/**
 * One list of events feeds the notification centre, the toast and the system notification.
 * An event shows once in each. The system one is for the "needs you" class and for each source
 * that the person left on (Settings), and only while the window is in the background.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
	const [items, setItems] = useState<Notice[]>([]);
	const [toasts, setToasts] = useState<Notice[]>([]);
	// Not state: an update function can run twice, and an id seen must never come back.
	const seen = useRef(new Set<string>());

	const push = useCallback(async (n: NoticeInput) => {
		if (seen.current.has(n.id)) return false;
		seen.current.add(n.id);
		// A project can mute its notices (project overrides). Read at each push, as the sources are.
		const muted = await unwrap(commands.projectsActive())
			.then((p) => p?.overrides.notifications === false)
			.catch(() => false);
		if (muted) {
			seen.current.delete(n.id);
			return false;
		}
		const source = SOURCES[n.id.split(":")[0] ?? ""];
		if (source) {
			// Read at each push, so a change in Settings counts at once.
			const off = await unwrap(commands.prefsGet())
				.then((p) => p.notifyOff)
				.catch((): EventSource[] => []);
			if (off.includes(source)) {
				seen.current.delete(n.id);
				return false;
			}
		}
		const notice: Notice = { ...n, time: Date.now(), read: false };
		setItems((list) => [notice, ...list]);
		setToasts((list) => [...list, notice]);
		// A needs-you event or any chosen source (sync, update, remote head) goes to the system.
		if ((n.kind === "needs-you" || (source && !QUIET.includes(source))) && !document.hasFocus())
			unwrap(commands.notifyOs(n.title, n.body ?? "")).catch(logError);
		return true;
	}, []);

	useEffect(() => {
		if (toasts.length === 0) return;
		const timer = setTimeout(() => setToasts((list) => list.slice(1)), TOAST_MS);
		return () => clearTimeout(timer);
	}, [toasts]);

	const value = useMemo<Ctx>(
		() => ({
			items,
			toasts,
			unread: items.filter((i) => !i.read).length,
			push,
			markRead: () => setItems((list) => list.map((i) => (i.read ? i : { ...i, read: true }))),
			clear: () => setItems([]),
			dismiss: (id) => setToasts((list) => list.filter((t) => t.id !== id)),
		}),
		[items, toasts, push],
	);
	return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useNotifications() {
	const ctx = useContext(Context);
	if (!ctx) throw new Error("useNotifications needs NotificationsProvider");
	return ctx;
}

/** The function that opens the target of a notice: a route, or a ref in the inspector. */
export function useOpenNotice() {
	const router = useRouter({ warn: false });
	const { openRef } = useShell();
	return useCallback(
		(n: Notice) => {
			if (!n.target) return;
			if ("route" in n.target) void router?.navigate({ to: n.target.route });
			else openRef(n.target.ref);
		},
		[router, openRef],
	);
}
