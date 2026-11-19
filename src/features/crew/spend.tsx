import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { nameOf } from "@/features/factory/runs/run-live";
import { DEFAULT_BUDGET, doStop, stopAction } from "@/features/flow/stop-action";
import { NoProject } from "@/features/shell/no-project";
import { useGuard } from "@/features/work/guard";
import { useFactoryWrites, useRunActions, useRuns, useUsage, useWorkflow } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import type { RunView } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { useRights } from "@/lib/rights";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/ui/atoms/button";
import { AttentionCard } from "@/ui/molecules/attention-card";
import { Card } from "@/ui/molecules/card";
import { ConfirmButton } from "@/ui/molecules/confirm-button";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Loading } from "@/ui/molecules/loading";
import { PageHeader } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";
import { BudgetsPage, useBudgets } from "./budgets";
import { WARN_AT } from "./spend-const";
import { SpendHow } from "./spend-how";
import { LinkRow, RowsCard, toSpend, usePrices } from "./spend-parts";
import { SpendUsage } from "./spend-usage-page";

/** The features that the main card lists before "<n> more". */
const SHOWN = 6;

/**
 * Crew / Spend (`spec:app-redesign#REQ-016`, picture 013): the spend of each feature against its
 * limit. `page=how` (picture 078) and `page=budgets` (picture 083) are pages of this section.
 */
export function Spend() {
	const { t } = useI18n();
	const search = useSearch({ strict: false }) as { page?: unknown; run?: unknown };
	const active = useActiveProject().data;
	if (active === undefined) return <Loading title={t.ui.place.crew} />;
	if (active === null) return <NoProject title={t.ui.place.crew} icon={null} />;
	if (search.page === "how")
		return <SpendHow run={typeof search.run === "string" ? search.run : null} />;
	if (search.page === "budgets") return <BudgetsPage />;
	if (search.page === "usage") return <SpendUsage />;
	return <SpendMain />;
}

/** The agent that stopped: the role of the newest step that started. */
function Alert({ run }: { run: RunView }) {
	const { t } = useI18n();
	const s = t.factory.spendPage;
	const act = useRunActions();
	const { gate } = useRights();
	const { error, run: guard } = useGuard();
	const flow = useWorkflow(run.workflow).data;
	const step = [...run.steps].reverse().find((x) => x.state !== "pending");
	const role = flow?.steps.find((x) => x.id === step?.id)?.role;
	const to = (run.budgetUsd ?? 0) + DEFAULT_BUDGET;
	return (
		<AttentionCard
			who={format(s.stopped, { agent: role ? nameOf(role) : t.factory.agent })}
			title={format(s.reached, { feature: run.title })}
		>
			<div className="flex flex-wrap gap-2.5">
				<ConfirmButton
					className="min-h-control flex-1"
					{...gate("runs.start")}
					confirm={format(s.confirmStop, { feature: run.title })}
					onConfirm={() => void guard(() => act.cancel(run.id))}
				>
					{s.stopHere}
				</ConfirmButton>
				<Button
					variant="primary"
					className="min-h-control flex-1"
					{...gate("runs.start")}
					onClick={() => void guard(() => doStop(act, run, "addBudget", { usd: DEFAULT_BUDGET }))}
				>
					{format(s.raiseTo, { amount: `$${to.toFixed(2)}` })}
				</Button>
			</div>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</AttentionCard>
	);
}

/** "Stop all agents": each running agent stops, the agents stay on (`spec:app-redesign#REQ-016`). */
function StopAll() {
	const { t } = useI18n();
	const s = t.factory.spendPage;
	const writes = useFactoryWrites();
	const { gate } = useRights();
	const { error, run } = useGuard();
	return (
		<>
			<ConfirmButton
				className="min-h-control text-danger-text"
				{...gate("runs.start")}
				confirm={s.confirmStopAll}
				onConfirm={() => void run(() => writes.stopAll())}
			>
				{s.stopAll}
			</ConfirmButton>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</>
	);
}

function SpendMain() {
	const { t } = useI18n();
	const s = t.factory.spendPage;
	const navigate = useNavigate();
	const usage = useUsage();
	const runs = useRuns().data ?? [];
	const b = useBudgets();
	const { prices, price, menu } = usePrices();
	const titles = new Map(runs.map((r) => [r.id, r.title]));
	const rows = (usage.data?.runs ?? [])
		.map((r) => ({ id: r.run, name: titles.get(r.run) ?? r.key, usd: r.usd ?? 0 }))
		.sort((a, c) => c.usd - a.usd);
	const total = rows.reduce((n, r) => n + r.usd, 0);
	const limits = (usage.data?.runs ?? []).flatMap((r) => (r.budget === null ? [] : [r.budget]));
	const limit = limits.length ? Math.max(...limits) : null;
	// The bars share one scale, with room past the limit tick.
	const scale = Math.max((limit ?? 0) * 1.2, ...rows.map((r) => r.usd), 0.01);
	const money = (n: number) => `$${n.toFixed(2)}`;
	const stopped = runs.filter((r) => stopAction(r) === "addBudget");
	const empty = rows.length === 0 && !usage.isPending;
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageHeader title={t.ui.place.crew} menu={menu} />
			{empty ? (
				<div className="px-4 pb-4">
					<EmptyState
						// No budget, or budgets and no usage yet.
						title={b.list.length === 0 ? t.empty.budget : t.empty.usage}
						action={{
							label: t.factory.setBudget,
							onClick: () => void navigate(toSpend("budgets")),
						}}
					/>
				</div>
			) : (
				<div className="flex flex-wrap items-start gap-5 px-4 pb-4">
					<Card pad className="flex flex-[3_1_32rem] flex-col gap-1.5">
						{usage.isPending ? (
							<Loading rows={3} />
						) : (
							<>
								<div className="flex flex-wrap items-baseline gap-3 pb-3.5">
									<span className="text-[56px] leading-none font-semibold tracking-tight text-n-12">
										{price(money(total))}
									</span>
									<span className="text-n-11">
										{format(rows.length === 1 ? s.onOne : s.on, { count: rows.length })}
									</span>
									{limit === null ? null : (
										<span className="ml-auto inline-flex items-center gap-2 text-n-12">
											<span aria-hidden="true" className="h-4.5 w-0.5 bg-n-12" />
											{s.limit} {price(money(limit))}
										</span>
									)}
								</div>
								<ul aria-label={t.factory.spend} className="flex flex-col">
									{rows.slice(0, SHOWN).map((r) => {
										const over = limit !== null && r.usd > limit;
										return (
											<li key={r.id} className="flex min-h-control items-center gap-4">
												<span className="w-56 shrink-0 truncate font-medium">{r.name}</span>
												<div
													role="img"
													aria-label={
														(prices ? money(r.usd) : t.extras.usage.hidden) +
														(over ? `, ${s.over}` : "")
													}
													className="relative h-3.5 min-w-0 flex-1 rounded-full bg-n-4"
												>
													<div
														style={{ width: `${(r.usd / scale) * 100}%` }}
														className={cn(
															"h-full rounded-full",
															over ? "bg-attention-strong" : "bg-accent",
														)}
													/>
													{limit === null ? null : (
														<i
															style={{ left: `${(limit / scale) * 100}%` }}
															className="absolute -top-1.5 h-6.5 w-0.5 bg-n-12"
														/>
													)}
												</div>
												<span className="w-14 shrink-0 text-right font-semibold">
													{price(money(r.usd))}
												</span>
											</li>
										);
									})}
									{rows.length > SHOWN ? (
										<li>
											<Link
												{...toSpend("usage")}
												className="flex min-h-control items-center font-semibold text-accent-text hover:underline"
											>
												{format(s.moreRows, { count: rows.length - SHOWN })}
											</Link>
										</li>
									) : null}
								</ul>
							</>
						)}
					</Card>
					<div className="flex flex-[2_1_19rem] flex-col gap-5">
						{stopped.map((r) => (
							<Alert key={r.id} run={r} />
						))}
						<RowsCard title={s.limits}>
							{limit === null ? null : (
								<Row>
									<span className="flex-1 font-semibold">{s.eachFeature}</span>
									<span>{price(money(limit))}</span>
									{/* The limit of a feature comes from its recipe: Edit opens the recipes. */}
									<Link
										to="/crew/recipes"
										aria-label={format(s.editLimit, { name: s.eachFeature.toLowerCase() })}
										className={buttonVariants()}
									>
										{t.factory.edit}
									</Link>
								</Row>
							)}
							<Row>
								<span className="flex-1 font-semibold">{s.warnAt}</span>
								<span>{WARN_AT}</span>
							</Row>
							<LinkRow label={s.allBudgets} page="budgets" />
						</RowsCard>
						<RowsCard title={s.more}>
							<LinkRow label={t.factory.successRate} page="how" />
							<LinkRow label={s.requests} page="how" />
							<LinkRow label={s.machine} page="how" />
						</RowsCard>
						<StopAll />
					</div>
				</div>
			)}
		</div>
	);
}
