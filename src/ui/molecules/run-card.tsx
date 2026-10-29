import { useI18n } from "@/lib/i18n";
import type { RunState } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { type Status, StatusDot } from "../atoms/status-dot";

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

const CI: Record<string, Status> = {
	none: "idle",
	pending: "info",
	passing: "success",
	failing: "danger",
};

export type RunCardPr = { reference: string; ci: string; review: string; draft: boolean };

const usd = (n: number) => `$${n.toFixed(2)}`;

/**
 * A run in a lane. Enter opens it. The pull request line shows only when `pr` is set: the lanes
 * In review and Ready to merge (delivery REQ-029).
 */
export function RunCard({
	itemKey,
	title,
	state,
	workflow,
	costUsd,
	budgetUsd,
	questions,
	approvals,
	pr,
	selected,
	onOpen,
}: {
	itemKey: string;
	title: string;
	state: RunState;
	workflow: string;
	costUsd: number | null;
	budgetUsd: number | null;
	questions: number;
	approvals: number;
	pr?: RunCardPr | null;
	selected?: boolean;
	onOpen: () => void;
}) {
	const { t } = useI18n();
	const f = t.factory;
	return (
		<button
			type="button"
			aria-current={selected ? "true" : undefined}
			onClick={onOpen}
			className={cn(
				"flex w-full flex-col gap-1 rounded-md border border-n-7 bg-n-2 p-2 text-left hover:bg-n-3",
				selected && "bg-n-4",
			)}
		>
			<span className="flex items-center gap-2">
				<span className="flex-1 font-mono text-11 text-n-11">{itemKey}</span>
				<StatusDot status={RUN_STATUS[state]} label={f.state[state]} />
				<span className="text-12">{f.state[state]}</span>
			</span>
			<span className="line-clamp-2 text-ui">{title}</span>
			<span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-11 text-n-11">
				<span>{workflow}</span>
				<span>
					{usd(costUsd ?? 0)}
					{budgetUsd === null ? "" : ` / ${usd(budgetUsd)}`}
				</span>
				{questions > 0 ? (
					<span>
						{f.questions} {questions}
					</span>
				) : null}
				{approvals > 0 ? (
					<span>
						{f.approvals} {approvals}
					</span>
				) : null}
			</span>
			{pr ? (
				<span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-12">
					<span className="font-mono text-11">{pr.reference}</span>
					<span className="flex items-center gap-1">
						<StatusDot status={CI[pr.ci] ?? "idle"} label={f.ci[pr.ci as keyof typeof f.ci]} />
						{f.ci[pr.ci as keyof typeof f.ci]}
					</span>
					<span className="flex items-center gap-1">
						<StatusDot
							status={pr.review === "clear" ? "success" : "warning"}
							label={f.review[pr.review as keyof typeof f.review]}
						/>
						{f.review[pr.review as keyof typeof f.review]}
					</span>
					{pr.draft ? <span className="font-medium">{f.draft}</span> : null}
				</span>
			) : null}
		</button>
	);
}
