import type { PullDetail } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { useShell } from "@/lib/shell";
import { Button } from "@/ui/atoms/button";
import { ChatBubbleIcon } from "@/ui/icons";

/**
 * The three questions to the assistant about a pull request: write the description, review it,
 * reply to its threads. Each one opens the assistant with the context in the draft. The person
 * reads it and sends it.
 */
export function PrAi({ d }: { d: PullDetail }) {
	const { t } = useI18n();
	const { ask } = useShell();
	const p = t.workspace.pr;
	const base = {
		number: d.number,
		title: d.title,
		source: d.sourceBranch,
		target: d.targetBranch,
		ci: d.ci,
		files: d.files.map((f) => f.path).join(", "),
		threads: d.threads.map((th) => th.comments.join(" / ")).join(" | "),
	};
	return (
		<section aria-label={p.group} className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
			{(["describe", "review", "reply"] as const).map((k) => (
				<Button key={k} variant="ghost" onClick={() => ask(format(p.prompt[k], base))}>
					<ChatBubbleIcon size={14} />
					{p[k]}
				</Button>
			))}
		</section>
	);
}
