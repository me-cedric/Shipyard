import type { ColumnDef } from "@tanstack/react-table";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { NoProject } from "@/features/shell/no-project";
import { useGuard } from "@/features/work/guard";
import { useFactoryWrites, useRuns, useUsage } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { useActiveProject } from "@/lib/projects";
import { RightButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { useViewState } from "@/lib/shell/view-state";
import { useAutomation } from "@/lib/sync";
import { Button } from "@/ui/atoms/button";
import { CountUp } from "@/ui/atoms/count-up";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { Switch } from "@/ui/atoms/switch";
import { ChartBarIcon, CheckIcon, CurrencyIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Loading } from "@/ui/molecules/loading";
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
	/** The model requests of a run. */
	iterations: number | null;
	/** The title of the ticket of a run. */
	title?: string;
};

const WON = ["Merged", "Done"];
const ENDED = [...WON, "Failed", "Cancelled"];

/** Factory / Usage: spend against budget per run, day and member. The one action sets a budget (factory REQ-032). */
export function Usage() {
	const { t, lang } = useI18n();
	const f = t.factory;
	const active = useActiveProject().data;
	const usage = useUsage();
	const automation = useAutomation().data?.automation.budgets;
	const writes = useFactoryWrites();
	const { error, run } = useGuard();
	const { openRef } = useShell();
	const titles = new Map((useRuns().data ?? []).map((r) => [r.id, r]));
	const [editing, setEditing] = useState(false);
	const [scope, setScope] = useState<"day" | "member">("day");
	const [key, setKey] = useState("");
	const [amount, setAmount] = useState("");
	const field = useRef<HTMLInputElement>(null);
	const [prices, setPrices] = useViewState("usage-prices", true);
	const x = t.extras.usage;
	if (active === undefined) return <Loading title={f.usage} icon={<ChartBarIcon size={16} />} />;
	if (active === null) return <NoProject title={f.usage} icon={<ChartBarIcon size={16} />} />;
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
	const set = () =>
		void run(async () => {
			const usd = amount.trim() === "" ? null : Number(amount);
			await writes.budget(scope, key.trim(), usd);
			setKey("");
			setAmount("");
		});
	// The configured budgets, from the budgets data: the default `*` once, then each key of its own.
	const budgets = (["day", "member"] as const).flatMap((scope) =>
		Object.entries(automation?.[scope] ?? {})
			.flatMap(([k, usd]) => (usd === null ? [] : [{ k, usd }]))
			.sort((a, b) => Number(b.k === "*") - Number(a.k === "*") || a.k.localeCompare(b.k))
			.map(({ k, usd }) => ({
				id: `${scope}:${k}`,
				name: k === "*" ? (scope === "day" ? f.perDay : f.perMember) : k,
				budget: usd,
			})),
	);
	const form = editing || budgets.length === 0;
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
	// The budgets: one line of amounts while a budget is set, the form when none is or on Edit.
	const budgetPanel = (
		<Panel
			title={f.budgets}
			toolbar={
				budgets.length > 0 ? (
					<Button aria-expanded={form} onClick={() => setEditing(!editing)}>
						{f.edit}
					</Button>
				) : undefined
			}
		>
			{budgets.length > 0 ? (
				<ul aria-label={f.budget} className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-ui">
					{budgets.map((b) => (
						<li key={b.id} className="flex gap-2">
							<span className="text-n-11">{b.name}</span>
							<span className="font-mono">{price(`$${(b.budget ?? 0).toFixed(2)}`)}</span>
						</li>
					))}
				</ul>
			) : null}
			{form ? (
				<div className="flex flex-wrap items-end gap-2 p-3">
					<Select
						caption
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
						caption
						label={f.budgetKey}
						className="w-48"
						value={key}
						onChange={(e) => setKey(e.target.value)}
					/>
					<Input
						caption
						label={f.budgetAmount}
						type="number"
						min="0"
						step="any"
						className="w-28"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
					/>
					<RightButton
						right="project.settings"
						variant="primary"
						disabled={!key.trim()}
						onClick={set}
					>
						{f.setBudget}
					</RightButton>
				</div>
			) : null}
		</Panel>
	);
	return (
		<ListDetail
			title={f.usage}
			icon={<ChartBarIcon size={16} />}
			action={<Switch label={x.showPrices} checked={prices} onCheckedChange={setPrices} />}
			toolbar={
				error ? (
					<p role="alert" className="w-full text-ui text-danger-text">
						{error}
					</p>
				) : undefined
			}
		>
			{rows.length === 0 && !usage.isPending ? (
				<div className="flex flex-col gap-3 overflow-y-auto p-4 [&>*]:shrink-0">
					<EmptyState
						// No budget, or budgets and no usage yet.
						title={budgets.length === 0 ? t.empty.budget : t.empty.usage}
						action={{
							label: f.setBudget,
							// The form must be on the page before the field takes the focus.
							onClick: () => {
								flushSync(() => setEditing(true));
								field.current?.focus();
							},
						}}
					/>
					{budgetPanel}
					<MachineUsage prices={prices} />
				</div>
			) : (
				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 [&>*]:shrink-0">
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
							{budgetPanel}
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
										if (r.kind === "run") return openRef(r.id);
										setScope(r.kind);
										setKey(r.key);
										setEditing(true);
									}}
								/>
							</Panel>
							<RequestTree runs={u?.runs ?? []} />
						</>
					)}
					<MachineUsage prices={prices} />
				</div>
			)}
		</ListDetail>
	);
}
