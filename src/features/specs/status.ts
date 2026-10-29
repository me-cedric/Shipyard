import type { ArtifactStatus } from "@/lib/specs";
import type { Status } from "@/ui/atoms/status-dot";

/** One shape for each artifact status: missing is a dash, draft a triangle, done a circle. */
export const DOT: Record<ArtifactStatus, Status> = {
	missing: "idle",
	draft: "warning",
	done: "success",
};
