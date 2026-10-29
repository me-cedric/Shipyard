import type { Status } from "@/ui/atoms/status-dot";

/** The shape and colour of a CI or check state. */
export const CI_STATUS: Record<string, Status> = {
	passing: "success",
	failing: "danger",
	pending: "active",
	none: "idle",
	skipped: "idle",
};

/** The shape and colour of a review state or a verdict. */
export const REVIEW_STATUS: Record<string, Status> = {
	clear: "idle",
	approved: "success",
	changes_requested: "danger",
	"changes-requested": "danger",
};

export const SEVERITY_STATUS: Record<string, Status> = {
	critical: "danger",
	high: "danger",
	medium: "warning",
	low: "info",
};
