import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo } from "react";
import {
	type Branch_Serialize,
	type Changes_Serialize,
	type CommitDetail_Serialize,
	type CommitInfo,
	type ConflictFile,
	commands,
	type DiffSide,
	type FileChange_Serialize,
	type FileDiff,
	isTauri,
	type MergeOutcome,
	type PullOutcome,
	type RebaseOutcome,
	type Resolution,
	type Stash,
	unwrap,
	type WatchNotice_Serialize,
} from "@/lib/ipc";

export type Changes = Changes_Serialize;
export type FileChange = FileChange_Serialize;
export type Branch = Branch_Serialize;
export type CommitDetail = CommitDetail_Serialize;
export type WatchNotice = WatchNotice_Serialize;
export type {
	CommitInfo,
	ConflictFile,
	DiffSide,
	FileDiff,
	MergeOutcome,
	PullOutcome,
	RebaseOutcome,
	Resolution,
	Stash,
};

/** The commit types of `shipyard-core`. A branch name starts with one of them. */
export const COMMIT_TYPES = ["feat", "fix", "chore", "docs", "refactor", "test"] as const;
/** The advice for a summary length. It never blocks a longer one. */
export const SUMMARY_ADVICE = 50;
const PAGE = 30;
const NOTICE_EVENT = "code-notice";

export const codeKeys = {
	all: ["code"] as const,
	status: ["code", "status"] as const,
	diff: (path: string, side: DiffSide) => ["code", "diff", path, side] as const,
	log: ["code", "log"] as const,
	detail: (sha: string) => ["code", "detail", sha] as const,
	commitDiff: (sha: string, path: string) => ["code", "commit-diff", sha, path] as const,
	branches: ["code", "branches"] as const,
	stash: ["code", "stash"] as const,
	conflicts: ["code", "conflicts"] as const,
	notice: ["code", "notice"] as const,
};

/** The working copy of the active project. It refreshes while a view shows it. */
export function useChanges(poll = false) {
	return useQuery({
		queryKey: codeKeys.status,
		queryFn: () => unwrap(commands.codeStatus()),
		staleTime: 2_000,
		refetchInterval: poll ? 5_000 : false,
	});
}

export function useDiff(path: string | null, side: DiffSide, enabled = true) {
	return useQuery({
		queryKey: codeKeys.diff(path ?? "", side),
		queryFn: () => unwrap(commands.codeDiff(path ?? "", side)),
		enabled: enabled && path !== null,
	});
}

export function useLog() {
	return useInfiniteQuery({
		queryKey: codeKeys.log,
		initialPageParam: 0,
		queryFn: ({ pageParam }) => unwrap(commands.codeLog(pageParam, PAGE)),
		getNextPageParam: (last, all) => (last.has_more ? all.length * PAGE : undefined),
	});
}

export function useCommitDetail(sha: string | null) {
	return useQuery({
		queryKey: codeKeys.detail(sha ?? ""),
		queryFn: () => unwrap(commands.codeCommitDetail(sha ?? "")),
		enabled: sha !== null,
	});
}

export function useCommitDiff(sha: string | null, path: string | null) {
	return useQuery({
		queryKey: codeKeys.commitDiff(sha ?? "", path ?? ""),
		queryFn: () => unwrap(commands.codeCommitDiff(sha ?? "", path ?? "")),
		enabled: sha !== null && path !== null,
	});
}

export function useBranches() {
	return useQuery({
		queryKey: codeKeys.branches,
		queryFn: () => unwrap(commands.codeBranches()),
	});
}

export function useStashes() {
	return useQuery({ queryKey: codeKeys.stash, queryFn: () => unwrap(commands.codeStashList()) });
}

export function useConflicts() {
	return useQuery({
		queryKey: codeKeys.conflicts,
		queryFn: () => unwrap(commands.codeConflicts()),
	});
}

/** The remote watch notice of the active project. The event refreshes it. */
export function useWatchNotice() {
	const qc = useQueryClient();
	useEffect(() => {
		if (!isTauri()) return;
		const off = listen(NOTICE_EVENT, () => qc.invalidateQueries({ queryKey: codeKeys.notice }));
		return () => void off.then((f) => f());
	}, [qc]);
	return useQuery({
		queryKey: codeKeys.notice,
		queryFn: () => unwrap(commands.codeWatchNotice()),
	});
}

type Result<T> = { status: "ok"; data: T } | { status: "error"; error: unknown };

/** Each git action. After it runs, every Code view reads its data again, so one place decides. */
export function useCodeActions() {
	const qc = useQueryClient();
	return useMemo(() => {
		const run = async <T>(call: Promise<Result<T>>): Promise<T> => {
			try {
				return await unwrap(call);
			} finally {
				await qc.invalidateQueries({ queryKey: codeKeys.all });
			}
		};
		return {
			stage: (paths: string[]) => run(commands.codeStage(paths)),
			unstage: (paths: string[]) => run(commands.codeUnstage(paths)),
			discard: (paths: string[], untracked: boolean) => run(commands.codeDiscard(paths, untracked)),
			commit: (summary: string, description: string) =>
				run(commands.codeCommit(summary, description)),
			createBranch: (name: string) => run(commands.codeBranchCreate(name)),
			switchBranch: (name: string) => run(commands.codeBranchSwitch(name)),
			deleteBranch: (name: string, force: boolean) => run(commands.codeBranchDelete(name, force)),
			mergeBranch: (name: string) => run(commands.codeBranchMerge(name)),
			abortMerge: () => run(commands.codeMergeAbort()),
			rebaseBranch: (onto: string) => run(commands.codeBranchRebase(onto)),
			continueRebase: () => run(commands.codeRebaseContinue()),
			abortRebase: () => run(commands.codeRebaseAbort()),
			stash: (message: string | null) => run(commands.codeStashPush(message)),
			applyStash: (index: number) => run(commands.codeStashApply(index)),
			dropStash: (id: string) => run(commands.codeStashDrop(id)),
			resolve: (path: string, how: Resolution) => run(commands.codeResolve(path, how)),
			fetch: () => run(commands.codeFetch()),
			pull: () => run(commands.codePull()),
			push: () => run(commands.codePush()),
			pushForce: () => run(commands.codePushForce()),
		};
	}, [qc]);
}

/** The commit and the author of each line of a file at HEAD. Off until the person asks. */
export function useBlame(path: string, enabled: boolean) {
	return useQuery({
		queryKey: [...codeKeys.all, "blame", path],
		queryFn: () => unwrap(commands.codeBlame(path)),
		enabled,
		retry: false,
	});
}

/** The key of the message for a merge result. */
export const mergeKey = (o: MergeOutcome) =>
	typeof o === "string" ? o : "merged" in o ? "merged" : "conflicts";

/** The key of the message for a rebase result. */
export const rebaseKey = (o: RebaseOutcome) => (typeof o === "string" ? o : "conflicts");

/** The commit action stays off with nothing staged or with a conflict left (REQ-007). */
export const canCommit = (c: Changes | undefined) =>
	c !== undefined && c.staged.length > 0 && c.conflicted.length === 0;
export * from "./forge";
