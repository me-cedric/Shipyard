import type { ColumnDef } from "@tanstack/react-table";
import { useGuard } from "@/features/work/guard";
import { NoProject } from "@/features/work/no-project";
import { useFactoryWrites, useKillSwitch, useSessions } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import type { SessionView } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { LiveDot } from "@/ui/atoms/live-dot";
import { StatusDot } from "@/ui/atoms/status-dot";
import { CommandLineIcon, CpuChipIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Panel } from "@/ui/molecules/panel";
import { STEP_STATUS } from "@/ui/molecules/run-step";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { DataTable } from "@/ui/organisms/data-table";
import { ListDetail } from "@/ui/templates/list-detail";
import { MachineSessions } from "./machine-sessions";
import { OrcaSessions } from "./orca-sessions";

const STATE_BADGE = {
	pending: "neutral",
	running: "accent",
	gate: "warning",
	done: "success",
	failed: "danger",
} as const;

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
		{
			id: "runner",
			header: f.runner,
			meta: { width: "8rem" },
			cell: (c) => (
				<span className="flex items-center gap-2">
					<span className="relative flex">
						<Avatar name={c.row.original.runner} className="size-5 text-11" />
						{c.row.original.state === "running" ? (
							<LiveDot className="absolute -right-0.5 -bottom-0.5 size-2 ring-2 ring-surface-1" />
						) : null}
					</span>
					{c.row.original.runner}
				</span>
			),
		},
		{ id: "model", header: f.model, meta: { width: "6rem" }, cell: (c) => c.row.original.model },
		{ id: "key", header: f.run, meta: { width: "6rem" }, cell: (c) => c.row.original.key },
		{ id: "step", header: f.stepName, cell: (c) => c.row.original.step },
		{
			id: "state",
			header: f.status,
			meta: { width: "8rem" },
			cell: (c) => (
				<Badge variant={STATE_BADGE[c.row.original.state]}>
					<StatusDot
						status={STEP_STATUS[c.row.original.state]}
						label={f.step[c.row.original.state]}
						className="size-2"
					/>
					{f.step[c.row.original.state]}
				</Badge>
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
	const running = rows.filter((r) => r.state === "running").length;
	const spend = rows.reduce((a, r) => a + (r.costUsd ?? 0), 0);
	return (
		<ListDetail
			title={f.sessions}
			icon={<CommandLineIcon size={16} />}
			count={rows.length}
			chips={
				<Badge variant={kill ? "danger" : "success"}>
					<StatusDot
						status={kill ? "danger" : "success"}
						label={kill ? f.killOn : f.killOff}
						className="size-2"
					/>
					{kill ? f.killOn : f.killOff}
				</Badge>
			}
			action={
				<Button
					variant={kill ? "secondary" : "danger"}
					onClick={() => void run(() => writes.killSwitch(!kill))}
				>
					{kill ? f.killRelease : f.killAll}
				</Button>
			}
			toolbar={
				error ? (
					<p role="alert" className="w-full text-ui text-danger-text">
						{error}
					</p>
				) : undefined
			}
		>
			{rows.length === 0 && !sessions.isPending ? (
				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
					<EmptyState
						action={{
							label: kill ? f.killRelease : f.killAll,
							onClick: () => void run(() => writes.killSwitch(!kill)),
						}}
					/>
					<MachineSessions />
					<OrcaSessions />
				</div>
			) : (
				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
					<StatStrip
						items={[
							{ label: f.step.running, value: String(running), icon: <LiveDot />, tone: "accent" },
							{
								label: f.runner,
								value: String(new Set(rows.map((r) => r.runner)).size),
								icon: <CpuChipIcon size={12} />,
								tone: "info",
							},
							{
								label: f.tokens,
								value: rows.reduce((a, r) => a + r.tokens, 0).toLocaleString(),
								tone: "accent",
							},
							{ label: f.cost, value: `$${spend.toFixed(2)}`, tone: "success" },
						]}
					/>
					<Panel
						title={f.sessions}
						count={rows.length}
						flush
						className="min-h-64 flex-1"
						bodyClassName="min-h-0 flex-1"
					>
						<DataTable
							label={f.sessions}
							columns={columns}
							data={rows}
							rowId={(r) => `${r.run}/${r.step}`}
						/>
					</Panel>
					<MachineSessions />
					<OrcaSessions />
				</div>
			)}
		</ListDetail>
	);
}
