import { useState, useSyncExternalStore } from "react";

const PREFIX = "shipyard:view:";
const INDEX = "shipyard:view-index:";
/** The most entries kept for one project: the least recently written go first. */
export const VIEW_CAP = 200;
let project = "";
const listeners = new Set<() => void>();

/** Tells the view memory which project is open. The shell calls it. */
export function setViewProject(id: string) {
	if (id === project) return;
	project = id;
	for (const l of listeners) l();
}

export const viewProjectNow = () => project;

/** The open project. A view reads its saved state again when it changes. */
export const useViewProject = () =>
	useSyncExternalStore(
		(cb) => {
			listeners.add(cb);
			return () => listeners.delete(cb);
		},
		() => project,
	);

const slot = (id: string, key: string) => `${PREFIX}${id}:${key}`;

/** A value that the person set in a view of this project, or `fallback`. Storage can fail: it never throws. */
export function readView<T>(id: string, key: string, fallback: T): T {
	if (!id) return fallback;
	try {
		const raw = localStorage.getItem(slot(id, key));
		return raw === null ? fallback : (JSON.parse(raw) as T);
	} catch {
		return fallback;
	}
}

export function writeView(id: string, key: string, value: unknown) {
	if (!id) return;
	try {
		localStorage.setItem(slot(id, key), JSON.stringify(value));
		const order: string[] = JSON.parse(localStorage.getItem(INDEX + id) ?? "[]");
		const next = [...order.filter((k) => k !== key), key];
		for (const old of next.splice(0, Math.max(0, next.length - VIEW_CAP)))
			localStorage.removeItem(slot(id, old));
		localStorage.setItem(INDEX + id, JSON.stringify(next));
	} catch {
		// shortcut: a full or blocked storage loses the memory only, never the work
	}
}

/** Forgets every saved view state of one project, such as a project that the person removed. */
export function forgetView(id: string) {
	try {
		for (const k of Object.keys(localStorage))
			if (k.startsWith(slot(id, "")) || k === INDEX + id) localStorage.removeItem(k);
	} catch {
		// nothing to clear
	}
}

/** Forgets every saved view state. For tests. */
export function clearViewState() {
	try {
		for (const k of Object.keys(localStorage))
			if (k.startsWith(PREFIX) || k.startsWith(INDEX)) localStorage.removeItem(k);
	} catch {
		// nothing to clear
	}
}

/** Like `useState`, kept per project and key across a restart. */
export function useViewState<T>(key: string, fallback: T): [T, (value: T) => void] {
	const id = useViewProject();
	const [held, setHeld] = useState({ id, key, value: readView(id, key, fallback) });
	let value = held.value;
	if (held.id !== id || held.key !== key) {
		value = readView(id, key, fallback);
		setHeld({ id, key, value });
	}
	return [
		value,
		(next) => {
			setHeld({ id, key, value: next });
			writeView(id, key, next);
		},
	];
}
