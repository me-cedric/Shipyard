import type { ColumnDef } from "@tanstack/react-table";
import { flushSync } from "react-dom";
import { AgentsToggle } from "@/features/factory/agents-toggle";
import { SectionCard } from "@/features/factory/section-card";
import { MachineUsage } from "@/features/factory/usage/machine-usage";
import { RequestTree } from "@/features/factory/usage/request-tree";
import { NoProject } from "@/features/shell/no-project";
import { tabIcon } from "@/features/shell/spaces";
import { useRuns, useUsage } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { useActiveProject } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { useViewState } from "@/lib/shell/view-state";
import { CountUp } from "@/ui/atoms/count-up";
import { Switch } from "@/ui/atoms/switch";
import { CheckIcon, CurrencyIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Loading } from "@/ui/molecules/loading";
import { PageHeader } from "@/ui/molecules/page-header";
import { SpendMeter, spendStatus } from "@/ui/molecules/spend-meter";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { DataTable } from "@/ui/organisms/data-table";
import { Budgets, useBudgets } from "./budgets";

type Kind = "run" | "day" | "member";
type Row = {
	id: string;
	kind: Kind;
	key: string;
	name: string;
	tokens: number;
	usd: number;
	budget: number | null;
	/** The model requests of a run. */
	iterations: number | null;
	/** The title of the ticket of a run. */
	title?: string;
};

const WON = ["Merged", "Done"];
const ENDED = [...WON, "Failed", "Cancelled"];

/**
 * Crew / Spend (`spec:app-redesign#REQ-016`): spend against budget per run, day and member, with
 * the budgets of the project and of this computer. The one action sets a budget (factory REQ-032).
 */
export function Spend() {
	const { t, lang } = useI18n();
	const f = t.factory;
	const active = useActiveProject().data;
	const usage = useUsage();
	const b = useBudgets();
	const { openRef } = useShell();
	const titles = new Map((useRuns().data ?? []).map((r) => [r.id, r]));
	const [prices, setPrices] = useViewState("usage-prices", true);
	const x = t.extras.usage;
	const Icon = tabIcon("crew", "spend");
	const icon = Icon && <Icon size={16} />;
	if (active === undefined) return <Loading title={t.ui.place.crew} icon={icon} />;
	if (active === null) return <NoProject title={t.ui.place.crew} icon={icon} />;
	const u = usage.data;
	const rows: Row[] = [
		...(u?.runs ?? []).map((r) => ({
			id: `run:${r.run}`,
			kind: "run" as const,
			key: r.key,
			name: r.key,
			tokens: r.tokens,
			usd: r.usd ?? 0,
			budget: r.budget,
			iterations: r.iterations,
			title: titles.get(r.run)?.title,
		})),
		...(u?.days ?? []).map((d) => ({
			id: `day:${d.key}`,
			kind: "day" as const,
			key: d.key,
			name: d.key,
			tokens: d.tokens,
			usd: d.usd ?? 0,
			budget: d.budget,
			iterations: null,
		})),
		...(u?.members ?? []).map((m) => ({
			id: `member:${m.key}`,
			kind: "member" as const,
			key: m.key,
			name: m.key || f.noAssignee,
			tokens: m.tokens,
			usd: m.usd ?? 0,
			budget: m.budget,
			iterations: null,
		})),
	];
	// A price shows after a click: a shared screen keeps the amounts private.
	const price = (text: string) =>
		prices ? (
			text
		) : (
			<span>
				<span aria-hidden="true">•••</span>
				<span className="sr-only">{x.hidden}</span>
			</span>
		);
	const columns: ColumnDef<Row>[] = [
		{
			id: "name",
			header: f.usage,
			cell: (c) =>
				c.row.original.title === undefined ? (
					c.row.original.name
				) : (
					<span className="flex min-w-0 items-center gap-2">
						<span className="shrink-0 font-mono text-12 text-n-11">{c.row.original.name}</span>
						<span className="truncate">{c.row.original.title}</span>
					</span>
				),
		},
		{
			id: "tokens",
			header: f.tokens,
			meta: { width: "7rem", numeric: true },
			cell: (c) => <CountUp value={c.row.original.tokens} />,
		},
		{
			id: "iterations",
			header: x.iterations,
			meta: { width: "6rem", numeric: true },
			cell: (c) => c.row.original.iterations ?? "-",
		},
		{
			id: "spend",
			header: f.spend,
			meta: { width: "6rem", numeric: true },
			cell: (c) => price(`$${c.row.original.usd.toFixed(2)}`),
		},
		{
			id: "budget",
			header: f.budget,
			meta: { width: "6rem", numeric: true },
			cell: (c) =>
				c.row.original.budget === null ? "-" : price(`$${c.row.original.budget.toFixed(2)}`),
		},
		{
			id: "meter",
			header: "",
			meta: { width: "9rem" },
			cell: (c) => (
				<SpendMeter
					usd={c.row.original.usd}
					budget={c.row.original.budget}
					label={`${f.spend} ${c.row.original.name}`}
				/>
			),
		},
	];
	const label: Record<string, string> = { run: f.perRun, day: f.perDay, member: f.perMember };
	const money = new Intl.NumberFormat(lang, { style: "currency", currency: "USD" });
	// Newest day first, keyed by the UTC day.
	const days = u?.days ?? [];
	const today = new Date().toISOString().slice(0, 10);
	const runs = rows.filter((r) => r.kind === "run");
	const ended = [...titles.values()].filter((r) => ENDED.includes(r.state));
	const won = ended.filter((r) => WON.includes(r.state)).length;
	// The spend so far at the end of each day, oldest first.
	let sum = 0;
	const cumulative = days
		.slice()
		.reverse()
		.map((d) => {
			sum += d.usd ?? 0;
			return sum;
		});
	const budgetPanel = <Budgets budgets={b} price={price} />;
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				icon={icon}
				title={t.ui.place.crew}
				chips={<AgentsToggle />}
				action={<Switch label={x.showPrices} checked={prices} onCheckedChange={setPrices} />}
			/>
			{b.error ? (
				<p role="alert" className="px-4 pb-2 text-ui text-danger-text">
					{b.error}
				</p>
			) : null}
			{rows.length === 0 && !usage.isPending ? (
				<div className="flex flex-col gap-3 overflow-y-auto px-4 pt-2 pb-4 [&>*]:shrink-0">
					<EmptyState
						// No budget, or budgets and no usage yet.
						title={b.list.length === 0 ? t.empty.budget : t.empty.usage}
						action={{
							label: f.setBudget,
							// The form must be on the page before the field takes the focus.
							onClick: () => {
								flushSync(() => b.setEditing(true));
								b.field.current?.focus();
							},
						}}
					/>
					{budgetPanel}
					<MachineUsage prices={prices} />
				</div>
			) : (
				// The spend on the left, the budgets and this computer on the right (picture 013).
				<div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-4 pt-2 pb-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
					<div className="flex min-w-0 flex-col gap-3">
						{usage.isPending ? (
							<Loading rows={3} />
						) : (
							<>
								<StatStrip
									items={[
										{
											label: prices ? t.ui.spendToday : x.tokensToday,
											value: prices ? (
												<CountUp
													value={days.find((d) => d.key === today)?.usd ?? 0}
													format={money.format}
												/>
											) : (
												<CountUp value={days.find((d) => d.key === today)?.tokens ?? 0} />
											),
											icon: <CurrencyIcon size={12} />,
											tone: "info",
											trend: days
												.slice(0, 14)
												.reverse()
												.map((d) => d.usd ?? 0),
										},
										{
											label: prices ? f.spend : x.runs,
											value: prices ? (
												<CountUp
													value={runs.reduce((a, r) => a + r.usd, 0)}
													format={money.format}
												/>
											) : (
												<CountUp value={runs.length} />
											),
											tone: "accent",
											trend: cumulative,
										},
										{
											label: f.tokens,
											value: <CountUp value={runs.reduce((a, r) => a + r.tokens, 0)} />,
											tone: "accent",
										},
										{
											label: f.successRate,
											value: ended.length ? `${Math.round((won / ended.length) * 100)} %` : "-",
											icon: <CheckIcon size={12} />,
											tone: "success",
											delta: `${won}/${ended.length}`,
										},
										{
											label: f.overBudget,
											value: String(
												runs.filter((r) => spendStatus(r.usd, r.budget) === "danger").length,
											),
											tone: "danger",
										},
									]}
								/>
								<SectionCard
									title={f.usage}
									count={rows.length}
									flush
									// The table is a virtual list: it needs a height of its own.
									className="h-96"
									bodyClassName="min-h-0 flex-1"
								>
									<DataTable
										label={f.usage}
										columns={columns}
										data={rows}
										rowId={(r) => r.id}
										group={(r) => r.kind}
										groupLabel={(g) => label[g] ?? g}
										onOpen={(r) => {
											if (r.kind === "run") return openRef(r.id);
											b.edit(r.kind, r.key);
										}}
									/>
								</SectionCard>
								<RequestTree runs={u?.runs ?? []} />
							</>
						)}
					</div>
					<div className="flex min-w-0 flex-col gap-3">
						{budgetPanel}
						<MachineUsage prices={prices} />
					</div>
				</div>
			)}
		</div>
	);
}
