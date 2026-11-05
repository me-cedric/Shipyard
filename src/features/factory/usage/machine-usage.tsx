import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { useGuard } from "@/features/work/guard";
import { useMachineSpend, useMachineWrites } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import type { SpendRow } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/atoms/button";
import { CountUp } from "@/ui/atoms/count-up";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { ChartBarIcon, ComputerDesktopIcon, CurrencyIcon } from "@/ui/icons";
import { Loading } from "@/ui/molecules/loading";
import { Panel } from "@/ui/molecules/panel";
import { SpendMeter } from "@/ui/molecules/spend-meter";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { DataTable } from "@/ui/organisms/data-table";

type By = "day" | "runner" | "model" | "project";
type Line = { name: string; tokens: number; usd: number };

const BY: By[] = ["day", "runner", "model", "project"];
const PERIODS = [7, 30, 90];
const ALL = "";

const day = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);

/** The rows grouped by one key, the biggest spend first (a day: the newest first). */
export function group(rows: SpendRow[], by: By): Line[] {
	const sum = new Map<string, Line>();
	for (const r of rows) {
		const l = sum.get(r[by]) ?? { name: r[by], tokens: 0, usd: 0 };
		l.tokens += r.tokens ?? 0;
		l.usd += r.costUsd ?? 0;
		sum.set(r[by], l);
	}
	const lines = [...sum.values()];
	return by === "day"
		? lines.sort((a, b) => b.name.localeCompare(a.name))
		: lines.sort((a, b) => b.usd - a.usd);
}

/**
 * A bar for each day, oldest first. A bar is 40 px wide at most, so a short period does not
 * stretch it; a day with no spend shows a stub. The day and the amount are in the title of the bar,
 * and the table under the chart holds the numbers. The days show under the bars up to 14 days.
 */
function Bars({
	lines,
	label,
	lang,
	amount,
}: {
	lines: Line[];
	label: string;
	lang: string;
	amount: (usd: number) => string;
}) {
	const max = Math.max(...lines.map((l) => l.usd), 0.01);
	const day = (iso: string, opts: Intl.DateTimeFormatOptions) =>
		new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang, { ...opts, timeZone: "UTC" });
	const every = lines.length <= 14;
	return (
		<div role="img" aria-label={label} className="flex flex-col gap-1 px-3 pt-3 pb-2">
			<div className="flex h-28 items-end gap-1">
				{lines.map((l) => (
					<div key={l.name} className="flex h-full min-w-0 flex-1 items-end justify-center">
						<span
							title={`${day(l.name, { weekday: "short", day: "numeric", month: "short" })}: ${amount(l.usd)}`}
							style={{ height: l.usd > 0 ? `${Math.max(4, (l.usd / max) * 100)}%` : "2px" }}
							className={cn(
								"w-full max-w-10 rounded-t-sm transition-[height] duration-(--duration-base)",
								l.usd > 0 ? "bg-accent" : "bg-n-6",
							)}
						/>
					</div>
				))}
			</div>
			<div aria-hidden="true" className="flex gap-1 text-11 text-n-11">
				{lines.map((l, i) => (
					<span key={l.name} className="min-w-0 flex-1 truncate text-center">
						{every || i === 0 || i === lines.length - 1
							? day(
									l.name,
									every ? { weekday: "short", day: "numeric" } : { day: "numeric", month: "short" },
								)
							: ""}
					</span>
				))}
			</div>
		</div>
	);
}

/** Factory / Usage, second block: spend of every AI session on this computer, with budgets. */
export function MachineUsage({ prices }: { prices: boolean }) {
	const { t, lang } = useI18n();
	const m = t.factory.machine;
	const [days, setDays] = useState(30);
	const [by, setBy] = useState<By>("runner");
	const [runner, setRunner] = useState(ALL);
	const [amount, setAmount] = useState("");
	const spend = useMachineSpend(90);
	const writes = useMachineWrites();
	const { error, run } = useGuard();
	const fmt = new Intl.NumberFormat(lang, { style: "currency", currency: "USD" });
	const money = { format: (n: number) => (prices ? fmt.format(n) : t.extras.usage.hidden) };
	const all = (spend.data ?? spend.partial)?.rows ?? [];
	const budgets = spend.data?.budgets ?? [];
	const since = day(days - 1);
	const rows = all.filter((r) => r.day >= since);
	const month = new Date().toISOString().slice(0, 7);
	const monthRows = all.filter((r) => r.day.startsWith(month));
	const monthTokens = monthRows.reduce((a, r) => a + (r.tokens ?? 0), 0);
	const byDay = group(rows, "day");
	const chart = Array.from({ length: days }, (_, i) => day(days - 1 - i)).map(
		(d) => byDay.find((l) => l.name === d) ?? { name: d, tokens: 0, usd: 0 },
	);
	const monthUsd = (name: string) =>
		monthRows
			.filter((r) => name === ALL || r.runner === name)
			.reduce((a, r) => a + (r.costUsd ?? 0), 0);
	const runners = [...new Set(all.map((r) => r.runner))];
	const columns: ColumnDef<Line>[] = [
		{ id: "name", header: m[BY_LABEL[by]], cell: (c) => c.row.original.name },
		{
			id: "tokens",
			header: t.factory.tokens,
			meta: { width: "8rem", numeric: true },
			cell: (c) => <CountUp value={c.row.original.tokens} />,
		},
		{
			id: "spend",
			header: t.factory.spend,
			meta: { width: "7rem", numeric: true },
			cell: (c) => <CountUp value={c.row.original.usd} format={money.format} />,
		},
	];
	const lines = group(rows, by);
	const save = (name: string, usd: number | null) =>
		void run(async () => {
			await writes.budget(name, usd);
			setAmount("");
		});
	const total = monthUsd(ALL);
	if (spend.isPending && !spend.partial) return <Loading rows={3} />;
	const p = spend.partial;
	return (
		<>
			{p ? (
				<p role="status" className="text-ui text-n-11">
					{format(m.reading, { read: p.read, found: p.found })}
				</p>
			) : null}
			<StatStrip
				items={[
					{
						label: prices ? m.month : t.extras.usage.tokensMonth,
						value: prices ? (
							<CountUp value={total} format={money.format} />
						) : (
							<CountUp value={monthTokens} />
						),
						icon: <ComputerDesktopIcon size={12} />,
						tone: "info",
						trend: chart.map((l) => l.usd),
					},
					{
						label: t.factory.tokens,
						value: <CountUp value={rows.reduce((a, r) => a + (r.tokens ?? 0), 0)} />,
						tone: "accent",
					},
					{
						label: m.overBudget,
						value: String(
							budgets.filter((b) => (b.usd ?? 0) > 0 && monthUsd(b.runner) >= (b.usd ?? 0)).length,
						),
						icon: <CurrencyIcon size={12} />,
						tone: "danger",
					},
				]}
			/>
			<Panel
				title={m.chart}
				icon={<ChartBarIcon size={14} />}
				toolbar={
					<Select
						label={m.period}
						items={PERIODS.map((n) => ({ value: String(n), label: format(m.days, { count: n }) }))}
						value={String(days)}
						onValueChange={(v) => setDays(Number(v))}
					/>
				}
			>
				<Bars lines={chart} label={m.chart} lang={lang} amount={money.format} />
			</Panel>
			<Panel
				title={m.title}
				count={lines.length}
				flush
				toolbar={
					<Select
						label={m.groupBy}
						items={BY.map((b) => ({ value: b, label: m[BY_LABEL[b]] }))}
						value={by}
						onValueChange={(v) => setBy(BY.find((b) => b === v) ?? "runner")}
					/>
				}
			>
				<DataTable label={m.title} columns={columns} data={lines} rowId={(r) => r.name} />
			</Panel>
			<Panel title={m.budget} count={budgets.length}>
				<div className="flex flex-col gap-2">
					<span className="flex flex-wrap items-end gap-2">
						<Select
							label={m.budgetFor}
							items={[ALL, ...runners].map((r) => ({
								value: r,
								label: r === ALL ? m.allRunners : r,
							}))}
							value={runner}
							onValueChange={setRunner}
						/>
						<Input
							label={m.budgetAmount}
							type="number"
							min="0"
							step="any"
							className="max-w-32"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
						/>
						<Button
							variant="primary"
							disabled={!amount.trim()}
							onClick={() => save(runner, Number(amount))}
						>
							{m.save}
						</Button>
					</span>
					{budgets.map((b) => (
						<span key={b.runner} className="flex items-center gap-3 text-ui">
							<span className="w-32">{b.runner === ALL ? m.allRunners : b.runner}</span>
							<span className="w-40 text-n-11">
								{money.format(monthUsd(b.runner))} / {money.format(b.usd ?? 0)}
							</span>
							<SpendMeter
								usd={monthUsd(b.runner)}
								budget={b.usd}
								label={`${m.budget} ${b.runner === ALL ? m.allRunners : b.runner}`}
							/>
							<Button variant="ghost" onClick={() => save(b.runner, null)}>
								{m.remove}
							</Button>
						</span>
					))}
					{error ? (
						<p role="alert" className="text-ui text-danger-text">
							{error}
						</p>
					) : null}
				</div>
			</Panel>
		</>
	);
}

const BY_LABEL = {
	day: "byDay",
	runner: "byRunner",
	model: "byModel",
	project: "byProject",
} as const;
