import { useRouter } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	type RefObject,
	useContext,
	useEffect,
	useRef,
} from "react";
import { useGuard } from "@/features/work/guard";
import { ENDED, useRunActions, useRunDiff, useRunLog, useRuns, useWorkflow } from "@/lib/factory";
import { useRunWaits } from "@/lib/home";
import type { RunView_Serialize } from "@/lib/ipc";
import { pullHref, useShell } from "@/lib/shell";

/** A live run reads pages on its own up to this many events (20 pages of 50); past it, "Load more" reads the rest. */
export const LIVE_MAX_EVENTS = 1000;

/** Start again: a new run of the same ticket, then `open` gets its id. Run page and Failed card share it. */
export async function startAgain(
	act: ReturnType<typeof useRunActions>,
	key: string,
	open: (id: string) => void,
) {
	open(await act.start(key));
}

/** The data and the actions of one run, read once for each part of the feature page (flow REQ-012). */
export type RunScopeData = {
	run: RunView_Serialize;
	events: ReturnType<typeof useRunLog>["events"];
	log: ReturnType<typeof useRunLog>;
	/** A live run still reads its pages: the live line waits for the last one. */
	loading: boolean;
	active: boolean;
	waits: ReturnType<typeof useRunWaits>;
	workflow: ReturnType<typeof useWorkflow>["data"];
	diff: NonNullable<ReturnType<typeof useRunDiff>["data"]>;
	act: ReturnType<typeof useRunActions>;
	error: string | null;
	guard: ReturnType<typeof useGuard>["run"];
	/** Moves the focus to the first match inside what waits for the person. */
	focusIn: (selector: string) => void;
	needs: RefObject<HTMLDivElement | null>;
	openPr: (reference?: string) => void;
	again: () => void;
};

const Scope = createContext<RunScopeData | null>(null);

/** The run of the open feature, or null when the feature has none. */
export const useRunScope = () => useContext(Scope);

/**
 * Reads the run of the feature once: the log with its pages, what waits, the diff and the workflow.
 * The parts of the feature page read it with `useRunScope`.
 */
export function RunScope({ id, children }: { id: string; children: ReactNode }) {
	const run = useRuns(id).data?.find((r) => r.id === id);
	const workflow = useWorkflow(run?.workflow ?? "").data;
	const diff = useRunDiff(id).data ?? [];
	const active = run !== undefined && !ENDED.includes(run.state);
	const log = useRunLog(id, active);
	const waits = useRunWaits(id);
	// A live run shows its newest event: read each page until the last one, up to the cap.
	const { hasNextPage, isFetchingNextPage, fetchNextPage } = log;
	const count = log.events.length;
	const loading = hasNextPage && count < LIVE_MAX_EVENTS;
	// `count` is a dependency: a page can land with no visible change of the fetching flag.
	// biome-ignore lint/correctness/useExhaustiveDependencies: count re-runs the effect for the next page
	useEffect(() => {
		if (active && loading && !isFetchingNextPage) void fetchNextPage();
	}, [active, loading, isFetchingNextPage, fetchNextPage, count]);
	const act = useRunActions();
	const { openRef } = useShell();
	const router = useRouter({ warn: false });
	const { error, run: guard } = useGuard();
	const needs = useRef<HTMLDivElement>(null);
	if (!run) return <Scope.Provider value={null}>{children}</Scope.Provider>;
	const value: RunScopeData = {
		run,
		events: log.events,
		log,
		loading: !!loading,
		active,
		waits,
		workflow,
		diff,
		act,
		error,
		guard,
		needs,
		focusIn: (selector) => needs.current?.querySelector<HTMLElement>(selector)?.focus(),
		openPr: (reference) => {
			void router?.navigate(reference ? pullHref(reference) : { to: "/code/now" });
		},
		again: () => void guard(() => startAgain(act, run.key, (started) => openRef(`run:${started}`))),
	};
	return <Scope.Provider value={value}>{children}</Scope.Provider>;
}
