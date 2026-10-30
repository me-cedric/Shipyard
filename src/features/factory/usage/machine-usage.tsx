import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { useGuard } from "@/features/work/guard";
import { useMachineSpend, useMachineWrites } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import type { SpendRow } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { ChartBarIcon, ComputerDesktopIcon, CurrencyIcon } from "@/ui/icons";
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

/** A bar for each day, oldest first. The bars carry no text: the table under it holds the numbers. */
function Bars({ lines, label }: { lines: Line[]; label: string }) {
	const max = Math.max(...lines.map((l) => l.usd), 0.01);
	const w = 8;
	return (
		<svg
			role="img"
			aria-label={label}
			viewBox={`0 0 ${Math.max(lines.length, 1) * w} 60`}
			preserveAspectRatio="none"
			className="h-28 w-full text-accent"
		>
			{lines.map((l, i) => (
				<rect
					key={l.name}
					x={i * w + 1}
					y={60 - (l.usd / max) * 58}
					width={w - 2}
					height={(l.usd / max) * 58}
					rx={1}
					fill="currentColor"
				/>
			))}
		</svg>
	);
}

/** Factory / Usage, second block: spend of every AI session on this computer, with budgets. */
export function MachineUsage() {
	const { t, lang } = useI18n();
	const m = t.factory.machine;
	const [days, setDays] = useState(30);
	const [by, setBy] = useState<By>("runner");
	const [runner, setRunner] = useState(ALL);
	const [amount, setAmount] = useState("");
	const spend = useMachineSpend(90);
	const writes = useMachineWrites();
	const { error, run } = useGuard();
	const money = new Intl.NumberFormat(lang, { style: "currency", currency: "USD" });
	const all = spend.data?.rows ?? [];
	const budgets = spend.data?.budgets ?? [];
	const since = day(days - 1);
	const rows = all.filter((r) => r.day >= since);
	const month = new Date().toISOString().slice(0, 7);
	const monthRows = all.filter((r) => r.day.startsWith(month));
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
			cell: (c) => c.row.original.tokens.toLocaleString(),
		},
		{
			id: "spend",
			header: t.factory.spend,
			meta: { width: "7rem", numeric: true },
			cell: (c) => money.format(c.row.original.usd),
		},
	];
	const lines = group(rows, by);
	const save = (name: string, usd: number | null) =>
		void run(async () => {
			await writes.budget(name, usd);
			setAmount("");
		});
	const total = monthUsd(ALL);
	return (
		<>
			<StatStrip
				items={[
					{
						label: m.month,
						value: money.format(total),
						icon: <ComputerDesktopIcon size={12} />,
						tone: "info",
						trend: chart.map((l) => l.usd),
					},
					{
						label: t.factory.tokens,
						value: rows.reduce((a, r) => a + (r.tokens ?? 0), 0).toLocaleString(),
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
				<Bars lines={chart} label={m.chart} />
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
