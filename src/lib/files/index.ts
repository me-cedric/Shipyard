import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { isTauri } from "@/lib/ipc";

/** The watcher of the active project sends the changed paths, debounced, relative to the project. */
export const FILES_EVENT = "files-changed";
/** `truncated`: the paths are not all (a branch switch), so every view reads again. */
type FilesChanged = { paths: string[]; truncated: boolean };

const under = (path: string, dirs: string[]) => dirs.some((d) => path.startsWith(`${d}/`));

/** The queries that the changed paths feed. A path that no view reads feeds only the refs and Code. */
export function keysFor(paths: string[]): QueryKey[] {
	const keys: QueryKey[] = [["refs"], ["code", "status"], ["code", "diff"]];
	const has = (dirs: string[]) => paths.some((p) => under(p, dirs));
	if (
		has([
			"docs/diagrams",
			"docs/models",
			"docs/api",
			"docs/data-models",
			"docs/flows",
			"docs/decisions",
			"docs/designs",
		])
	)
		keys.push(["design"]);
	if (has(["docs/openspec", "docs/delivery"])) keys.push(["specs"]);
	if (has(["docs/handbook", "docs/documents", "docs/slides", "docs/dashboards"]))
		keys.push(["knowledge"]);
	return keys;
}

/**
 * Per-file reads keep the stamp of the open, so a read of a changed disk would hide the conflict
 * (REQ-023). Each editor reads its own file again with `useOnFileChange`, only when it has no draft.
 */
const isFileRead = (key: QueryKey) => key[1] === "file" || key[1] === "dashboard";

/** The views read again when a file of the project changes on disk. Mount it once, in the shell. */
export function useFileChanges() {
	const qc = useQueryClient();
	useEffect(() => {
		if (!isTauri()) return;
		const off = listen<FilesChanged>(FILES_EVENT, (e) => {
			const keys: QueryKey[] = e.payload.truncated ? [[]] : keysFor(e.payload.paths);
			for (const queryKey of keys)
				qc.invalidateQueries({ queryKey, predicate: (q) => !isFileRead(q.queryKey) });
		});
		return () => void off.then((f) => f());
	}, [qc]);
}

/** Runs `run` when `path` changed on disk. */
export function useOnFileChange(path: string, run: () => void) {
	const last = useRef(run);
	last.current = run;
	useEffect(() => {
		if (!isTauri()) return;
		const off = listen<FilesChanged>(FILES_EVENT, (e) => {
			if (e.payload.truncated || e.payload.paths.includes(path)) last.current();
		});
		return () => void off.then((f) => f());
	}, [path]);
}
