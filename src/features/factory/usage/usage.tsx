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
import { EmptyState } from "@/ui/molecules/empty-state";
import { SpendMeter } from "@/ui/molecules/spend-meter";
import { DataTable } from "@/ui/organisms/data-table";
import { ListDetail } from "@/ui/templates/list-detail";

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
	const { t } = useI18n();
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
	return (
		<ListDetail
			title={f.usage}
			toolbar={
				<>
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
						className="max-w-48"
						value={key}
						onChange={(e) => setKey(e.target.value)}
					/>
					<Input
						label={f.budgetAmount}
						type="number"
						min="0"
						step="any"
						className="max-w-32"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
					/>
					<Button variant="primary" disabled={!key.trim()} onClick={set}>
						{f.setBudget}
					</Button>
					{error ? (
						<p role="alert" className="w-full text-ui text-danger-text">
							{error}
						</p>
					) : null}
				</>
			}
		>
			{rows.length === 0 && !usage.isPending ? (
				<div className="p-4">
					<EmptyState action={{ label: f.setBudget, onClick: () => field.current?.focus() }} />
				</div>
			) : (
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
			)}
		</ListDetail>
	);
}
