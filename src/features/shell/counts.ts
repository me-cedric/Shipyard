import { useChanges } from "@/lib/code";
import { useRuns } from "@/lib/factory";
import { useInbox } from "@/lib/home";
import { useActiveProject } from "@/lib/projects";
import type { SpaceId } from "./spaces";

/** The live counts of the shell: what needs the person, the runs at work, the changed files. */
export function useCounts() {
	const project = Boolean(useActiveProject().data);
	const inbox = useInbox();
	const runs = useRuns().data ?? [];
	const changes = useChanges().data;
	const needsYou = project
		? inbox.questions.length +
			inbox.approvals.length +
			inbox.plans.length +
			inbox.messages.length +
			Number(inbox.timesheet)
		: 0;
	// A run is live while it works or waits for the person.
	const live = runs.filter((r) => r.lane === "working" || r.lane === "needs_you").length;
	const changed = changes
		? changes.staged.length +
			changes.unstaged.length +
			changes.untracked.length +
			changes.conflicted.length
		: 0;
	const badge: Partial<Record<SpaceId, number>> = {
		home: needsYou,
		factory: live,
		code: changed,
	};
	return { needsYou, live, changes, changed, badge };
}
