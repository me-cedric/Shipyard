import type { useRunActions } from "@/lib/factory";
import type { RunView, Stop } from "@/lib/ipc";

/** The one main action of a state in which the agent does not work (`spec:app-redesign#REQ-014`). */
export type StopAction = "reply" | "unblock" | "addBudget" | "tryAgain" | "resume" | "closeDone";

/** The added budget that a click offers, in USD. */
export const DEFAULT_BUDGET = 2;

const OF: Record<Stop, StopAction> = {
	reply: "reply",
	unblock: "unblock",
	add_budget: "addBudget",
	try_again: "tryAgain",
	resume: "resume",
	close_done: "closeDone",
};

/** The main action of a stopped run, or `null`. The backend gives the fact (`stop_of`); no run log needed. */
export const stopAction = (run: { stop?: Stop | null }): StopAction | null =>
	run.stop ? OF[run.stop] : null;

/** Runs the command of an action. `Reply` has no command here: the answer goes through its question. */
export async function doStop(
	act: ReturnType<typeof useRunActions>,
	run: Pick<RunView, "id" | "key">,
	action: StopAction,
	opts: { usd?: number; note?: string; open?: (id: string) => void } = {},
) {
	switch (action) {
		case "unblock":
			return void (await act.unblock(run.id, opts.note));
		case "addBudget":
			return void (await act.resume(run.id, opts.usd ?? DEFAULT_BUDGET, opts.note));
		case "resume":
			return void (await act.resume(run.id, null, opts.note));
		case "closeDone":
			return void (await act.closeDone(run.id));
		case "tryAgain":
			return opts.open?.(await act.start(run.key));
		case "reply":
			return;
	}
}
