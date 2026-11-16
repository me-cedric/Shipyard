import { useChanges } from "@/lib/code";
import { useRuns } from "@/lib/factory";
import { latestPerTicket, useNeedsYou } from "@/lib/home";
import { useActiveProject } from "@/lib/projects";

/** The live counts of the shell: what needs the person, the runs at work, the changed files. */
export function useCounts() {
	const project = Boolean(useActiveProject().data);
	const needs = useNeedsYou().items.length;
	const runs = latestPerTicket(useRuns().data ?? []);
	const changes = useChanges().data;
	const needsYou = project ? needs : 0;
	// A run is live while it works or waits for the person.
	const live = runs.filter((r) => r.lane === "working" || r.lane === "needs_you").length;
	const changed = changes
		? changes.staged.length +
			changes.unstaged.length +
			changes.untracked.length +
			changes.conflicted.length
		: 0;
	return { needsYou, live, changes, changed };
}
