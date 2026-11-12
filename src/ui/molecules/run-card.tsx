import { motion } from "motion/react";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import type { RunState } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { Badge } from "../atoms/badge";
import { Button } from "../atoms/button";
import { LiveDot } from "../atoms/live-dot";
import { Progress } from "../atoms/progress";
import { type Status, StatusDot } from "../atoms/status-dot";
import { ChevronDownIcon } from "../icons";
import { ITEM, SPRING } from "../motion";
import { ContextMenu, type MenuItem } from "./context-menu";
import { MenuButton } from "./menu-button";
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

export type RunCardPr = { number: number; ci: string; review: string; draft: boolean };

const usd = (n: number) => `$${n.toFixed(2)}`;

/**
 * A run in a lane (ux-declutter REQ-037): each fact once. The ticket key leads, then the title; one
 * progress bar with "n of m" and the step name; one cost line; the pull request as `#44` with its
 * chips (only when `pr` is set: the lanes In review and Ready to merge). The card opens the run.
 * `action` is the one button of a card that waits for a person. It sits beside the open control, not
 * inside it. The menu button lists the items of `menu`, and Stop when `onStop` is set.
 */
export function RunCard({
	itemKey,
	title,
	state,
	live,
	step,
	workflow,
	costUsd,
	budgetUsd,
	questions,
	approvals,
	pr,
	selected,
	onOpen,
	menu,
	action,
	onStop,
	stopDisabled,
	stopReason,
}: {
	itemKey: string;
	title: string;
	state: RunState;
	/** An agent works on the run now. */
	live?: boolean;
	/** The step as n of m, and the name of the step that works now. */
	step?: { n: number; total: number; name?: string };
	/** The name of the workflow: it leads the step line. */
	workflow?: string;
	costUsd: number | null;
	budgetUsd: number | null;
	questions: number;
	approvals: number;
	pr?: RunCardPr | null;
	selected?: boolean;
	onOpen: () => void;
	menu?: MenuItem[];
	action?: { label: string; onClick: () => void; disabled?: boolean; reason?: string };
	/** A run that has not ended: Stop shows in the menu, after a confirmation. */
	onStop?: () => void;
	stopDisabled?: boolean;
	/** Why Stop is off. */
	stopReason?: string;
}) {
	const { t } = useI18n();
	const f = t.factory;
	const [stopping, setStopping] = useState(false);
	const status = RUN_STATUS[state];
	const ci = pr ? (f.ci[pr.ci as keyof typeof f.ci] ?? pr.ci) : "";
	const review = pr ? (f.review[pr.review as keyof typeof f.review] ?? pr.review) : "";
	const items = [
		...(menu ?? []),
		...(onStop
			? [
					{
						id: "stop",
						label: f.kill,
						danger: true,
						disabled: stopDisabled,
						reason: stopReason,
						onSelect: () => setStopping(true),
					},
				]
			: []),
	];
	const stepLine = [workflow, step?.name].filter(Boolean).join(" · ");
	return (
		<ContextMenu items={items}>
			<motion.div
				role="group"
				aria-label={`${itemKey} ${title}`}
				variants={ITEM}
				whileHover={{ y: -2 }}
				transition={SPRING.snappy}
				aria-current={selected ? "true" : undefined}
				className={cn(
					"group relative flex w-full min-w-0 shrink-0 flex-col gap-2 overflow-hidden rounded-lg border bg-surface-2 py-2.5 pr-2.5 pl-4 shadow-1 transition-shadow duration-(--duration-base) hover:shadow-2",
					selected && "border-accent shadow-glow",
				)}
			>
				<span
					aria-hidden="true"
					className={cn("absolute inset-y-0 left-0 w-1", STATUS_RAIL[status])}
				/>
				{/* The whole card is this one control: its box grows over the card, and the footer sits above it. */}
				<button
					type="button"
					onClick={onOpen}
					className="flex min-w-0 flex-col gap-2 text-left after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:shadow-glow"
				>
					<span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
						<span className="font-mono text-11 text-n-11">{itemKey}</span>
						<Badge variant={STATUS_BADGE[status]}>
							<StatusDot status={status} label={f.state[state]} className="size-2" />
							{f.state[state]}
						</Badge>
					</span>
					<span title={title} className="line-clamp-2 text-ui font-medium text-n-12">
						{title}
					</span>
					{step && step.total > 0 ? (
						<span className="flex flex-col gap-1">
							<span className="flex items-center gap-2 text-12 text-n-11">
								{live ? <LiveDot className="size-2" /> : null}
								<span title={stepLine} className="min-w-0 flex-1 truncate">
									{stepLine}
								</span>
								<span className="shrink-0 font-mono text-11">
									{format(f.nOf, { n: step.n, total: step.total })}
								</span>
							</span>
							<Progress
								value={step.n}
								max={step.total}
								label={format(f.stepOf, { n: step.n, total: step.total })}
							/>
						</span>
					) : null}
					{costUsd === null ? null : (
						<span className="flex items-center gap-2 font-mono text-11 text-n-11">
							<span className="shrink-0">
								{usd(costUsd)}
								{budgetUsd === null ? "" : ` / ${usd(budgetUsd)}`}
							</span>
							<span className="min-w-0 flex-1">
								<SpendMeter usd={costUsd} budget={budgetUsd} label={`${f.cost} ${itemKey}`} />
							</span>
						</span>
					)}
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
									<Badge className="font-mono">#{pr.number}</Badge>
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
				</button>
				{action || items.length ? (
					<div className="relative z-10 flex items-center justify-between gap-2">
						{stopping ? (
							<Button
								variant="danger"
								autoFocus
								onBlur={() => setStopping(false)}
								onClick={() => {
									setStopping(false);
									onStop?.();
								}}
							>
								{format(f.machine.confirmStop, { name: itemKey })}
							</Button>
						) : (
							<>
								{action ? (
									<Button
										variant="primary"
										disabled={action.disabled}
										reason={action.reason}
										onClick={action.onClick}
									>
										{action.label}
									</Button>
								) : (
									<span />
								)}
								{items.length ? (
									<MenuButton
										iconOnly
										label={f.moreActions}
										icon={<ChevronDownIcon size={14} />}
										items={items}
									/>
								) : null}
							</>
						)}
					</div>
				) : null}
			</motion.div>
		</ContextMenu>
	);
}
