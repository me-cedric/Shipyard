import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import type { RunItem } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import { Badge } from "@/ui/atoms/badge";
import { StatusDot } from "@/ui/atoms/status-dot";
import { CpuChipIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { RUN_STATUS, STATUS_BADGE } from "@/ui/molecules/run-card";
import { DataTable } from "@/ui/organisms/data-table";
import { nameOf } from "./run-live";
import { endOf, stepperOf } from "./run-summary";

/** Factory / Runs, History (ux-declutter REQ-036): one row for each run, newest first. A row opens the run. */
export function RunHistory({
	runs,
	onOpen,
	onBoard,
}: {
	runs: RunItem[];
	onOpen: (id: string) => void;
	onBoard: () => void;
}) {
	const { t, lang } = useI18n();
	const f = t.factory;
	const l = f.runsList;
	const columns = useMemo<ColumnDef<RunItem>[]>(() => {
		const when = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
		return [
			{
				id: "ticket",
				header: f.ticket,
				meta: { width: "minmax(12rem, 3fr)", rowHeader: true },
				cell: ({ row }) => (
					<>
						<span className="font-mono text-11 text-n-11">{row.original.key}</span>{" "}
						<span className="text-n-12">{row.original.title}</span>
					</>
				),
			},
			{
				id: "state",
				header: l.state,
				meta: { width: "11rem" },
				cell: ({ row }) => {
					const state = row.original.state;
					const status = RUN_STATUS[state];
					return (
						<Badge variant={STATUS_BADGE[status]}>
							<StatusDot status={status} label={f.state[state]} className="size-2" />
							{f.state[state]}
						</Badge>
					);
				},
			},
			{
				id: "workflow",
				header: l.workflow,
				meta: { width: "minmax(7rem, 1fr)" },
				cell: ({ row }) => nameOf(row.original.workflow),
			},
			{
				id: "steps",
				header: l.steps,
				meta: { width: "6rem", numeric: true },
				cell: ({ row }) => {
					const s = stepperOf(row.original);
					return s.total ? format(f.nOf, { n: s.n, total: s.total }) : "";
				},
			},
			{
				id: "cost",
				header: f.cost,
				meta: { width: "6rem", numeric: true },
				cell: ({ row }) =>
					row.original.costUsd === null ? "" : `$${row.original.costUsd.toFixed(2)}`,
			},
			{
				id: "ended",
				header: l.ended,
				meta: { width: "11rem" },
				cell: ({ row }) => {
					const end = endOf(row.original);
					return end ? <time dateTime={new Date(end).toISOString()}>{when.format(end)}</time> : "–";
				},
			},
			{
				id: "pr",
				header: l.pullRequest,
				meta: { width: "9rem" },
				cell: ({ row }) => {
					const pr = row.original.pr;
					return pr ? (
						<span className="font-mono">
							#{pr.number}{" "}
							<span className="font-sans text-n-11">{t.forge.state[pr.state as "open"]}</span>
						</span>
					) : null;
				},
			},
		];
	}, [f, l, lang, t.forge.state]);
	if (runs.length === 0)
		return (
			<EmptyState
				title={t.empty.runs}
				icon={<CpuChipIcon size={28} />}
				action={{ label: l.board, onClick: onBoard }}
			/>
		);
	return (
		<div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-surface-1 shadow-1">
				<DataTable
					memory="runs-history"
					label={l.history}
					data={runs}
					columns={columns}
					rowId={(r) => r.id}
					rowLabel={(r) => `${r.key} ${r.title}`}
					onOpen={(r) => onOpen(r.id)}
				/>
			</div>
		</div>
	);
}
