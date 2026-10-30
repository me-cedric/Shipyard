import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import { commands, type OrcaSession, unwrap } from "@/lib/ipc";
import { copyText } from "@/lib/menus";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ClipboardIcon, CommandLineIcon } from "@/ui/icons";
import { Panel } from "@/ui/molecules/panel";
import { DataTable } from "@/ui/organisms/data-table";

const SHAPE = { working: "accent", idle: "warning", done: "neutral", unknown: "neutral" } as const;
const DOT = { working: "active", idle: "warning", done: "idle", unknown: "idle" } as const;
const known = (s: string): s is keyof typeof SHAPE => s in SHAPE;

/**
 * Factory / Sessions, third block: the agent sessions that Orca runs, read with its `orca` command.
 * A row opens in Orca on a click. Shipyard never starts, stops or removes an Orca session. Nothing
 * shows while Orca is not installed, except the address to get it.
 */
export function OrcaSessions() {
	const { t } = useI18n();
	const o = t.personal.orca;
	const { error, run } = useGuard();
	const status = useQuery({
		queryKey: ["factory", "orca"],
		queryFn: () => unwrap(commands.orcaStatus()),
		refetchInterval: 10_000,
		retry: false,
	}).data;
	if (!status) return null;
	const columns: ColumnDef<OrcaSession>[] = [
		{
			id: "agent",
			header: t.factory.runner,
			meta: { width: "7rem" },
			cell: (c) => c.row.original.agent || "-",
		},
		{
			id: "where",
			header: t.factory.machine.project,
			meta: { width: "12rem" },
			cell: (c) =>
				[c.row.original.project, c.row.original.branch || c.row.original.worktree]
					.filter(Boolean)
					.join(" / "),
		},
		{
			id: "title",
			header: t.factory.ticket,
			cell: (c) => c.row.original.activity || c.row.original.title,
		},
		{
			id: "state",
			header: t.factory.status,
			meta: { width: "8rem" },
			cell: (c) => {
				const s = known(c.row.original.state) ? c.row.original.state : "unknown";
				return (
					<Badge variant={SHAPE[s]}>
						<StatusDot status={DOT[s]} label={o.state[s]} className="size-2" />
						{o.state[s]}
					</Badge>
				);
			},
		},
		{
			id: "context",
			header: o.context,
			meta: { width: "5rem", numeric: true },
			cell: (c) => (c.row.original.context === null ? "" : `${c.row.original.context}%`),
		},
		{
			id: "open",
			header: "",
			meta: { width: "7rem" },
			cell: (c) => (
				<Button
					variant="ghost"
					aria-label={format(o.open, { name: c.row.original.title || c.row.original.id })}
					onClick={() => void run(async () => unwrap(commands.orcaOpen(c.row.original.id, true)))}
				>
					<CommandLineIcon size={14} />
					{o.openShort}
				</Button>
			),
		},
	];
	return (
		<Panel
			title={o.title}
			count={status.sessions.length}
			icon={<CommandLineIcon size={14} />}
			flush
			className="shrink-0"
		>
			{error ? (
				<p role="alert" className="px-3 py-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			{!status.installed ? (
				<div className="flex items-center gap-2 px-3 py-2 text-ui text-n-11">
					<span className="flex-1">{o.missing}</span>
					<Button variant="ghost" onClick={() => copyText(status.downloadUrl)}>
						<ClipboardIcon size={14} />
						{o.copyAddress}
					</Button>
				</div>
			) : !status.running ? (
				<p className="px-3 py-2 text-ui text-n-11">{status.message || o.closed}</p>
			) : status.sessions.length === 0 ? (
				<p className="px-3 py-2 text-ui text-n-11">{o.none}</p>
			) : (
				<DataTable label={o.title} columns={columns} data={status.sessions} rowId={(r) => r.id} />
			)}
		</Panel>
	);
}
