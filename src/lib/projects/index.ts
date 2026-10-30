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

/**
 * Every artifact path of a project file, with its default (`DEFAULT_PATHS` and `MORE_PATHS` of
 * `shipyard-core`). Settings / Project lists them all.
 */
export const PATH_DEFAULTS: Record<string, string> = {
	decisions: "docs/decisions",
	questions: "docs/delivery/questions",
	specs: "docs/openspec",
	diagrams: "docs/diagrams",
	models: "docs/models",
	api: "docs/api",
	data: "docs/data-models",
	flows: "docs/flows",
	designs: "docs/designs",
	"test-plans": "docs/delivery/test-plans",
	handbook: "docs/handbook",
	documents: "docs/documents",
	slides: "docs/slides",
	dashboards: "docs/dashboards",
};

export const projectKeys = {
	list: ["projects", "list"] as const,
	active: ["projects", "active"] as const,
	settings: ["projects", "settings"] as const,
	health: ["health"] as const,
	legacy: ["projects", "legacy"] as const,
	personas: ["projects", "personas"] as const,
	tickets: ["projects", "tickets-config"] as const,
	assignments: ["projects", "assignments"] as const,
	overview: ["projects", "overview"] as const,
	links: ["projects", "ticket-links"] as const,
	notes: ["projects", "delivery-notes"] as const,
};

export function useProjects() {
	return useQuery({ queryKey: projectKeys.list, queryFn: () => unwrap(commands.projectsList()) });
}

/** The projects of the Legacy registry on this machine that are not in the list yet. */
export function useLegacyProjects() {
	return useQuery({
		queryKey: projectKeys.legacy,
		queryFn: () => unwrap(commands.legacyProjects()),
	});
}

/** The personas of the project (`docs/personas/personas.json`). */
export function usePersonas() {
	return useQuery({
		queryKey: projectKeys.personas,
		queryFn: () => unwrap(commands.personasList()),
	});
}

/** The tickets config of the project (`docs/delivery/tickets.config.json`). */
export function useTicketsConfig() {
	return useQuery({
		queryKey: projectKeys.tickets,
		queryFn: () => unwrap(commands.ticketsConfigGet()),
	});
}

/** The work split by profile (`docs/delivery/assignments.json`). */
export function useAssignments() {
	return useQuery({
		queryKey: projectKeys.assignments,
		queryFn: () => unwrap(commands.assignmentsRead()),
	});
}

/** One card for each project: the branch, the last commit, ahead and behind, the changes and the host. */
export function useProjectCards() {
	return useQuery({
		queryKey: projectKeys.overview,
		queryFn: () => unwrap(commands.projectsOverview()),
	});
}

/** The Legacy ticket links of the project (`docs/delivery/tickets.json`). */
export function useTicketLinks() {
	return useQuery({ queryKey: projectKeys.links, queryFn: () => unwrap(commands.ticketsLinks()) });
}

/** The delivery notes of the project (`docs/delivery/impacts`). */
export function useDeliveryNotes() {
	return useQuery({
		queryKey: projectKeys.notes,
		queryFn: () => unwrap(commands.deliveryNotes()),
	});
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
	if (o.status === "opened") return null;
	return format(t.projects.error[o.status], { message: o.message ?? "" });
}

/** Open, clone, create, switch, close and remove. Each change reloads every view and goes to the last view of the project. */
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
			return opened({ status: "opened", project: p, message: null });
		},
		[opened],
	);

	/** Picks a folder and opens it. A folder with no project file gets one. Null when the person cancels. */
	const openFolder = useCallback(async () => {
		const path = await pickFolder();
		if (!path) return null;
		return opened(await unwrap(commands.projectsOpen(path, false)));
	}, [opened]);

	/** Opens a project of the Legacy registry with its Legacy paths. */
	const openLegacy = useCallback(
		async (id: string) => opened(await unwrap(commands.legacyProjectOpen(id))),
		[opened],
	);

	const clone = useCallback(
		async (url: string, path: string) => opened(await unwrap(commands.projectsClone(url, path))),
		[opened],
	);

	const create = useCallback(
		async (path: string, name: string, key: string) =>
			opened(await unwrap(commands.projectsCreate(path, name, key))),
		[opened],
	);

	/** No project is active: the app shows the first run, with the recent projects. */
	const close = useCallback(async () => {
		await unwrap(commands.projectsClose());
		router.history.push("/");
		qc.invalidateQueries();
	}, [qc, router]);

	/** Asks first. It changes the list of the registry and never deletes a file. */
	const remove = useCallback(
		async (p: { id: string; name: string }) => {
			if (!(await confirmDialog(format(t.projects.confirmRemove, { name: p.name })))) return;
			await unwrap(commands.projectsRemove(p.id));
			if (!(await unwrap(commands.projectsActive()))) router.history.push("/");
			qc.invalidateQueries();
		},
		[qc, router, t],
	);

	return { switchTo, openFolder, openLegacy, clone, create, close, remove };
}
