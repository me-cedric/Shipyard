import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { format, type Messages, useI18n } from "@/lib/i18n";
import {
	commands,
	confirmDialog,
	type ProjectEntry_Serialize,
	type ProjectOutcome_Serialize,
	pickFolder,
	type Severity,
	unwrap,
} from "@/lib/ipc";

export type ProjectEntry = ProjectEntry_Serialize;
export type ProjectOutcome = ProjectOutcome_Serialize;

export const projectKeys = {
	list: ["projects", "list"] as const,
	active: ["projects", "active"] as const,
	settings: ["projects", "settings"] as const,
	health: ["health"] as const,
};

export function useProjects() {
	return useQuery({ queryKey: projectKeys.list, queryFn: () => unwrap(commands.projectsList()) });
}

/** `data` is null when no project is active, and undefined while it loads. */
export function useActiveProject() {
	return useQuery({
		queryKey: projectKeys.active,
		queryFn: () => unwrap(commands.projectsActive()),
	});
}

export function useHealth() {
	return useQuery({
		queryKey: projectKeys.health,
		queryFn: () => unwrap(commands.healthRun()),
		staleTime: 30_000,
	});
}

/** The status shape of the worst severity. No finding is `success`. */
export function worstStatus(severities: Severity[]): "success" | "info" | "warning" | "danger" {
	if (severities.includes("error")) return "danger";
	if (severities.includes("warning")) return "warning";
	return severities.includes("info") ? "info" : "success";
}

/** The text of a failed open, clone or create. Null when the project opened. */
export function outcomeError(t: Messages, o: ProjectOutcome): string | null {
	if (o.status === "opened" || o.status === "needs-project-file") return null;
	return format(t.projects.error[o.status], { message: o.message ?? "" });
}

/** Open, clone, create and switch. Each change reloads every view and goes to the last view of the project. */
export function useProjectActions() {
	const qc = useQueryClient();
	const router = useRouter();
	const { t } = useI18n();

	const opened = useCallback(
		(o: ProjectOutcome) => {
			if (!o.project) return o;
			router.history.push(o.project.lastView ?? "/");
			qc.invalidateQueries();
			return o;
		},
		[qc, router],
	);

	const switchTo = useCallback(
		async (id: string) => {
			const p = await unwrap(commands.projectsSwitch(id));
			opened({ status: "opened", project: p, message: null });
		},
		[opened],
	);

	/** Picks a folder and opens it. Without a project file it asks first. Null when the person cancels. */
	const openFolder = useCallback(async () => {
		const path = await pickFolder();
		if (!path) return null;
		let o = await unwrap(commands.projectsOpen(path, false));
		if (
			o.status === "needs-project-file" &&
			(await confirmDialog(format(t.projects.confirmFile, { path })))
		)
			o = await unwrap(commands.projectsOpen(path, true));
		return opened(o);
	}, [opened, t]);

	const clone = useCallback(
		async (url: string, path: string) => opened(await unwrap(commands.projectsClone(url, path))),
		[opened],
	);

	const create = useCallback(
		async (path: string, name: string, key: string) =>
			opened(await unwrap(commands.projectsCreate(path, name, key))),
		[opened],
	);

	return { switchTo, openFolder, clone, create };
}
