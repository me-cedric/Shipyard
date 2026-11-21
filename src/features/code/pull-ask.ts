import type { PullDetail } from "@/lib/code";
import { format } from "@/lib/i18n";
import { useShell } from "@/lib/shell";

/**
 * Opens the assistant with a question about a pull request in the draft. The person reads it and
 * sends it. The values are the ones of `PrAi`, plus the failing checks and the open threads.
 */
export function usePullAsk(d: PullDetail) {
	const { ask } = useShell();
	const said = (th: PullDetail["threads"][number]) =>
		th.comments.map((c) => `${c.author}: ${c.body}`).join(" / ");
	return (prompt: string, none = "") =>
		ask(
			format(prompt, {
				number: d.number,
				title: d.title,
				source: d.sourceBranch,
				target: d.targetBranch,
				ci: d.ci,
				files: d.files.map((f) => f.path).join(", "),
				threads: d.threads.map(said).join(" | "),
				failing:
					d.checks
						.filter((c) => c.state === "failing")
						.map((c) => c.name)
						.join(", ") || none,
				open:
					d.threads
						.filter((th) => !th.resolved)
						.map(said)
						.join(" | ") || none,
			}),
		);
}
