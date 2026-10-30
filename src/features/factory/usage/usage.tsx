import type { ColumnDef } from "@tanstack/react-table";
import { useRef, useState } from "react";
import { useGuard } from "@/features/work/guard";
import { NoProject } from "@/features/work/no-project";
import { useFactoryWrites, useUsage } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { useActiveProject } from "@/lib/projects";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { ChartBarIcon, CurrencyIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Panel } from "@/ui/molecules/panel";
import { SpendMeter, spendStatus } from "@/ui/molecules/spend-meter";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { DataTable } from "@/ui/organisms/data-table";
import { ListDetail } from "@/ui/templates/list-detail";
import { MachineUsage } from "./machine-usage";
import { RequestTree } from "./request-tree";

type Kind = "run" | "day" | "member";
type Row = {
	id: string;
	kind: Kind;
	key: string;
	name: string;
	tokens: number;
	usd: number;
	budget: number | null;
};

/** Factory / Usage: spend against budget per run, day and member. The one action sets a budget (factory REQ-032). */
export function Usage() {
	const { t, lang } = useI18n();
	const f = t.factory;
	const active = useActiveProject().data;
	const usage = useUsage();
	const writes = useFactoryWrites();
	const { error, run } = useGuard();
	const [scope, setScope] = useState<"day" | "member">("day");
	const [key, setKey] = useState("");
	const [amount, setAmount] = useState("");
	const field = useRef<HTMLInputElement>(null);
	if (active === null) return <NoProject title={f.usage} />;
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
		})),
		...(u?.days ?? []).map((d) => ({
			id: `day:${d.key}`,
			kind: "day" as const,
			key: d.key,
			name: d.key,
			tokens: d.tokens,
			usd: d.usd ?? 0,
			budget: d.budget,
		})),
		...(u?.members ?? []).map((m) => ({
			id: `member:${m.key}`,
			kind: "member" as const,
			key: m.key,
			name: m.key || f.noAssignee,
			tokens: m.tokens,
			usd: m.usd ?? 0,
			budget: m.budget,
		})),
	];
	const columns: ColumnDef<Row>[] = [
		{ id: "name", header: f.usage, cell: (c) => c.row.original.name },
		{
			id: "tokens",
			header: f.tokens,
			meta: { width: "7rem", numeric: true },
			cell: (c) => c.row.original.tokens.toLocaleString(),
		},
		{
			id: "spend",
			header: f.spend,
			meta: { width: "6rem", numeric: true },
			cell: (c) => `$${c.row.original.usd.toFixed(2)}`,
		},
		{
			id: "budget",
			header: f.budget,
			meta: { width: "6rem", numeric: true },
			cell: (c) => (c.row.original.budget === null ? "-" : `$${c.row.original.budget.toFixed(2)}`),
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
	const set = () =>
		void run(async () => {
			const usd = amount.trim() === "" ? null : Number(amount);
			await writes.budget(scope, key.trim(), usd);
			setKey("");
			setAmount("");
		});
	const label: Record<string, string> = { run: f.perRun, day: f.perDay, member: f.perMember };
	const money = new Intl.NumberFormat(lang, { style: "currency", currency: "USD" });
	// Newest day first, keyed by the UTC day.
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
		<ListDetail
			title={f.usage}
			icon={<ChartBarIcon size={16} />}
			action={
				<span className="flex items-center gap-2">
					<Select
						label={f.budgetScope}
						items={[
							{ value: "day", label: f.perDay },
							{ value: "member", label: f.perMember },
						]}
						value={scope}
						onValueChange={(v) => setScope(v === "member" ? "member" : "day")}
					/>
					<Input
						ref={field}
						label={f.budgetKey}
						className="w-48"
						value={key}
						onChange={(e) => setKey(e.target.value)}
					/>
					<Input
						label={f.budgetAmount}
						type="number"
						min="0"
						step="any"
						className="w-28"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
					/>
					<Button variant="primary" disabled={!key.trim()} onClick={set}>
						{f.setBudget}
					</Button>
				</span>
			}
			toolbar={
				error ? (
					<p role="alert" className="w-full text-ui text-danger-text">
						{error}
					</p>
				) : undefined
			}
		>
			{rows.length === 0 && !usage.isPending ? (
				<div className="flex flex-col gap-3 overflow-y-auto p-4">
					<EmptyState action={{ label: f.setBudget, onClick: () => field.current?.focus() }} />
					<MachineUsage />
				</div>
			) : (
				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
					<StatStrip
						items={[
							{
								label: t.ui.spendToday,
								value: money.format(days.find((d) => d.key === today)?.usd ?? 0),
								icon: <CurrencyIcon size={12} />,
								tone: "info",
								trend: days
									.slice(0, 14)
									.reverse()
									.map((d) => d.usd ?? 0),
							},
							{
								label: f.spend,
								value: money.format(runs.reduce((a, r) => a + r.usd, 0)),
								tone: "accent",
								trend: cumulative,
							},
							{
								label: f.tokens,
								value: runs.reduce((a, r) => a + r.tokens, 0).toLocaleString(),
								tone: "accent",
							},
							{
								label: f.overBudget,
								value: String(runs.filter((r) => spendStatus(r.usd, r.budget) === "danger").length),
								tone: "danger",
							},
						]}
					/>
					<Panel
						title={f.usage}
						count={rows.length}
						flush
						className="min-h-64 flex-1"
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
								if (r.kind === "run") return;
								setScope(r.kind);
								setKey(r.key);
							}}
						/>
					</Panel>
					<RequestTree runs={u?.runs ?? []} />
					<MachineUsage />
				</div>
			)}
		</ListDetail>
	);
}
