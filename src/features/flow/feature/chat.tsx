import { PullPart } from "@/features/code/pull-page";
import { useRunScope } from "@/features/factory/runs/run-detail";
import { UnitTranscript } from "@/features/factory/runs/unit-chat";
import { transcript } from "@/features/factory/runs/unit-transcript";
import { TicketComments } from "@/features/sync/ticket-thread";
import { useI18n } from "@/lib/i18n";
import { EmptyState } from "@/ui/molecules/empty-state";
import { keyOf, StartAgent } from "./start";
import type { Parts } from "./use-feature";

/** Chat: the conversation of the session, the pull request conversation and the comments of the ticket. */
export function Chat({ parts }: { parts: Parts }) {
	const { t } = useI18n();
	const scope = useRunScope();
	const key = keyOf(parts.ticket);
	const session = scope?.run.steps
		.flatMap((s) => s.units)
		.find((u) => u.state === "running" && u.runner !== "");
	// An empty conversation draws no box.
	const mine = scope && session ? scope.events.filter((e) => e.step === session.id) : [];
	const talk = transcript(mine).items.length > 0;
	if (!(talk || parts.pr || key))
		return (
			<EmptyState
				title={t.flow.feature.noChat}
				extra={scope ? null : <StartAgent parts={parts} />}
			/>
		);
	return (
		<div className="flex flex-col gap-6">
			{scope && talk ? (
				<div className="overflow-hidden rounded-lg border bg-surface-1">
					<UnitTranscript events={mine} ticket={scope.run.key} running />
				</div>
			) : null}
			{parts.pr ? <PullPart part="chat" /> : null}
			{key ? <TicketComments itemKey={key} /> : null}
		</div>
	);
}
