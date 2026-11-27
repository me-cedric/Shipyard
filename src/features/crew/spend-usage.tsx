import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { SectionCard } from "@/features/factory/section-card";
import { useRuns, useUsage } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { useShell } from "@/lib/shell";
import { CountUp } from "@/ui/atoms/count-up";
import { Loading } from "@/ui/molecules/loading";
import { SpendMeter, spendStatus } from "@/ui/molecules/spend-meter";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { DataTable } from "@/ui/organisms/data-table";
import { percent } from "./spend-const";

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

/** The rate of the runs that ended well, with the counts. */
export function useSuccess() {
	const ended = (useRuns().data ?? []).filter((r) => ENDED.includes(r.state));
	const won = ended.filter((r) => WON.includes(r.state)).length;
	return { ended, won, wonState: (state: string) => WON.includes(state) };
}

/**
 * The five tiles and the usage by run, day and member (spend and budget against each other). A run
 * opens its page; a day or a member opens Budgets.
 */
export function UsageCard({
	prices,
	price,
	onBudget,
}: {
	prices: boolean;
	price: (text: string) => ReactNode;
	onBudget: () => void;
}) {
	const { t, lang } = useI18n();
	const f = t.factory;
	const x = t.extras.usage;
	const usage = useUsage();
	const { openRef } = useShell();
	const titles = new Map((useRuns().data ?? []).map((r) => [r.id, r]));
	const { ended, won } = useSuccess();
	const u = usage.data;
	if (usage.isPending) return <Loading rows={3} />;
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
	const days = u?.days ?? [];
	const today = new Date().toISOString().slice(0, 10);
	const runs = rows.filter((r) => r.kind === "run");
	// The spend so far at the end of each day, oldest first.
	let sum = 0;
	const cumulative = days
		.slice()
		.reverse()
		.map((d) => {
			sum += d.usd ?? 0;
			return sum;
		});
	return (
		<>
			<StatStrip
				items={[
					{
						label: prices ? t.ui.spendToday : x.tokensToday,
						value: prices ? (
							<CountUp value={days.find((d) => d.key === today)?.usd ?? 0} format={money.format} />
						) : (
							<CountUp value={days.find((d) => d.key === today)?.tokens ?? 0} />
						),
						tone: "info",
						trend: days
							.slice(0, 14)
							.reverse()
							.map((d) => d.usd ?? 0),
					},
					{
						label: prices ? f.spend : x.runs,
						value: prices ? (
							<CountUp value={runs.reduce((a, r) => a + r.usd, 0)} format={money.format} />
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
						value: ended.length ? percent(Math.round((won / ended.length) * 100), lang) : "-",
						tone: "success",
						delta: `${won}/${ended.length}`,
					},
					{
						label: f.overBudget,
						value: String(runs.filter((r) => spendStatus(r.usd, r.budget) === "danger").length),
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
						onBudget();
					}}
				/>
			</SectionCard>
		</>
	);
}
