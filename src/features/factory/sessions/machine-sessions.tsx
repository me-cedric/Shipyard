import type { ColumnDef } from "@tanstack/react-table";
import { useGuard } from "@/features/work/guard";
import { useMachineSessions, useMachineWrites } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import type { MachineSession_Serialize as MachineSession } from "@/lib/ipc";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { IconButton } from "@/ui/atoms/icon-button";
import { LiveDot } from "@/ui/atoms/live-dot";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ComputerDesktopIcon, StopIcon } from "@/ui/icons";
import { Panel } from "@/ui/molecules/panel";
import { DataTable } from "@/ui/organisms/data-table";

const SHAPE = { working: "accent", idle: "warning", done: "neutral" } as const;
const DOT = { working: "active", idle: "warning", done: "idle" } as const;
const known = (s: string): s is keyof typeof SHAPE => s in SHAPE;

/** Factory / Sessions, second block: each AI session on this computer, started by Shipyard or not. */
export function MachineSessions() {
	const { t } = useI18n();
	const f = t.factory;
	const m = f.machine;
	const rows = useMachineSessions().data ?? [];
	const writes = useMachineWrites();
	const { error, run } = useGuard();
	const columns: ColumnDef<MachineSession>[] = [
		{
			id: "runner",
			header: f.runner,
			meta: { width: "8rem" },
			cell: (c) => (
				<span className="flex items-center gap-2">
					<span className="relative flex">
						<Avatar name={c.row.original.runner} className="size-5 text-11" />
						{c.row.original.state === "working" ? (
							<LiveDot className="absolute -right-0.5 -bottom-0.5 size-2 ring-2 ring-surface-1" />
						) : null}
					</span>
					{c.row.original.runner}
				</span>
			),
		},
		{ id: "model", header: f.model, meta: { width: "9rem" }, cell: (c) => c.row.original.model },
		{
			id: "project",
			header: m.project,
			meta: { width: "8rem" },
			cell: (c) => c.row.original.project,
		},
		{ id: "title", header: f.ticket, cell: (c) => c.row.original.title },
		{
			id: "state",
			header: f.status,
			meta: { width: "8rem" },
			cell: (c) => {
				const s = known(c.row.original.state) ? c.row.original.state : "done";
				return (
					<Badge variant={SHAPE[s]}>
						<StatusDot status={DOT[s]} label={m.state[s]} className="size-2" />
						{m.state[s]}
					</Badge>
				);
			},
		},
		{
			id: "tokens",
			header: f.tokens,
			meta: { width: "6rem", numeric: true },
			cell: (c) => (c.row.original.tokens ?? 0).toLocaleString(),
		},
		{
			id: "cost",
			header: f.cost,
			meta: { width: "5rem", numeric: true },
			cell: (c) => `$${(c.row.original.costUsd ?? 0).toFixed(2)}`,
		},
		{
			id: "stop",
			header: "",
			meta: { width: "3rem" },
			cell: (c) => {
				const pid = c.row.original.pid;
				return pid === null ? null : (
					<IconButton
						label={format(m.stop, { name: `${c.row.original.runner} ${c.row.original.project}` })}
						onClick={() => void run(() => writes.stop(pid))}
					>
						<StopIcon size={14} />
					</IconButton>
				);
			},
		},
	];
	return (
		<Panel
			title={m.title}
			count={rows.length}
			icon={<ComputerDesktopIcon size={14} />}
			flush
			className="min-h-64 flex-1"
			bodyClassName="min-h-0 flex-1"
		>
			{error ? (
				<p role="alert" className="px-3 py-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<DataTable label={m.title} columns={columns} data={rows} rowId={(r) => r.key} />
		</Panel>
	);
}
