import { useEffect, useState } from "react";
import { isTauri } from "@/lib/ipc";

const KEY = "shipyard.cloneFolder";

/** `~/Projects` on this machine: the default parent folder of a new project. */
export async function projectsHome() {
	if (!isTauri()) return "/mock/Projects";
	const { homeDir, join } = await import("@tauri-apps/api/path");
	return join(await homeDir(), "Projects");
}

/** The parent folder of a clone: the last one that a person chose, else `~/Projects`. */
export function useCloneFolder() {
	const [folder, set] = useState(() => localStorage.getItem(KEY) ?? "");
	useEffect(() => {
		void projectsHome().then((home) => set((f) => f || home));
	}, []);
	const setFolder = (next: string) => {
		localStorage.setItem(KEY, next);
		set(next);
	};
	return [folder, setFolder] as const;
}
