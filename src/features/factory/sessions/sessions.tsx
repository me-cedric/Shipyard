import type { ColumnDef } from "@tanstack/react-table";
import { useGuard } from "@/features/work/guard";
import { NoProject } from "@/features/work/no-project";
import { useFactoryWrites, useKillSwitch, useSessions } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import type { SessionView } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { Button } from "@/ui/atoms/button";
import { StatusDot } from "@/ui/atoms/status-dot";
import { EmptyState } from "@/ui/molecules/empty-state";
import { STEP_STATUS } from "@/ui/molecules/run-step";
import { DataTable } from "@/ui/organisms/data-table";
import { ListDetail } from "@/ui/templates/list-detail";

/** Factory / Sessions: the agent sessions and the global kill switch, the one action (factory REQ-031). */
export function Sessions() {
	const { t } = useI18n();
	const f = t.factory;
	const active = useActiveProject().data;
	const sessions = useSessions();
	const kill = useKillSwitch().data ?? false;
	const writes = useFactoryWrites();
	const { error, run } = useGuard();
	if (active === null) return <NoProject title={f.sessions} />;
	const rows = sessions.data ?? [];
	const columns: ColumnDef<SessionView>[] = [
		{ id: "runner", header: f.runner, meta: { width: "6rem" }, cell: (c) => c.row.original.runner },
		{ id: "model", header: f.model, meta: { width: "6rem" }, cell: (c) => c.row.original.model },
		{ id: "key", header: f.run, meta: { width: "6rem" }, cell: (c) => c.row.original.key },
		{ id: "step", header: f.stepName, cell: (c) => c.row.original.step },
		{
			id: "state",
			header: f.status,
			meta: { width: "8rem" },
			cell: (c) => (
				<span className="flex items-center gap-2">
					<StatusDot
						status={STEP_STATUS[c.row.original.state]}
						label={f.step[c.row.original.state]}
					/>
					{f.step[c.row.original.state]}
				</span>
			),
		},
		{
			id: "tokens",
			header: f.tokens,
			meta: { width: "6rem", numeric: true },
			cell: (c) => c.row.original.tokens.toLocaleString(),
		},
		{
			id: "cost",
			header: f.cost,
			meta: { width: "6rem", numeric: true },
			cell: (c) =>
				c.row.original.costUsd === null ? "-" : `$${c.row.original.costUsd.toFixed(2)}`,
		},
	];
	return (
		<ListDetail
			title={f.sessions}
			toolbar={
				<>
					<span className="flex items-center gap-2 text-12">
						<StatusDot status={kill ? "danger" : "success"} label={kill ? f.killOn : f.killOff} />
						{kill ? f.killOn : f.killOff}
					</span>
					<Button
						variant={kill ? "secondary" : "danger"}
						className="ml-auto"
						onClick={() => void run(() => writes.killSwitch(!kill))}
					>
						{kill ? f.killRelease : f.killAll}
					</Button>
					{error ? (
						<p role="alert" className="w-full text-ui text-danger-text">
							{error}
						</p>
					) : null}
				</>
			}
		>
			{rows.length === 0 && !sessions.isPending ? (
				<div className="p-4">
					<EmptyState
						action={{
							label: kill ? f.killRelease : f.killAll,
							onClick: () => void run(() => writes.killSwitch(!kill)),
						}}
					/>
				</div>
			) : (
				<DataTable
					label={f.sessions}
					columns={columns}
					data={rows}
					rowId={(r) => `${r.run}/${r.step}`}
				/>
			)}
		</ListDetail>
	);
}
