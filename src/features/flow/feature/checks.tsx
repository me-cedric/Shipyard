import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { usePullState } from "@/features/code/pull-page";
import { CI_STATUS } from "@/features/code/status";
import { useRunScope } from "@/features/factory/runs/run-detail";
import { agentOf, webUrl } from "@/features/factory/runs/run-summary";
import { hiddenTab } from "@/features/shell/spaces";
import { useForgeActions, useQuality } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { openUrl } from "@/lib/menus";
import { RightButton, useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { useBdd, useChanges } from "@/lib/specs";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { LinkButton } from "@/ui/atoms/link-button";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ChevronRightIcon } from "@/ui/icons";
import { ATTENTION_FRAME } from "@/ui/molecules/attention-card";
import { Card } from "@/ui/molecules/card";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { StartAgent } from "./start";
import type { Parts } from "./use-feature";

type State = "passing" | "failing" | "pending" | "skipped";
type Check = { name: string; state: State; line?: string; url?: string; health?: boolean };

const LABEL = "px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-11";
const ROW = "flex min-h-15 items-center gap-3 px-6 font-semibold";
const MARK = { passing: "pass", failing: "fail", pending: "active", skipped: "open" } as const;
const firstLine = (s: string) =>
	s
		.split("\n")
		.find((l) => l.trim())
		?.trim() ?? "";

/** The mark of a row: a ring (open), a circle with a tick (pass), a triangle (fail), the open step (active) or a tick. */
export function Mark({
	kind,
	label,
	small,
}: {
	kind: "pass" | "fail" | "open" | "active" | "tick";
	label: string;
	/** The Recipe card draws smaller marks. */
	small?: boolean;
}) {
	const tone = {
		pass: "text-success",
		fail: "text-warning-text",
		open: "text-n-9",
		active: "text-accent",
		tick: "text-n-12",
	}[kind];
	return (
		<svg
			role="img"
			aria-label={label}
			viewBox="0 0 16 16"
			className={`${small ? "size-3.5" : "size-4.5"} shrink-0 ${tone}`}
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<title>{label}</title>
			{kind === "fail" ? (
				<path d="M8 2 14.5 13.5h-13ZM8 6.5v3.2M8 11.6v.1" />
			) : kind === "tick" ? (
				<path d="m3 8.5 3.2 3.2L13 4.5" />
			) : (
				<>
					<circle cx="8" cy="8" r={kind === "active" ? 4.5 : 6.25} />
					{kind === "pass" ? <path d="m5.2 8.2 2 2 3.6-3.9" /> : null}
				</>
			)}
		</svg>
	);
}

/** The pill of a check: Pass, Fail, Running or Skipped. */
function Pill({ state }: { state: State }) {
	const c = useI18n().t.flow.look.checks;
	const word = { passing: c.pass, failing: c.failed, pending: c.running, skipped: c.skipped }[
		state
	];
	const tone = {
		passing: "success",
		failing: "you",
		pending: "accent",
		skipped: "neutral",
	} as const;
	return <Badge variant={tone[state]}>{word}</Badge>;
}

/** A row of a card that leads to another page. */
function Go({
	children,
	onClick,
	end,
}: {
	children: ReactNode;
	onClick: () => void;
	end: ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`${ROW} w-full justify-between text-left text-n-12 hover:bg-n-2`}
		>
			{children}
			{end}
		</button>
	);
}

/** The checks of the pull request, else the checks that the project declares and has run. */
function useChecks(parts: Parts): Check[] {
	const { t } = useI18n();
	const pull = usePullState()?.d;
	const quality = useQuality().data;
	if (parts.pr)
		return (pull?.checks ?? []).map((c) => ({
			name: c.name,
			state: c.state as State,
			url: webUrl(c.url) || undefined,
		}));
	const named = t.forge.quality.named as Record<string, string>;
	return (quality?.checks ?? []).flatMap((r) =>
		r.last
			? [
					{
						name: (r.label && named[r.label]) || r.name,
						state: r.last.passed ? ("passing" as const) : ("failing" as const),
						line: r.last.passed ? undefined : firstLine(r.last.tail),
						health: true,
					},
				]
			: [],
	);
}

/** The scenarios of the test plan that cite the specs of the change, with the verdict of each. */
function useScenarios(parts: Parts) {
	const change = useChanges().data?.find((c) => `change:${c.id}` === parts.change);
	const bdd = useBdd().data ?? [];
	const caps = (change?.artifacts ?? []).flatMap((a) => (a.capability ? [a.capability] : []));
	return change
		? bdd.filter((r) => r.refs.some((ref) => caps.some((c) => ref.startsWith(`spec:${c}#`))))
		: null;
}

/** The docs that this change makes stale: the warnings of the docs chain that nobody acknowledged. */
function useStale() {
	const watch = useQuery({
		queryKey: ["code", "chain-watch", "pages"],
		queryFn: () => unwrap(commands.codeChainWatch(null)),
		retry: false,
		staleTime: 30_000,
	});
	return (watch.data?.warnings ?? []).filter((w) => !w.ack).length;
}

/**
 * Checks (`spec:app-redesign#REQ-023`, picture 022): the count of failing checks with its actions, the
 * checks, the test plan and the quality gates of the change. The recipe steps are on Chat.
 */
export function Checks({ parts, ci }: { parts: Parts; ci?: string | null }) {
	const { t } = useI18n();
	const c = t.flow.look.checks;
	const navigate = useNavigate();
	const { ask } = useShell();
	const scope = useRunScope();
	const checks = useChecks(parts);
	const scenarios = useScenarios(parts);
	const stale = useStale();
	const quality = useQuality().data;
	const pull = usePullState()?.d;
	const { rerun } = useForgeActions();
	const [again, setAgain] = useState<{ busy: boolean; error: unknown }>({
		busy: false,
		error: null,
	});
	// The impacts keep the gate of the code area, as their page `/flow/impacts` does.
	const noCode = hiddenTab(useRights().level, "code", "impacts");
	const failing = checks.filter((x) => x.state === "failing");
	const pending = checks.filter((x) => x.state === "pending").length;
	const scans = (quality?.scanners ?? []).flatMap((s) => (s.last ? [s.last.passed] : []));
	const featureId = encodeURIComponent(parts.change ?? parts.pr ?? parts.run ?? parts.ticket ?? "");
	const title = failing.length
		? checks.length === 1
			? c.failSolo
			: format(failing.length === 1 ? c.failOne : c.fail, {
					failing: failing.length,
					total: checks.length,
				})
		: pending
			? pending === 1
				? c.pendingOne
				: format(c.pending, { count: pending })
			: checks.length
				? checks.length === 1
					? c.passOne
					: format(c.allPass, { total: checks.length })
				: c.none;
	const gates = (
		<Card className="py-2">
			<h2 className={LABEL}>{c.gates}</h2>
			<div className="flex flex-col divide-y divide-n-4">
				<Go
					onClick={() => void navigate({ to: "/flow/health" })}
					end={
						scans.length ? (
							<Pill state={scans.every(Boolean) ? "passing" : "failing"} />
						) : (
							<Badge>{c.neverRun}</Badge>
						)
					}
				>
					{c.scanners}
				</Go>
				<Go
					onClick={() => void navigate({ to: "/flow/health" })}
					end={<Badge variant={stale ? "warning" : "neutral"}>{stale ? stale : c.noStale}</Badge>}
				>
					{c.stale}
				</Go>
				<button
					type="button"
					className={`${ROW} w-full justify-between text-left text-n-12 hover:bg-n-2 disabled:text-n-11 disabled:hover:bg-surface-2`}
					disabled={noCode}
					title={noCode ? t.rights.noAccess : undefined}
					aria-description={noCode ? t.rights.noAccess : undefined}
					onClick={() =>
						void navigate({ to: `/flow/feature/${featureId}/impacts` as "/flow/health" })
					}
				>
					{t.flow.feature.impacts}
					<ChevronRightIcon size={14} />
				</button>
			</div>
		</Card>
	);
	if (!scope && !parts.pr)
		return (
			<div className="flex flex-col gap-6">
				<EmptyState title={t.flow.feature.noRun} extra={<StartAgent parts={parts} />} />
				{gates}
			</div>
		);
	return (
		<div className="flex flex-col gap-6">
			<section
				aria-label={title}
				className={`flex flex-wrap items-center gap-4 rounded-lg bg-surface-2 px-6 py-5 shadow-2 ${failing.length ? ATTENTION_FRAME : ""}`}
			>
				<h2 className="mr-auto flex items-center gap-3 text-20 font-semibold text-n-12">
					{failing.length ? (
						<Avatar agent name={scope ? agentOf(scope.run, t.factory.agentNames) : c.builder} />
					) : null}
					{title}
				</h2>
				{/* The state that the card of Flow names. A failing count says it already. */}
				{ci && ci !== "none" && !failing.length ? (
					<p className="flex items-center gap-2 text-ui text-n-12">
						<StatusDot status={CI_STATUS[ci] ?? "idle"} label={t.forge.ci[ci as "none"]} />
						{t.forge.ci[ci as "none"]}
					</p>
				) : null}
				{failing.length && parts.pr && pull ? (
					<RightButton
						right="code.write"
						busy={again.busy}
						onClick={() => {
							setAgain({ busy: true, error: null });
							rerun(pull.number).then(
								() => setAgain({ busy: false, error: null }),
								(error) => setAgain({ busy: false, error }),
							);
						}}
					>
						{t.codeHost.rerun}
					</RightButton>
				) : null}
				{failing.length ? (
					<Button
						variant="primary"
						onClick={() =>
							ask(format(c.fixAsk, { failing: failing.map((x) => x.name).join(", ") }))
						}
					>
						{c.fix}
					</Button>
				) : null}
			</section>
			{again.error ? <ErrorNotice error={again.error} className="px-3 py-2" /> : null}
			<div className="flex flex-wrap items-start gap-6">
				<div className="flex min-w-0 flex-[1_1_380px] flex-col gap-6">
					{checks.length ? (
						<Card className="py-2">
							<h2 className={LABEL}>{parts.pr ? c.host : c.project}</h2>
							<ul className="flex flex-col divide-y divide-n-4">
								{checks.map((x) => (
									<li
										key={x.name}
										className={`flex flex-col gap-2 ${x.state === "failing" ? "pb-3" : ""}`}
									>
										<div className={ROW}>
											<Mark kind={MARK[x.state]} label={t.forge.check[x.state]} />
											<span className="min-w-0 truncate">{x.name}</span>
											<span className="ml-auto">
												<Pill state={x.state} />
											</span>
										</div>
										{/* The row is 60 px high: pull the log link up under the name. */}
										{x.state === "failing" ? (
											<div className="-mt-3 flex flex-col gap-1 px-6">
												{x.line ? (
													<p className="truncate rounded-xl bg-n-3 px-4 py-3 font-mono text-13 text-n-12">
														{x.line}
													</p>
												) : null}
												{x.url || x.health ? (
													<LinkButton
														onClick={() =>
															x.url ? openUrl(x.url) : void navigate({ to: "/flow/health" })
														}
													>
														{c.fullLog}
													</LinkButton>
												) : null}
											</div>
										) : null}
									</li>
								))}
							</ul>
						</Card>
					) : null}
				</div>
				<div className="flex min-w-0 flex-[1_1_380px] flex-col gap-6">
					<Card className="py-2">
						<h2 className={LABEL}>{c.plan}</h2>
						<ul className="flex flex-col divide-y divide-n-4">
							{(scenarios ?? []).map((s) => (
								<li key={`${s.plan}:${s.line}`} className={ROW}>
									<Mark
										kind={s.verdict === "pass" ? "pass" : s.verdict === "fail" ? "fail" : "open"}
										label={
											s.verdict === "pass" ? c.pass : s.verdict === "fail" ? c.failed : c.noTest
										}
									/>
									<span className="min-w-0 truncate">{s.scenario}</span>
									<span className="ml-auto">
										{s.verdict === "pass" || s.verdict === "fail" ? (
											<Pill state={s.verdict === "pass" ? "passing" : "failing"} />
										) : (
											<Badge>{c.noTest}</Badge>
										)}
									</span>
								</li>
							))}
						</ul>
						{scenarios?.length ? null : <p className={`${ROW} text-n-11`}>{c.noScenario}</p>}
						<div className="px-6">
							<LinkButton onClick={() => void navigate({ to: "/library/test-plans" })}>
								{c.openPlan}
							</LinkButton>
						</div>
					</Card>
					{gates}
				</div>
			</div>
		</div>
	);
}
