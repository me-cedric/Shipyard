import { motion } from "motion/react";
import { format, useI18n } from "@/lib/i18n";
import type { RunState } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { Avatar } from "../atoms/avatar";
import { Badge } from "../atoms/badge";
import { LiveDot } from "../atoms/live-dot";
import { Progress } from "../atoms/progress";
import { type Status, StatusDot } from "../atoms/status-dot";
import { ITEM, SPRING } from "../motion";
import { SpendMeter } from "./spend-meter";

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

/** The colour of the left rail and the state chip, per status. */
export const STATUS_RAIL: Record<Status, string> = {
	active: "bg-accent-gradient",
	success: "bg-success",
	warning: "bg-warning",
	danger: "bg-danger",
	info: "bg-info",
	idle: "bg-n-8",
};
export const STATUS_BADGE = {
	active: "accent",
	success: "success",
	warning: "warning",
	danger: "danger",
	info: "info",
	idle: "neutral",
} as const satisfies Record<Status, string>;

const CI: Record<string, Status> = {
	none: "idle",
	pending: "info",
	passing: "success",
	failing: "danger",
};

export type RunCardPr = { reference: string; ci: string; review: string; draft: boolean };

const usd = (n: number) => `$${n.toFixed(2)}`;

/**
 * A run in a lane: a status rail, the agent, the step progress, the cost against the budget and
 * the chips. Enter opens it. The pull request chips show only when `pr` is set: the lanes
 * In review and Ready to merge (delivery REQ-029).
 */
export function RunCard({
	itemKey,
	title,
	state,
	workflow,
	agent,
	live,
	steps,
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
	/** The step that works now, shown as the agent. */
	agent?: string;
	/** An agent works on the run now. */
	live?: boolean;
	steps?: { done: number; total: number };
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
	const status = RUN_STATUS[state];
	const ci = pr ? (f.ci[pr.ci as keyof typeof f.ci] ?? pr.ci) : "";
	const review = pr ? (f.review[pr.review as keyof typeof f.review] ?? pr.review) : "";
	return (
		<motion.button
			type="button"
			variants={ITEM}
			whileHover={{ y: -2 }}
			whileTap={{ scale: 0.98 }}
			transition={SPRING.snappy}
			aria-current={selected ? "true" : undefined}
			onClick={onOpen}
			className={cn(
				"group relative flex w-full shrink-0 flex-col gap-2 overflow-hidden rounded-lg border bg-surface-2 py-2.5 pr-2.5 pl-4 text-left shadow-1 transition-shadow duration-(--duration-base) hover:shadow-2 focus-visible:shadow-glow",
				selected && "border-accent shadow-glow",
			)}
		>
			<span
				aria-hidden="true"
				className={cn("absolute inset-y-0 left-0 w-1", STATUS_RAIL[status])}
			/>
			<span className="flex items-center gap-2">
				<span className="flex-1 font-mono text-11 text-n-11">{itemKey}</span>
				<Badge variant={STATUS_BADGE[status]}>
					<StatusDot status={status} label={f.state[state]} className="size-2" />
					{f.state[state]}
				</Badge>
			</span>
			<span className="line-clamp-2 text-ui font-medium text-n-12">{title}</span>
			<span className="flex items-center gap-2 text-12 text-n-11">
				<span className="relative flex">
					<Avatar name={agent ?? workflow} className="size-5 text-11" />
					{live ? (
						<LiveDot className="absolute -right-0.5 -bottom-0.5 size-2 ring-2 ring-surface-2" />
					) : null}
				</span>
				<span className="min-w-0 flex-1 truncate font-mono text-11">
					{agent ? `${workflow} / ${agent}` : workflow}
				</span>
				{steps ? (
					<span className="font-mono text-11">
						{steps.done}/{steps.total}
					</span>
				) : null}
			</span>
			{steps ? (
				<Progress
					value={steps.done}
					max={steps.total}
					label={format(f.stepsDone, { done: steps.done, total: steps.total })}
				/>
			) : null}
			<span className="flex items-center gap-2 font-mono text-11 text-n-11">
				<span className="shrink-0">
					{usd(costUsd ?? 0)}
					{budgetUsd === null ? "" : ` / ${usd(budgetUsd)}`}
				</span>
				<span className="min-w-0 flex-1">
					<SpendMeter usd={costUsd ?? 0} budget={budgetUsd} label={`${f.cost} ${itemKey}`} />
				</span>
			</span>
			{questions > 0 || approvals > 0 || pr ? (
				<span className="flex flex-wrap items-center gap-1">
					{questions > 0 ? (
						<Badge variant="warning">
							{f.questions} {questions}
						</Badge>
					) : null}
					{approvals > 0 ? (
						<Badge variant="info">
							{f.approvals} {approvals}
						</Badge>
					) : null}
					{pr ? (
						<>
							<Badge className="font-mono">{pr.reference}</Badge>
							<Badge variant={STATUS_BADGE[CI[pr.ci] ?? "idle"]}>
								<StatusDot status={CI[pr.ci] ?? "idle"} label={ci} className="size-2" />
								{ci}
							</Badge>
							<Badge variant={pr.review === "clear" ? "success" : "warning"}>
								<StatusDot
									status={pr.review === "clear" ? "success" : "warning"}
									label={review}
									className="size-2"
								/>
								{review}
							</Badge>
							{pr.draft ? <Badge>{f.draft}</Badge> : null}
						</>
					) : null}
				</span>
			) : null}
		</motion.button>
	);
}
