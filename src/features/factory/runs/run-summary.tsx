import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { CI_STATUS, REVIEW_STATUS } from "@/features/code/status";
import { useSessions } from "@/lib/factory";
import { endOf } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import type { RunLogEvent_Serialize, RunState, RunView_Serialize } from "@/lib/ipc";
import { openUrl } from "@/lib/menus";
import { useRights } from "@/lib/rights";
import { Badge } from "@/ui/atoms/badge";
import { BrandIcon, runnerName } from "@/ui/atoms/brand-icon";
import { Button } from "@/ui/atoms/button";
import { Progress } from "@/ui/atoms/progress";
import { StatusDot } from "@/ui/atoms/status-dot";
import {
	ArrowsRightLeftIcon,
	ChevronDownIcon,
	ClockIcon,
	CurrencyIcon,
	QueueListIcon,
} from "@/ui/icons";
import { MenuButton } from "@/ui/molecules/menu-button";
import { RUN_STATUS, STATUS_BADGE } from "@/ui/molecules/run-card";
import { SpendMeter } from "@/ui/molecules/spend-meter";
import { nameOf } from "./run-live";

/** The one action that the summary puts first for a state (factory REQ-030). */
export type Primary = "answer" | "approvePlan" | "unblock" | "resume" | "openPr" | "again";

const PRIMARY: Partial<Record<RunState, Primary>> = {
	WaitingForAnswer: "answer",
	PlanReview: "approvePlan",
	Blocked: "unblock",
	Paused: "resume",
	PROpen: "openPr",
	ChangesRequested: "openPr",
	Failed: "again",
	Cancelled: "again",
};

/** The primary action of a state. A run that ended well offers its pull request when it has one. */
export function primaryOf(state: RunState, hasPr: boolean): Primary | null {
	if (state === "Done" || state === "Merged") return hasPr ? "openPr" : null;
	return PRIMARY[state] ?? null;
}

/** The step as n of m, and the name of the step that works, waits or failed. */
export function stepperOf(run: RunView_Serialize) {
	const done = run.steps.filter((s) => s.state === "done").length;
	const now =
		run.steps.find((s) => s.state === "running") ??
		run.steps.find((s) => s.state === "gate") ??
		run.steps.find((s) => s.state === "failed");
	return {
		n: Math.min(run.steps.length, done + (now ? 1 : 0)),
		total: run.steps.length,
		name: now ? nameOf(now.id) : undefined,
	};
}

/** Milliseconds as days and hours above 48 hours, as hours and minutes, or as minutes and seconds under one hour. The day and hour units follow `lang`. */
export function duration(ms: number, lang = "en"): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const two = (n: number) => String(n).padStart(2, "0");
	if (h >= 48) {
		const unit = (value: number, u: "day" | "hour") =>
			new Intl.NumberFormat(lang, { style: "unit", unit: u, unitDisplay: "narrow" }).format(value);
		return `${unit(Math.floor(h / 24), "day")} ${unit(h % 24, "hour")}`;
	}
	return h > 0 ? `${h}h ${two(m)}m` : `${m}m ${two(s % 60)}s`;
}

/**
 * The time since the first event. It ticks while the run lives, in this component only, so the page
 * does not render each second. An ended run shows `end` (the last event of its sessions), or no time
 * when that is unknown: the loaded events are the first page only, so they cannot give the end.
 */
function Elapsed({ start, end, live }: { start?: number; end?: number; live: boolean }) {
	const { lang } = useI18n();
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!live) return;
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [live]);
	const to = live ? now : end;
	if (start == null || to == null) return null;
	return <time>{duration(to - start, lang)}</time>;
}

export { endOf };

/** The address of a ticket, only when it is a web address: any other scheme gives undefined. */
export function webUrl(raw: string): string | undefined {
	try {
		const u = new URL(raw);
		return u.protocol === "http:" || u.protocol === "https:" ? u.href : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Keep the sticky header clear of a focused element: set `scroll-padding-top` of the scroll
 * container above it to the height of the header.
 */
export function useScrollClear(head: RefObject<HTMLElement | null>) {
	useEffect(() => {
		const el = head.current;
		let box = el?.parentElement ?? null;
		while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
		if (!(el && box)) return;
		const scroller = box;
		const set = () => {
			scroller.style.scrollPaddingTop = `${el.offsetHeight}px`;
		};
		set();
		const watch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(set);
		watch?.observe(el);
		return () => {
			watch?.disconnect();
			scroller.style.scrollPaddingTop = "";
		};
	}, [head]);
}

/** The title of the open run takes the focus: an action removed its own control. */
export function focusRunTitle() {
	document.querySelector<HTMLElement>("[data-run-title]")?.focus();
}

/**
 * After a card action opens the run page: focus the first match of `selector` once the page has
 * it (up to 2 s), else the title. The card button is gone by then, so the focus would fall to the body.
 */
export function focusOnRunPage(selector: string, tries = 20) {
	const el = document.querySelector<HTMLElement>(selector);
	if (el) el.focus();
	else if (tries > 0) setTimeout(() => focusOnRunPage(selector, tries - 1), 100);
	else focusRunTitle();
}

const usd = (x: number) => `$${x.toFixed(2)}`;

/** One fact of line 2: an icon with its value. The group has the accessible name. */
function Fact({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
	return (
		<fieldset
			aria-label={label}
			className="m-0 flex min-w-0 items-center gap-1.5 border-0 p-0 text-12 text-n-12"
		>
			<span aria-hidden="true" className="flex text-n-10">
				{icon}
			</span>
			{children}
		</fieldset>
	);
}

/**
 * The top of the run page, and it stays in view (REQ-029): the ticket and the state, the facts of
 * the run, the one action of the state and a menu with Stop (the page has Copy ref).
 */
export function RunSummary({
	run,
	events,
	live,
	primary,
	onStop,
	onOpenPr,
}: {
	run: RunView_Serialize;
	events: RunLogEvent_Serialize[];
	live: boolean;
	primary: ReactNode;
	/** Absent when the run has ended: nothing to stop. */
	onStop?: () => void;
	onOpenPr: (reference: string) => void;
}) {
	const { t } = useI18n();
	const f = t.factory;
	const { gate } = useRights();
	const [stopping, setStopping] = useState(false);
	const head = useRef<HTMLElement>(null);
	useScrollClear(head);
	const sessions = useSessions().data;
	const status = RUN_STATUS[run.state];
	const step = stepperOf(run);
	const units = run.steps
		.flatMap((s) => s.units.map((u) => ({ unit: u, step: s.id })))
		.filter((x) => x.unit.runner !== "");
	const session = units.findLast((x) => x.unit.state === "running") ?? units.at(-1);
	// The model of the session that ran, not the one that the workflow asks for.
	const model =
		session && sessions?.find((x) => x.run === run.id && x.step === session.unit.id)?.model;
	const ticket = webUrl(run.url);
	const pr = run.pr;
	const ci = pr && (CI_STATUS[pr.ci] ?? "idle");
	const review = pr && (REVIEW_STATUS[pr.review] ?? "idle");
	return (
		<header
			ref={head}
			className="sticky top-0 z-10 flex flex-col gap-2 rounded-lg border bg-surface-1 p-3 shadow-1"
		>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
				<h1
					tabIndex={-1}
					data-run-title
					className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-16 font-semibold text-n-12 focus-visible:shadow-glow focus-visible:outline-none"
				>
					{ticket ? (
						<a
							href={ticket}
							// Click, middle click and modifier click all open it in the browser of the person.
							onClick={(e) => {
								e.preventDefault();
								openUrl(ticket);
							}}
							onAuxClick={(e) => {
								e.preventDefault();
								openUrl(ticket);
							}}
							className="shrink-0 rounded-sm font-mono text-12 font-normal text-accent-text hover:underline focus-visible:shadow-glow"
						>
							{run.key}
						</a>
					) : (
						<span className="shrink-0 font-mono text-12 font-normal text-n-11">{run.key}</span>
					)}
					<span className="min-w-0 truncate">{run.title}</span>
				</h1>
				<Badge variant={STATUS_BADGE[status]}>
					<StatusDot status={status} label={f.state[run.state]} className="size-2" />
					{f.state[run.state]}
				</Badge>
				<div className="flex items-center gap-2">
					{primary}
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
							{format(f.machine.confirmStop, { name: run.key })}
						</Button>
					) : onStop ? (
						<MenuButton
							iconOnly
							label={f.moreActions}
							icon={<ChevronDownIcon size={14} />}
							items={[
								{
									id: "stop",
									label: f.kill,
									danger: true,
									...gate("runs.start"),
									onSelect: () => setStopping(true),
								},
							]}
						/>
					) : null}
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-x-4 gap-y-1">
				<Fact
					label={format(f.stepOf, { n: step.n, total: step.total })}
					icon={<QueueListIcon size={14} />}
				>
					<span>{format(f.nOf, { n: step.n, total: step.total })}</span>
					<Progress value={step.n} max={step.total} label={f.steps} className="w-16 min-w-0" />
					{step.name ? <span>{step.name}</span> : null}
				</Fact>
				<Fact label={f.cost} icon={<CurrencyIcon size={14} />}>
					<span>
						{run.costUsd === null ? "-" : usd(run.costUsd)}
						{run.budgetUsd === null ? "" : ` / ${usd(run.budgetUsd)}`}
					</span>
					{run.budgetUsd === null ? null : (
						<span className="w-16">
							<SpendMeter
								usd={run.costUsd ?? 0}
								budget={run.budgetUsd}
								label={`${f.cost} ${run.key}`}
							/>
						</span>
					)}
				</Fact>
				<Fact label={f.elapsed} icon={<ClockIcon size={14} />}>
					<Elapsed start={events[0]?.ts ?? undefined} end={endOf(run)} live={live} />
				</Fact>
				{session ? (
					<Fact
						label={f.runner}
						icon={
							<BrandIcon
								name={session.unit.runner}
								size={14}
								label={runnerName(session.unit.runner)}
							/>
						}
					>
						<span>{runnerName(session.unit.runner)}</span>
						{model ? <span className="text-n-11">{model}</span> : null}
					</Fact>
				) : null}
				{pr && ci && review ? (
					<Fact
						label={format(f.pullRequest, { n: pr.number })}
						icon={<ArrowsRightLeftIcon size={14} />}
					>
						<a
							href="/code/pull-requests"
							onClick={(e) => {
								e.preventDefault();
								onOpenPr(pr.reference);
							}}
							className="rounded-sm font-mono text-accent-text hover:underline focus-visible:shadow-glow"
						>
							#{pr.number}
						</a>
						<Badge variant={STATUS_BADGE[ci]}>
							<StatusDot status={ci} label={t.forge.ci[pr.ci as "none"]} className="size-2" />
							{t.forge.ci[pr.ci as "none"]}
						</Badge>
						<Badge variant={STATUS_BADGE[review]}>
							<StatusDot
								status={review}
								label={t.forge.review[pr.review as "clear"]}
								className="size-2"
							/>
							{t.forge.review[pr.review as "clear"]}
						</Badge>
					</Fact>
				) : null}
			</div>
		</header>
	);
}
