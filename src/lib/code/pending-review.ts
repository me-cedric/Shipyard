import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, useSyncExternalStore } from "react";
import { commands, toFailure, unwrap } from "@/lib/ipc";
import { useViewProject } from "@/lib/shell/view-state";

export type PendingComment = {
	id: string;
	path: string;
	line: number;
	body: string;
	createdAt: string;
	headSha: string;
};

type NewComment = { path: string; line: number; body: string; headSha: string };

// One key per project and pull request, outside the view memory: its cap (200 keys) drops the least
// recently written, and a pending review must never be dropped.
const KEY = "shipyard:pending-review:";
const EMPTY: PendingComment[] = [];
const cache = new Map<string, PendingComment[]>();
// Why the last write failed, and the keys whose stored value could not be read. Both clear at the next good write.
const failed = new Map<string, string>();
const unreadable = new Set<string>();
const listeners = new Set<() => void>();
let counter = 0;

function load(key: string): PendingComment[] {
	try {
		const raw = localStorage.getItem(KEY + key);
		const list: unknown = raw === null ? [] : JSON.parse(raw);
		if (!Array.isArray(list)) throw new Error("not a list");
		return list.length > 0 ? (list as PendingComment[]) : EMPTY;
	} catch {
		unreadable.add(key);
		return EMPTY;
	}
}

function read(key: string): PendingComment[] {
	let list = cache.get(key);
	if (!list) {
		list = load(key);
		cache.set(key, list);
	}
	return list;
}

/** Keeps the list in memory, then on this computer. False when the storage refused: the list then lives in memory only. */
function write(key: string, list: PendingComment[]): boolean {
	const next = list.length > 0 ? list : EMPTY;
	cache.set(key, next);
	let saved = true;
	try {
		if (next === EMPTY) localStorage.removeItem(KEY + key);
		else localStorage.setItem(KEY + key, JSON.stringify(next));
		failed.delete(key);
		unreadable.delete(key);
	} catch (e) {
		// shortcut: a full or blocked storage keeps the review for this session only, upgrade to a file when it shows up
		saved = false;
		failed.set(key, e instanceof Error ? e.message : String(e));
	}
	for (const l of listeners) l();
	return saved;
}

/** Forgets the memory copy, so the next read comes from storage. For tests: it is what a restart does. */
export function resetPendingReview() {
	cache.clear();
	failed.clear();
	unreadable.clear();
	for (const l of listeners) l();
}

const subscribe = (cb: () => void) => {
	listeners.add(cb);
	return () => void listeners.delete(cb);
};

/** The pending comments of one pull request, kept on this computer until a person submits or discards them. */
export function usePendingReview(reference: string) {
	const key = `${useViewProject()}|${reference}`;
	const comments = useSyncExternalStore(
		subscribe,
		() => read(key),
		() => EMPTY,
	);
	const storageError = useSyncExternalStore(
		subscribe,
		() => failed.get(key) ?? null,
		() => null,
	);
	const unread = useSyncExternalStore(
		subscribe,
		() => {
			read(key); // a first read finds out whether the stored value is readable
			return unreadable.has(key);
		},
		() => false,
	);
	return {
		comments,
		/** Why the last write to this computer failed. The comments stay in memory, so nothing typed is lost. */
		storageError,
		/** The stored review could not be read and was ignored. */
		unreadable: unread,
		/** Keeps only the comments that match one of `left` (a note that no code host took), with their ids. Returns those ids. */
		settle: (left: NewComment[]) => {
			const todo = [...left];
			const kept = read(key).filter((c) => {
				const i = todo.findIndex(
					(f) =>
						f.path === c.path && f.line === c.line && f.body === c.body && f.headSha === c.headSha,
				);
				if (i >= 0) todo.splice(i, 1);
				return i >= 0;
			});
			write(key, kept);
			return kept.map((c) => c.id);
		},
		add: (c: NewComment) =>
			write(key, [
				...read(key),
				{
					...c,
					id: `${Date.now().toString(36)}-${++counter}`,
					createdAt: new Date().toISOString(),
				},
			]),
		update: (id: string, body: string) =>
			write(
				key,
				read(key).map((c) => (c.id === id ? { ...c, body } : c)),
			),
		remove: (id: string) =>
			write(
				key,
				read(key).filter((c) => c.id !== id),
			),
		clear: () => write(key, EMPTY),
	};
}

/**
 * Posts one comment on a line at once, then reads the pull request again. A refusal of the code host
 * shows in `error`, and `post` rejects, so a caller keeps its text.
 */
export function usePostLineComment(reference: string) {
	const qc = useQueryClient();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const post = useCallback(
		async (c: NewComment) => {
			setPending(true);
			setError(null);
			try {
				await unwrap(
					commands.codePullLineComment(reference, c.path, c.line, c.body, c.headSha, true),
				);
			} catch (e) {
				setError(toFailure(e).details);
				throw e;
			} finally {
				setPending(false);
				await qc.invalidateQueries({ queryKey: ["code"] });
			}
		},
		[reference, qc],
	);
	return { post, pending, error };
}
