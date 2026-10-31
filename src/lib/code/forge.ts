import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	commands,
	type ImpactEntry,
	type MergeMethod,
	type OpenPull_Deserialize,
	type PrRowView,
	type PullDetail_Serialize,
	type QualityReport_Serialize,
	type QualityView_Serialize,
	unwrap,
	type Verdict,
} from "@/lib/ipc";

export type { ImpactEntry, MergeMethod, PrRowView, Verdict };
export type PullDetail = PullDetail_Serialize;
export type QualityReport = QualityReport_Serialize;
export type QualityView = QualityView_Serialize;

// Every key starts with `code`, so a git action and a forge write refresh the same views.
export const forgeKeys = {
	pulls: ["code", "pulls"] as const,
	pull: (n: number) => ["code", "pull", n] as const,
	labels: ["code", "pull-labels"] as const,
	quality: ["code", "quality"] as const,
	refs: ["code", "impact-refs"] as const,
	impacts: ["code", "impacts"] as const,
	impact: (path: string) => ["code", "impact", path] as const,
};

/** The mirror of the forge pull requests. It never calls the forge (REQ-018). */
export function usePulls() {
	return useQuery({ queryKey: forgeKeys.pulls, queryFn: () => unwrap(commands.pullsList()) });
}

/** Why the list can be empty: no code host, a code host with no pull request, or a failing code host. */
export function usePullsStatus() {
	return useQuery({
		queryKey: [...forgeKeys.pulls, "status"],
		queryFn: () => unwrap(commands.pullsStatusGet()),
	});
}

export function usePull(number: number | null) {
	return useQuery({
		queryKey: forgeKeys.pull(number ?? 0),
		queryFn: () => unwrap(commands.codePullDetail(number ?? 0)),
		enabled: number !== null,
	});
}

export function usePullLabels() {
	return useQuery({
		queryKey: forgeKeys.labels,
		queryFn: () => unwrap(commands.codePullLabels()),
	});
}

/** The origin of the project: `null` for a local project. */
export function useOrigin() {
	return useQuery({
		queryKey: ["code", "origin"],
		queryFn: () => unwrap(commands.codeOrigin()),
	});
}

/** The code editors that the machine has. Empty when none is found. */
export function useEditors() {
	return useQuery({
		queryKey: ["editors"],
		queryFn: () => unwrap(commands.editorsList()),
		staleTime: 60_000,
	});
}

export function useQuality() {
	return useQuery({ queryKey: forgeKeys.quality, queryFn: () => unwrap(commands.codeQuality()) });
}

/** The line coverage of the report that the project produced, or `null` when it has none. */
export function useCoverageReport() {
	return useQuery({
		queryKey: [...forgeKeys.quality, "coverage"],
		queryFn: () => unwrap(commands.codeCoverage()),
	});
}

export function useImpactRefs() {
	return useQuery({ queryKey: forgeKeys.refs, queryFn: () => unwrap(commands.codeImpactRefs()) });
}

export function useImpacts() {
	return useQuery({
		queryKey: forgeKeys.impacts,
		queryFn: () => unwrap(commands.codeImpactList()),
	});
}

export function useImpactText(path: string | null) {
	return useQuery({
		queryKey: forgeKeys.impact(path ?? ""),
		queryFn: () => unwrap(commands.codeImpactRead(path ?? "")),
		enabled: !!path,
	});
}

type Result<T> = { status: "ok"; data: T } | { status: "error"; error: unknown };

/**
 * Each forge write, check run, scan and Analyze. Each one is a person's click, so each sends
 * `click: true`. After it runs, or fails, the views read their data again (REQ-025).
 */
export function useForgeActions() {
	const qc = useQueryClient();
	return useMemo(() => {
		const run = async <T>(call: Promise<Result<T>>): Promise<T> => {
			try {
				return await unwrap(call);
			} finally {
				await qc.invalidateQueries({ queryKey: ["code"] });
			}
		};
		return {
			open: (input: OpenPull_Deserialize) => run(commands.codePullOpen(input, true)),
			comment: (n: number, body: string) => run(commands.codePullComment(n, body, true)),
			verdict: (n: number, verdict: Verdict, body: string) =>
				run(commands.codePullVerdict(n, verdict, body, true)),
			merge: (n: number, method: MergeMethod) => run(commands.codePullMerge(n, method, true)),
			ready: (n: number) => run(commands.codePullReady(n, true)),
			close: (n: number, reason: string) => run(commands.codePullClose(n, reason, true)),
			sendBack: (n: number, text: string) => run(commands.codePullSendBack(n, text, true)),
			archiveSpec: (n: number, change: string, confirmed: boolean) =>
				run(commands.codePullArchiveSpec(n, change, confirmed, true)),
			publish: (connection: string, slug: string) =>
				run(commands.codePublish(connection, slug, true)),
			setRemote: (url: string) => run(commands.codeRemoteSet(url, true)),
			check: (command: string) => run(commands.codeCheckRun(command, true)),
			scan: (name: string) => run(commands.codeScanRun(name, true)),
			install: (name: string) => run(commands.codeScannerInstall(name, true)),
			installTool: (id: string) => run(commands.doctorToolInstall(id, true)),
			gatesPropose: () => unwrap(commands.codeGatesPropose()),
			gatesSave: (gates: string[]) => run(commands.codeGatesSave(gates, true)),
			sbom: () => run(commands.codeSbomExport(true)),
			analyze: (base: string) => run(commands.codeImpactAnalyze(base, true)),
		};
	}, [qc]);
}
