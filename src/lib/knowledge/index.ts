import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useState, useSyncExternalStore } from "react";
import {
	commands,
	type Dashboard_Serialize,
	type DocList,
	type KGraph_Serialize,
	type Learn,
	type TileData_Serialize,
	unwrap,
} from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";

export type KGraph = KGraph_Serialize;
export type Dashboard = Dashboard_Serialize;
export type TileData = TileData_Serialize;
export type { DocList, Learn };

export const knowledgeKeys = {
	all: ["knowledge"] as const,
	docs: ["knowledge", "docs"] as const,
};
const key = (...k: string[]) => ["knowledge", ...k] as const;

/** The folders of the handbook, the documents and the decks, as the Rust store names them. */
export const DOC_DIR = {
	handbook: "docs/handbook",
	documents: "docs/documents",
	slides: "docs/slides",
} as const;

/** The tile catalogue of the Rust store. */
export const TILE_KINDS = [
	"work",
	"runs",
	"questions",
	"specs",
	"estimates",
	"quality",
	"impact",
	"tracker-open",
	"tracker-status",
	"tracker-assignee",
] as const;

export const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const slug = (name: string) =>
	name
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

function useProjectQuery<T>(k: readonly string[], fn: () => Promise<T>) {
	const active = useActiveProject().data;
	return useQuery({ queryKey: k, queryFn: fn, enabled: !!active });
}

export const useGraph = () => useProjectQuery(key("graph"), () => unwrap(commands.graphGet()));
export const useCodeGraph = () =>
	useProjectQuery(key("code-graph"), () => unwrap(commands.graphCode()));
export const useLearn = () => useProjectQuery(key("learn"), () => unwrap(commands.learnGet()));
export const useDocList = () =>
	useProjectQuery(knowledgeKeys.docs, () => unwrap(commands.docListGet()));
export const useSlideTheme = () =>
	useProjectQuery(key("theme"), () => unwrap(commands.slideThemeGet()));
export const useDashboards = () =>
	useProjectQuery(key("dashboards"), () => unwrap(commands.dashboardListGet()));
export const useExplainContext = (entity: string) =>
	useProjectQuery(key("explain", entity), () => unwrap(commands.explainContextGet(entity)));

/** The Index action of the code graph. */
export function useIndexCode() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () => unwrap(commands.graphCodeIndex()),
		onSuccess: () => qc.invalidateQueries({ queryKey: key("code-graph") }),
	});
}

/** The numbers behind one tile. A tile whose source is off comes back with `off` set. */
export function useTile(kind: string, enabled = true) {
	const active = useActiveProject().data;
	return useQuery({
		queryKey: key("tile", kind),
		queryFn: () => unwrap(commands.dashboardTile(kind)),
		enabled: !!active && enabled,
	});
}

/**
 * One page, document or deck with its stamp. A write sends the stamp of the read, so a change on
 * disk gives a conflict and the person chooses (REQ-011). The Markdown files live in the repository.
 */
export function useDocFile(path: string) {
	const qc = useQueryClient();
	const q = useQuery({
		queryKey: key("file", path),
		queryFn: () => unwrap(commands.docReadOne(path)),
		refetchOnWindowFocus: false,
		refetchOnMount: "always",
		gcTime: 0,
	});
	const [draft, setDraft] = useState<string | null>(null);
	const [conflict, setConflict] = useState<string | null>(null);
	const [failure, setFailure] = useState<string | null>(null);
	const saved = q.data?.text ?? "";

	const write = async (stamp: string | null) => {
		if (draft === null) return false;
		setFailure(null);
		try {
			const w = await unwrap(commands.docWriteOne(path, draft, stamp, false));
			if (w.conflict) {
				setConflict(w.stamp ?? "");
				return false;
			}
			await q.refetch();
			setDraft(null);
			setConflict(null);
			await Promise.all([
				qc.invalidateQueries({ queryKey: knowledgeKeys.all }),
				qc.invalidateQueries({ queryKey: ["refs"] }),
			]);
			return true;
		} catch (e) {
			setFailure(message(e));
			return false;
		}
	};

	return {
		ready: q.isSuccess,
		text: draft ?? saved,
		dirty: draft !== null && draft !== saved,
		conflict: conflict !== null,
		error: failure ?? (q.isError ? message(q.error) : null),
		setText: setDraft,
		save: () => write(q.data?.stamp ?? null),
		/** Keep my text: write over the file that changed on disk. */
		keepMine: () => write(conflict),
		/** Take the text on disk. */
		reload: async () => {
			setDraft(null);
			setConflict(null);
			await q.refetch();
		},
	};
}

/** Create a file: the write refuses to replace one that exists. */
export function useCreateDoc() {
	const qc = useQueryClient();
	return useCallback(
		async (path: string, text: string) => {
			const w = await unwrap(commands.docWriteOne(path, text, null, true));
			if (w.conflict) throw new Error(path);
			await Promise.all([
				qc.invalidateQueries({ queryKey: knowledgeKeys.all }),
				qc.invalidateQueries({ queryKey: ["refs"] }),
			]);
		},
		[qc],
	);
}

/** One dashboard file. A save never makes a commit. A newer file is read-only (REQ-022). */
export function useDashboard(slugName: string) {
	const qc = useQueryClient();
	const q = useQuery({
		queryKey: key("dashboard", slugName),
		queryFn: () => unwrap(commands.dashboardGetOne(slugName)),
		refetchOnWindowFocus: false,
	});
	const save = async (dashboard: Dashboard) => {
		const w = await unwrap(commands.dashboardSaveOne(slugName, dashboard, q.data?.stamp ?? null));
		await qc.invalidateQueries({ queryKey: key("dashboard", slugName) });
		return !w.conflict;
	};
	return { view: q.data, error: q.isError ? message(q.error) : null, save };
}

// ---------------------------------------------------------------- pins

/** `person` is the team handle that a tracker tile follows. */
export type Pin = { slug: string; id: string; kind: string; person?: string };
// shortcut: the pins live in the webview storage of this machine; upgrade when the preferences hold a list (Q-070).
const PINS = "shipyard.pins";
const listeners = new Set<() => void>();
const read = (): string => localStorage.getItem(PINS) ?? "[]";

/** The tiles that the person pinned to Home. A per-person setting, not a project file. */
export function usePins() {
	const raw = useSyncExternalStore((l) => {
		listeners.add(l);
		return () => listeners.delete(l);
	}, read);
	const pins = JSON.parse(raw) as Pin[];
	const same = (a: Pin, b: Pin) => a.slug === b.slug && a.id === b.id;
	return {
		pins,
		pinned: (p: Pin) => pins.some((x) => same(x, p)),
		toggle: (p: Pin) => {
			const next = pins.some((x) => same(x, p)) ? pins.filter((x) => !same(x, p)) : [...pins, p];
			localStorage.setItem(PINS, JSON.stringify(next));
			for (const l of listeners) l();
		},
	};
}

// ---------------------------------------------------------------- graph focus

let focused: string | null = null;
const focusListeners = new Set<() => void>();

/** The entity that the graph centres on, with its neighbours. Open in graph sets it (REQ-004). */
export function useGraphFocus() {
	const focus = useSyncExternalStore(
		(l) => {
			focusListeners.add(l);
			return () => focusListeners.delete(l);
		},
		() => focused,
	);
	return [
		focus,
		(ref: string | null) => {
			focused = ref;
			for (const l of focusListeners) l();
		},
	] as const;
}

// ---------------------------------------------------------------- export

/** The native dialog for a Word file to write. Returns null when the person cancels. */
export async function saveDocx(name: string): Promise<string | null> {
	if (!isTauri()) return `/mock/${name}.docx`;
	const { save } = await import("@tauri-apps/plugin-dialog");
	return save({ defaultPath: `${name}.docx`, filters: [{ name: "Word", extensions: ["docx"] }] });
}
