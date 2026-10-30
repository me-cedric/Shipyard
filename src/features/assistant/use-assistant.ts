// The logic of the working parts (draft kept per thread, the turn that waits, the options of a
// reply) follows the assistant drawer of Legacy. The panel and its styles are new.
import { useCallback, useEffect, useRef, useState } from "react";
import {
	commands,
	type FileDiff,
	type PanelSide,
	type Quote,
	type RunnerOptions,
	type ThreadSettings,
	type ThreadSummary,
	type ThreadView_Serialize,
	type TurnResult_Serialize,
	unwrap,
} from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";

export const MIN_WIDTH = 280;
export const MAX_WIDTH = 900;
const clamp = (w: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(w)));
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type Assistant = ReturnType<typeof useAssistant>;

/** The state of the panel. The shell holds it, so a change of view keeps the thread and the draft. */
export function useAssistant({
	open,
	view,
	selected,
}: {
	open: boolean;
	view: string;
	selected: string | null;
}) {
	const project = useActiveProject().data?.id ?? null;
	const [threads, setThreads] = useState<ThreadSummary[]>([]);
	const [current, setCurrent] = useState<ThreadView_Serialize | null>(null);
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	// The view and the entity that the person removed. A new view or entity shows again.
	const [gone, setGone] = useState<{ view: string | null; selected: string | null }>({
		view: null,
		selected: null,
	});
	const dropped = {
		view: gone.view === view,
		selected: selected !== null && gone.selected === selected,
	};
	const [pending, setPending] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [alert, setAlert] = useState<string | null>(null);
	const [changed, setChanged] = useState<FileDiff[]>([]);
	const [runners, setRunners] = useState<RunnerOptions[]>([]);
	const [width, setWidthState] = useState(400);
	const [side, setSideState] = useState<PanelSide>("right");
	const loaded = useRef<string | null>(null);
	const live = useRef({ current, drafts });
	live.current = { current, drafts };

	const fail = useCallback((e: unknown) => setError(message(e)), []);

	useEffect(() => {
		unwrap(commands.prefsGet())
			.then((p) => {
				setWidthState(clamp(p.assistantWidth ?? 400));
				setSideState(p.assistantSide ?? "right");
			})
			.catch((e) => console.error(e));
	}, []);

	/** The draft goes to the thread file after a pause and when the person leaves the thread. */
	const saveDraft = useCallback((v: ThreadView_Serialize, text: string) => {
		return unwrap(commands.assistantSaveDraft(v.thread.id, text, v.thread.context));
	}, []);
	useEffect(() => {
		const text = current ? drafts[current.thread.id] : undefined;
		if (!current || text === undefined || text === current.thread.draft) return;
		const timer = setTimeout(() => saveDraft(current, text).catch(console.error), 400);
		return () => clearTimeout(timer);
	}, [current, drafts, saveDraft]);

	const select = useCallback(
		async (id: string) => {
			const { current: old, drafts: all } = live.current;
			const text = old ? all[old.thread.id] : undefined;
			if (old && old.thread.id !== id && text !== undefined)
				await saveDraft(old, text).catch(console.error);
			const v = await unwrap(commands.assistantGet(id));
			setCurrent(v);
			setDrafts((d) => ({ ...d, [id]: d[id] ?? v.thread.draft }));
			setError(null);
			setAlert(null);
			setChanged(v.thread.worktree ? await unwrap(commands.assistantDiff(id)) : []);
		},
		[saveDraft],
	);

	/** Lists the threads. A project with none gets one, so the panel never shows an empty list. */
	const refresh = useCallback(
		async (pick?: string) => {
			let list = await unwrap(commands.assistantThreads());
			if (!list.length) {
				await unwrap(commands.assistantCreate(null));
				list = await unwrap(commands.assistantThreads());
			}
			setThreads(list);
			const keep = [pick, live.current.current?.thread.id].find((id) =>
				list.some((t) => t.id === id),
			);
			const id = keep ?? list[0]?.id;
			if (id && id !== live.current.current?.thread.id) await select(id);
		},
		[select],
	);

	useEffect(() => {
		if (!open || !project || loaded.current === project) return;
		loaded.current = project;
		setCurrent(null);
		(async () => {
			try {
				setRunners(await unwrap(commands.assistantOptions()));
				await refresh();
			} catch (e) {
				loaded.current = null;
				fail(e);
			}
		})();
	}, [open, project, refresh, fail]);

	const contextFor = (v: ThreadView_Serialize) => ({
		view: dropped.view ? "" : view,
		selected: dropped.selected ? null : selected,
		refs: v.thread.context.refs,
	});

	/** Runs one turn. The thread view of the answer replaces the old one. */
	const run = async (label: string | null, call: () => Promise<TurnResult_Serialize>) => {
		setBusy(true);
		setError(null);
		setAlert(null);
		setPending(label);
		try {
			const r = await call();
			setCurrent(r.thread);
			setChanged(r.changed);
			setAlert(r.alert);
			setThreads(await unwrap(commands.assistantThreads()));
			return true;
		} catch (e) {
			fail(e);
			return false;
		} finally {
			setBusy(false);
			setPending(null);
		}
	};

	const id = current?.thread.id ?? "";
	const setDraft = (text: string) => setDrafts((d) => ({ ...d, [id]: text }));

	const mutate = async (job: () => Promise<unknown>) => {
		try {
			await job();
			return true;
		} catch (e) {
			fail(e);
			return false;
		}
	};

	const setSettings = async (patch: Partial<ThreadSettings>) => {
		if (!current) return false;
		return mutate(async () => {
			const v = await unwrap(
				commands.assistantSettingsSet(id, { ...current.thread.settings, ...patch }),
			);
			setCurrent(v);
			setThreads(await unwrap(commands.assistantThreads()));
		});
	};

	return {
		threads,
		current,
		runners,
		busy,
		pending,
		error,
		alert,
		changed,
		width,
		side,
		dropped,
		view,
		selected,
		draft: drafts[id] ?? "",
		setDraft,
		select: (to: string) => mutate(() => select(to)),
		create: () =>
			mutate(async () => {
				const v = await unwrap(commands.assistantCreate(null));
				await refresh(v.thread.id);
			}),
		rename: (to: string, title: string) =>
			mutate(async () => {
				await unwrap(commands.assistantRename(to, title));
				setThreads(await unwrap(commands.assistantThreads()));
			}),
		remove: (to: string) =>
			mutate(async () => {
				await unwrap(commands.assistantDelete(to));
				const next =
					live.current.current?.thread.id === to ? undefined : live.current.current?.thread.id;
				if (!next) setCurrent(null);
				await refresh(next);
			}),
		send: async (text: string, fromDraft = false, quotes: Quote[] = []) => {
			const v = live.current.current;
			const body = text.trim();
			if (!v || !body || busy) return;
			// The draft goes at once, so text typed during the turn is not lost. A failed send gives it back.
			const to = v.thread.id;
			if (fromDraft) setDrafts((d) => ({ ...d, [to]: "" }));
			const ok = await run(body, () =>
				unwrap(commands.assistantSend(to, body, quotes, contextFor(v))),
			);
			if (!ok && fromDraft) setDrafts((d) => ({ ...d, [to]: d[to] || body }));
		},
		grant: () => current && !busy && run(null, () => unwrap(commands.assistantGrant(id))),
		retry: () => current && !busy && run(null, () => unwrap(commands.assistantRetry(id))),
		explain: async (entity: string) => {
			if (!current || busy) return;
			// Explain answers in ask mode (REQ-016).
			if (current.thread.settings.mode !== "ask") await setSettings({ mode: "ask" });
			await run(`${entity}`, () => unwrap(commands.assistantExplain(id, entity)));
		},
		addRef: (text: string) =>
			mutate(async () => {
				const context = await unwrap(commands.assistantRefAdd(id, text));
				setCurrent((v) => v && { ...v, thread: { ...v.thread, context } });
				setError(null);
			}),
		removeRef: (text: string) =>
			mutate(async () => {
				const context = await unwrap(commands.assistantRefRemove(id, text));
				setCurrent((v) => v && { ...v, thread: { ...v.thread, context } });
			}),
		dropContext: (kind: "view" | "selected") =>
			setGone((g) => ({ ...g, [kind]: kind === "view" ? view : selected })),
		setSettings,
		setWidth: (w: number, persist = true) => {
			setWidthState(clamp(w));
			if (persist) unwrap(commands.prefsSet({ assistantWidth: clamp(w) })).catch(console.error);
		},
		setSide: (s: PanelSide) => {
			setSideState(s);
			unwrap(commands.prefsSet({ assistantSide: s })).catch(console.error);
		},
		fail,
	};
}
