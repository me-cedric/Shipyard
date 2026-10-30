import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useFactoryEvents } from "@/lib/home";
import { commands, unwrap } from "@/lib/ipc";

export type { RunItem } from "@/lib/home";

export const factoryKeys = {
	all: ["factory"] as const,
	runs: ["factory", "runs"] as const,
	kill: ["factory", "kill"] as const,
	workflows: ["factory", "workflows"] as const,
	roles: ["factory", "roles"] as const,
	sessions: ["factory", "sessions"] as const,
	usage: ["factory", "usage"] as const,
	file: (kind: "workflow" | "role", id: string) => ["factory", "file", kind, id] as const,
	workflow: (id: string) => ["factory", "workflow", id] as const,
	diff: (run: string) => ["factory", "diff", run] as const,
	log: (run: string) => ["factory", "log", run] as const,
};

const PAGE = 50;

/** Reads again at each factory event (the mock emits none: each action reads again). */
function useFresh() {
	const qc = useQueryClient();
	useFactoryEvents(() => void qc.invalidateQueries({ queryKey: factoryKeys.all }));
}

export function useRuns() {
	useFresh();
	return useQuery({ queryKey: factoryKeys.runs, queryFn: () => unwrap(commands.runsList()) });
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
export function useRunLog(run: string) {
	const q = useInfiniteQuery({
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
			call: Promise<{ status: "ok"; data: T } | { status: "error"; error: string }>,
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
			unblock: (id: string) => run(commands.runUnblock(id)),
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

export function useUsage() {
	useFresh();
	return useQuery({ queryKey: factoryKeys.usage, queryFn: () => unwrap(commands.usageGet()) });
}

/** Writes of the file editors, the kill switch and the budgets. Each reads the factory again, also when it fails. */
export function useFactoryWrites() {
	const qc = useQueryClient();
	return useMemo(() => {
		const run = async <T>(
			call: Promise<{ status: "ok"; data: T } | { status: "error"; error: string }>,
		) => {
			try {
				return await unwrap(call);
			} finally {
				await qc.invalidateQueries({ queryKey: factoryKeys.all });
			}
		};
		return {
			check: (id: string, text: string) => unwrap(commands.workflowCheck(id, text)),
			write: (kind: "workflow" | "role", id: string, text: string) =>
				run(kind === "workflow" ? commands.workflowWrite(id, text) : commands.roleWrite(id, text)),
			killSwitch: (on: boolean) => run(commands.killSwitchSet(on)),
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

/** The spend of the last `days` days on this computer, with the monthly budgets. */
export function useMachineSpend(days: number) {
	return useQuery({
		queryKey: machineKeys.spend(days),
		queryFn: () => unwrap(commands.machineSpend(days)),
	});
}

/** A stop and a budget write read the machine again, also when they fail. */
export function useMachineWrites() {
	const qc = useQueryClient();
	return useMemo(() => {
		const run = async <T>(
			call: Promise<{ status: "ok"; data: T } | { status: "error"; error: string }>,
		) => {
			try {
				return await unwrap(call);
			} finally {
				await qc.invalidateQueries({ queryKey: ["machine"] });
			}
		};
		return {
			stop: (pid: number) => run(commands.machineSessionStop(pid)),
			budget: (runner: string, usd: number | null) => run(commands.machineBudgetSet(runner, usd)),
		};
	}, [qc]);
}
