import { PlanBlock, planOf } from "@/features/factory/runs/plan";
import { type RunScopeData, useRunScope } from "@/features/factory/runs/run-detail";
import { ChangeDetail } from "@/features/specs/change-detail";
import { TicketDetail } from "@/features/work/ticket-detail";
import { useI18n } from "@/lib/i18n";
import { RightButton } from "@/lib/rights";
import { useChanges } from "@/lib/specs";
import { EmptyState } from "@/ui/molecules/empty-state";
import { keyOf, WriteSpec } from "./start";
import type { Parts } from "./use-feature";

/** Brief: the plan in review, the facts of the ticket and the spec change of the feature. */
export function Brief({ parts, onBack }: { parts: Parts; onBack: () => void }) {
	const { t } = useI18n();
	const scope = useRunScope();
	const changes = useChanges().data;
	const change = parts.change ? changes?.find((c) => `change:${c.id}` === parts.change) : undefined;
	const plan = scope && scope.run.state === "PlanReview" ? planOf(scope.events) : null;
	const key = keyOf(parts.ticket);
	return (
		<div className="flex flex-col gap-6">
			{scope && plan ? <PlanReview scope={scope} plan={plan} /> : null}
			{key ? <TicketDetail itemKey={key} comments={false} /> : null}
			{change ? (
				<ChangeDetail change={change} onBack={onBack} />
			) : (
				<EmptyState title={t.flow.feature.noSpec} extra={<WriteSpec parts={parts} />} />
			)}
		</div>
	);
}

function PlanReview({
	scope,
	plan,
}: {
	scope: RunScopeData;
	plan: NonNullable<ReturnType<typeof planOf>>;
}) {
	const { t } = useI18n();
	const { run, act, guard } = scope;
	return (
		<div className="flex flex-col gap-2">
			<PlanBlock plan={plan} />
			<div>
				<RightButton
					right="runs.approve"
					className="min-h-control"
					variant="primary"
					onClick={() => void guard(() => act.planApprove(run.id))}
				>
					{t.factory.planApprove}
				</RightButton>
			</div>
		</div>
	);
}
