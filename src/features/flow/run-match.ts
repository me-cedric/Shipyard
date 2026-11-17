import { nameOf } from "@/features/factory/runs/run-live";
import type { RunItem } from "@/lib/home";
import { foldWords } from "@/lib/refs";

/** The search and the filter of the runs, on the list in memory: they never fetch. */
export function runMatcher(text: string, filter: "all" | "needs" | "mine", mine: Set<string>) {
	const q = foldWords(text);
	return (r: RunItem) =>
		(q.length === 0 ||
			q.every((w) =>
				foldWords(`${r.key} ${r.title} ${nameOf(r.workflow)}`)
					.join(" ")
					.includes(w),
			)) &&
		(filter === "all" || (filter === "needs" ? r.lane === "needs_you" : mine.has(r.key)));
}
