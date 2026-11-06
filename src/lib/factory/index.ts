import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useState } from "react";
import { useFactoryEvents } from "@/lib/home";
import {
	commands,
	isTauri,
	type RunState,
	type SpendRow,
	unwrap,
	type Workflow,
	type WorkflowSource,
} from "@/lib/ipc";

export type { RunItem } from "@/lib/home";

export const factoryKeys = {
	all: ["factory"] as const,
	runs: ["factory", "runs"] as const,
	kill: ["factory", "kill"] as const,
	workflows: ["factory", "workflows"] as const,
	roles: ["factory", "roles"] as const,
	options: ["factory", "options"] as const,
	proposals: ["factory", "proposals"] as const,
	sessions: ["factory", "sessions"] as const,
	usage: ["factory", "usage"] as const,
	file: (kind: "workflow" | "role", id: string) => ["factory", "file", kind, id] as const,
	workflow: (id: string) => ["factory", "workflow", id] as const,
	diff: (run: string) => ["factory", "diff", run] as const,
	log: (run: string) => ["factory", "log", run] as const,
};

const PAGE = 50;

/** The states of a run that is over. */
export const ENDED: RunState[] = ["Merged", "Done", "Failed", "Cancelled"];

/** Reads again at each factory event (the mock emits none: each action reads again). */
function useFresh() {
	const qc = useQueryClient();
	useFactoryEvents(() => void qc.invalidateQueries({ queryKey: factoryKeys.all }));
}

/** How often a view of a live run reads again: the engine tells only some changes with an event. */
const LIVE_MS = 3000;

/** `live` is a run id: while this run is not over, the runs are read again every few seconds. */
export function useRuns(live?: string) {
	useFresh();
	return useQuery({
		queryKey: factoryKeys.runs,
		queryFn: () => unwrap(commands.runsList()),
		refetchInterval: (q) =>
			live && q.state.data?.some((r) => r.id === live && !ENDED.includes(r.state))
				? LIVE_MS
				: false,
	});
}

export function useKillSwitch() {
	return useQuery({ queryKey: factoryKeys.kill, queryFn: () => unwrap(commands.killSwitchGet()) });
}

/** The parsed workflow of a run, or null when its file is invalid. */
export function useWorkflow(id: string) {
	return useQuery({
		queryKey: factoryKeys.workflow(id),
		queryFn: async () => (await unwrap(commands.workflowGet(id))).workflow,
	});
}

export function useRunDiff(run: string) {
	return useQuery({
		queryKey: factoryKeys.diff(run),
		queryFn: () => unwrap(commands.runDiff(run)),
	});
}

/** The event tail, oldest first. Each page asks for the next one with the last id. */
export function useRunLog(run: string, live = false) {
	const q = useInfiniteQuery({
		refetchInterval: live ? LIVE_MS : false,
		queryKey: factoryKeys.log(run),
		initialPageParam: 0,
		queryFn: ({ pageParam }) => unwrap(commands.runLogPage(run, pageParam, PAGE)),
		getNextPageParam: (p) => (p.more ? p.last : undefined),
	});
	return { ...q, events: q.data?.pages.flatMap((p) => p.events) ?? [] };
}

/** Each write reads the runs again, also when it fails. The Inbox reads again too. */
export function useRunActions() {
	const qc = useQueryClient();
	return useMemo(() => {
		const run = async <T>(
			call: Promise<{ status: "ok"; data: T } | { status: "error"; error: unknown }>,
		) => {
			try {
				return await unwrap(call);
			} finally {
				await Promise.all([
					qc.invalidateQueries({ queryKey: factoryKeys.all }),
					qc.invalidateQueries({ queryKey: ["home"] }),
				]);
			}
		};
		return {
			start: (key: string) => run(commands.runStart(key)),
			cancel: (id: string) => run(commands.runCancel(id)),
			resume: (id: string, addUsd: number | null) => run(commands.runResume(id, addUsd, 0)),
			unblock: (id: string, note?: string) => run(commands.runUnblock(id, note?.trim() || null)),
			planApprove: (id: string) => run(commands.runPlanApprove(id)),
			planReject: (id: string, note: string) => run(commands.runPlanReject(id, note)),
		};
	}, [qc]);
}

export function useWorkflows() {
	useFresh();
	return useQuery({
		queryKey: factoryKeys.workflows,
		queryFn: () => unwrap(commands.workflowsList()),
	});
}

/** The lists that the workflow form offers: presets, roles, tools, tiers and skills. */
export function useWorkflowOptions() {
	return useQuery({
		queryKey: factoryKeys.options,
		queryFn: () => unwrap(commands.workflowOptions()),
	});
}

/** The texts that outside agents proposed. */
export function useWorkflowProposals() {
	useFresh();
	return useQuery({
		queryKey: factoryKeys.proposals,
		queryFn: () => unwrap(commands.workflowProposals()),
	});
}

export function useRoles() {
	return useQuery({ queryKey: factoryKeys.roles, queryFn: () => unwrap(commands.rolesList()) });
}

/** The text of a workflow or role file. It reads again only after a save. */
export function useFactoryFile(kind: "workflow" | "role", id: string) {
	return useQuery({
		queryKey: factoryKeys.file(kind, id),
		queryFn: async () =>
			(
				await unwrap<{ text: string }>(
					kind === "workflow" ? commands.workflowGet(id) : commands.roleGet(id),
				)
			).text,
	});
}

export function useSessions() {
	useFresh();
	return useQuery({
		queryKey: factoryKeys.sessions,
		queryFn: () => unwrap(commands.sessionsList()),
	});
}

/** The requests of one run nested by step, read when a person picks the run. */
export function useUsageTree(run: string | null) {
	return useQuery({
		queryKey: [...factoryKeys.usage, "tree", run ?? ""],
		queryFn: () => unwrap(commands.usageTreeGet(run ?? "")),
		enabled: run !== null,
	});
}

export function useUsage() {
	useFresh();
	return useQuery({ queryKey: factoryKeys.usage, queryFn: () => unwrap(commands.usageGet()) });
}

/** Writes of the file editors, the kill switch and the budgets. Each reads the factory again, also when it fails. */
export function useFactoryWrites() {
	const qc = useQueryClient();
	return useMemo(() => {
		const run = async <T>(
			call: Promise<{ status: "ok"; data: T } | { status: "error"; error: unknown }>,
		) => {
			try {
				return await unwrap(call);
			} finally {
				await qc.invalidateQueries({ queryKey: factoryKeys.all });
			}
		};
		return {
			check: (id: string, text: string) => unwrap(commands.workflowCheck(id, text)),
			render: (id: string, workflow: Workflow, text: string) =>
				unwrap(commands.workflowRender(id, workflow, text)),
			create: (id: string, from: WorkflowSource) => run(commands.workflowCreate(id, from)),
			rename: (id: string, to: string) => run(commands.workflowRename(id, to)),
			remove: (id: string) => run(commands.workflowDelete(id)),
			apply: (id: string) => run(commands.workflowProposalApply(id)),
			discard: (id: string) => run(commands.workflowProposalDiscard(id)),
			write: (kind: "workflow" | "role", id: string, text: string) =>
				run(kind === "workflow" ? commands.workflowWrite(id, text) : commands.roleWrite(id, text)),
			killSwitch: (on: boolean) => run(commands.killSwitchSet(on)),
			reviewStop: (number: number) => run(commands.prReviewStop(number)),
			budget: (scope: string, key: string, usd: number | null) =>
				run(commands.budgetSet(scope, key, usd)),
		};
	}, [qc]);
}

export const machineKeys = {
	sessions: ["machine", "sessions"] as const,
	spend: (days: number) => ["machine", "spend", days] as const,
};

/** Every AI session on this computer, not only the factory runs. It reads again every 5 s. */
export function useMachineSessions() {
	return useQuery({
		queryKey: machineKeys.sessions,
		queryFn: () => unwrap(commands.machineSessions()),
		refetchInterval: 5000,
	});
}

/** The totals so far, which the scan sends while it reads the agent logs. */
export type SpendProgress = { rows: SpendRow[]; read: number; found: number };
const SPEND_PROGRESS_EVENT = "machine-spend-progress";

/**
 * The spend of the last `days` days on this computer, with the monthly budgets. While the scan
 * reads, `partial` holds the totals so far. The query result replaces it.
 */
export function useMachineSpend(days: number) {
	const [partial, setPartial] = useState<SpendProgress | null>(null);
	const query = useQuery({
		queryKey: machineKeys.spend(days),
		queryFn: () => unwrap(commands.machineSpend(days)),
	});
	useEffect(() => {
		if (!isTauri()) return;
		const off = listen<SpendProgress>(SPEND_PROGRESS_EVENT, (e) => setPartial(e.payload));
		return () => void off.then((f) => f());
	}, []);
	const fetching = query.isFetching;
	useEffect(() => {
		if (!fetching) setPartial(null);
	}, [fetching]);
	return { ...query, partial: fetching ? partial : null };
}

/**
 * The spend of every AI tool on this computer by UTC day, for the last `days` days: `today`, the
 * month so far and `series` (oldest first, a day with no row is 0). The last result stays while a
 * new read runs, so an amount never drops and counts up again. `ready` is false until a first read.
 */
export function useDailySpend(days: number) {
	const spend = useMachineSpend(Math.max(days, 31));
	const scanned = spend.data ?? spend.partial;
	const byDay = new Map<string, number>();
	for (const r of scanned?.rows ?? []) byDay.set(r.day, (byDay.get(r.day) ?? 0) + (r.costUsd ?? 0));
	const today = new Date().toISOString().slice(0, 10);
	const month = [...byDay]
		.filter(([d]) => d.startsWith(today.slice(0, 7)))
		.reduce((sum, [, usd]) => sum + usd, 0);
	const series = Array.from({ length: days }, (_, i) => {
		const d = new Date(`${today}T00:00:00Z`);
		d.setUTCDate(d.getUTCDate() - (days - 1 - i));
		const key = d.toISOString().slice(0, 10);
		return { day: key, usd: byDay.get(key) ?? 0 };
	});
	return {
		ready: scanned != null,
		today: byDay.get(today) ?? 0,
		month,
		series,
		monthBudget: spend.data?.budgets.find((b) => b.runner === "*")?.usd ?? null,
	};
}

/** A stop and a budget write read the machine again, also when they fail. */
export function useMachineWrites() {
	const qc = useQueryClient();
	return useMemo(() => {
		const run = async <T>(
			call: Promise<{ status: "ok"; data: T } | { status: "error"; error: unknown }>,
		) => {
			try {
				return await unwrap(call);
			} finally {
				await qc.invalidateQueries({ queryKey: ["machine"] });
			}
		};
		return {
			stop: (pid: number) => run(commands.machineSessionStop(pid, true)),
			budget: (runner: string, usd: number | null) => run(commands.machineBudgetSet(runner, usd)),
		};
	}, [qc]);
}
