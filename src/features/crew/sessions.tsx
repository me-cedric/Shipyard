import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { AgentsToggle } from "@/features/factory/agents-toggle";
import { nameOf } from "@/features/factory/runs/run-live";
import { SectionCard } from "@/features/factory/section-card";
import { MachineSessions } from "@/features/factory/sessions/machine-sessions";
import { OrcaSessions } from "@/features/factory/sessions/orca-sessions";
import { NoProject } from "@/features/shell/no-project";
import { tabIcon } from "@/features/shell/spaces";
import { useGuard } from "@/features/work/guard";
import { useFactoryWrites, useSessions } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { commands, type SessionView, unwrap } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { RightIconButton } from "@/lib/rights";
import { runHref } from "@/lib/shell";
import { Badge } from "@/ui/atoms/badge";
import { BrandIcon, runnerName } from "@/ui/atoms/brand-icon";
import { LiveDot } from "@/ui/atoms/live-dot";
import { StatusDot } from "@/ui/atoms/status-dot";
import { StopIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Loading } from "@/ui/molecules/loading";
import { PageHeader } from "@/ui/molecules/page-header";
import { STEP_STATUS } from "@/ui/molecules/run-step";
import { DataTable } from "@/ui/organisms/data-table";

const STATE_BADGE = {
	pending: "neutral",
	running: "accent",
	gate: "warning",
	done: "success",
	failed: "danger",
} as const;

/** Crew / Sessions (`spec:app-redesign#REQ-016`): the agent sessions; a run session opens its run at the step (factory REQ-031, ux-declutter REQ-038). */
export function CrewSessions() {
	const { t, lang } = useI18n();
	const f = t.factory;
	const navigate = useNavigate();
	const active = useActiveProject().data;
	const sessions = useSessions();
	const writes = useFactoryWrites();
	const { error, run } = useGuard();
	const Icon = tabIcon("crew", "sessions");
	const icon = Icon && <Icon size={16} />;
	if (active === undefined) return <Loading title={t.ui.place.crew} icon={icon} />;
	if (active === null) return <NoProject title={t.ui.place.crew} icon={icon} />;
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
		{ id: "step", header: f.stepName, cell: (c) => nameOf(c.row.original.step) },
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
			// An agent review and an estimate are no run: Stop ends the session
			// (`spec:app-redesign#REQ-033`). The key of an estimate is its sheet.
			id: "stop",
			header: "",
			meta: { width: "3rem" },
			cell: (c) => {
				const { pull, key, step, state } = c.row.original;
				return (pull == null && step !== "estimate") || state !== "running" ? null : (
					<RightIconButton
						right="runs.start"
						label={format(f.machine.stop, { name: key })}
						className="min-h-control min-w-11"
						onClick={(e) => {
							// The row opens its page on a click: Stop does not.
							e.stopPropagation();
							void run(async () => {
								if (pull != null) return writes.reviewStop(pull);
								try {
									await unwrap(commands.estimateAgentStop(key));
								} finally {
									await sessions.refetch();
								}
							});
						}}
					>
						<StopIcon size={14} />
					</RightIconButton>
				);
			},
		},
	];
	// The totals that the tiles showed stay as the last row of the table.
	const totals = [
		f.total,
		"",
		"",
		"",
		"",
		"",
		rows.reduce((a, r) => a + r.tokens, 0).toLocaleString(),
		`$${rows.reduce((a, r) => a + (r.costUsd ?? 0), 0).toFixed(2)}`,
		"",
	];
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader icon={icon} title={t.ui.place.crew} chips={<AgentsToggle />} />
			{error ? (
				<p role="alert" className="px-4 pb-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			{rows.length === 0 && !sessions.isPending ? (
				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-2 pb-4 [&>*]:shrink-0">
					<EmptyState
						title={t.empty.sessions}
						action={{ label: f.runs, onClick: () => void navigate({ to: "/flow/flow" }) }}
					/>
					<MachineSessions />
					<OrcaSessions />
				</div>
			) : (
				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-2 pb-4 [&>*]:shrink-0">
					<SectionCard
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
							footer={totals}
							// A review is no run: only a run unit opens its run page, at the unit. An estimate opens its sheet.
							onOpen={(r) => {
								if (r.step === "estimate")
									void navigate({ to: "/plan/estimates", search: { sheet: r.key } as never });
								else if (r.pull == null) void navigate(runHref(r.run, r.step));
							}}
						/>
					</SectionCard>
					<MachineSessions />
					<OrcaSessions />
				</div>
			)}
		</div>
	);
}
