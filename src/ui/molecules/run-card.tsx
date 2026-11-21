import type { RunState } from "@/lib/ipc";
import type { Status } from "../atoms/status-dot";

/** One shape and colour per run state. A side state that waits for a person is a warning. */
export const RUN_STATUS: Record<RunState, Status> = {
	Queued: "idle",
	Claimed: "active",
	Planning: "active",
	PlanReview: "warning",
	Working: "active",
	SelfReview: "active",
	PROpen: "info",
	ChangesRequested: "warning",
	Merged: "success",
	Done: "success",
	WaitingForAnswer: "warning",
	Blocked: "warning",
	RetryQueued: "idle",
	Paused: "warning",
	Failed: "danger",
	Cancelled: "idle",
};

/** The colour of the state chip, per status. */
export const STATUS_BADGE = {
	active: "accent",
	success: "success",
	warning: "warning",
	danger: "danger",
	info: "info",
	idle: "neutral",
} as const satisfies Record<Status, string>;
