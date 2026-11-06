import type { ColumnDef } from "@tanstack/react-table";
import { useGuard } from "@/features/work/guard";
import { NoProject } from "@/features/work/no-project";
import { useFactoryWrites, useKillSwitch, useSessions } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import type { SessionView } from "@/lib/ipc";
import { showAnchor } from "@/lib/notifications/targets";
import { useActiveProject } from "@/lib/projects";
import { RightIconButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { Badge } from "@/ui/atoms/badge";
import { BrandIcon, runnerName } from "@/ui/atoms/brand-icon";
import { LiveDot } from "@/ui/atoms/live-dot";
import { StatusDot } from "@/ui/atoms/status-dot";
import { CommandLineIcon, CpuChipIcon, StopIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Panel } from "@/ui/molecules/panel";
import { STEP_STATUS } from "@/ui/molecules/run-step";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { DataTable } from "@/ui/organisms/data-table";
import { ListDetail } from "@/ui/templates/list-detail";
import { AgentsToggle } from "../agents-toggle";
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
	const { t, lang } = useI18n();
	const f = t.factory;
	const { openRef } = useShell();
	const active = useActiveProject().data;
	const sessions = useSessions();
	const kill = useKillSwitch().data ?? false;
	const writes = useFactoryWrites();
	const { error, run } = useGuard();
	if (active === null) return <NoProject title={f.sessions} />;
	// The live sessions first: a group heading shows each time the group changes.
	const live = (r: SessionView) => r.state === "running" || r.state === "gate";
	const rows = (sessions.data ?? []).toSorted((a, b) => Number(live(b)) - Number(live(a)));
	const time = new Intl.DateTimeFormat(lang, { dateStyle: "short", timeStyle: "short" });
	const columns: ColumnDef<SessionView>[] = [
		{
			id: "runner",
			header: f.runner,
			meta: { width: "8rem" },
			cell: (c) => (
				<span className="flex items-center gap-2">
					<span className="relative flex">
						<BrandIcon name={c.row.original.runner} size={20} />
						{c.row.original.state === "running" ? (
							<LiveDot className="absolute -right-0.5 -bottom-0.5 size-2 ring-2 ring-surface-1" />
						) : null}
					</span>
					{runnerName(c.row.original.runner)}
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
			id: "started",
			header: f.started,
			meta: { width: "9rem" },
			cell: (c) => (c.row.original.started ? time.format(c.row.original.started * 1000) : "-"),
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
		{
			// An agent review is no run: its session has the pull request, and Stop ends it.
			id: "stop",
			header: "",
			meta: { width: "3rem" },
			cell: (c) => {
				const { pull, key, state } = c.row.original;
				return pull == null || state !== "running" ? null : (
					<RightIconButton
						right="runs.start"
						label={format(f.machine.stop, { name: key })}
						onClick={() => void run(() => writes.reviewStop(pull))}
					>
						<StopIcon size={14} />
					</RightIconButton>
				);
			},
		},
	];
	const running = rows.filter((r) => r.state === "running").length;
	const spend = rows.reduce((a, r) => a + (r.costUsd ?? 0), 0);
	return (
		<ListDetail
			title={f.sessions}
			icon={<CommandLineIcon size={16} />}
			count={rows.length}
			action={<AgentsToggle />}
			toolbar={
				error ? (
					<p role="alert" className="w-full text-ui text-danger-text">
						{error}
					</p>
				) : undefined
			}
		>
			{rows.length === 0 && !sessions.isPending ? (
				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 [&>*]:shrink-0">
					<EmptyState
						title={t.empty.sessions}
						action={{
							label: kill ? f.killRelease : f.killAll,
							onClick: () => void run(() => writes.killSwitch(!kill)),
						}}
					/>
					<MachineSessions />
					<OrcaSessions />
				</div>
			) : (
				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 [&>*]:shrink-0">
					<StatStrip
						items={[
							{
								label: f.step.running,
								value: String(running),
								icon: <LiveDot idle={running === 0} />,
								tone: "accent",
							},
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
							group={(r) => (live(r) ? "active" : "previous")}
							groupLabel={(g) => (g === "active" ? f.sessionsActive : f.sessionsPrevious)}
							// A review is no run: only a run unit opens its run page, at the unit.
							onOpen={(r) => {
								if (r.pull != null) return;
								openRef(`run:${r.run}`);
								showAnchor(`unit-${r.step}`);
							}}
						/>
					</Panel>
					<MachineSessions />
					<OrcaSessions />
				</div>
			)}
		</ListDetail>
	);
}
