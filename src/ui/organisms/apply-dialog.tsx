import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import { Badge } from "../atoms/badge";
import { Button } from "../atoms/button";
import { type Status, StatusDot } from "../atoms/status-dot";
import { DataTable } from "./data-table";
import { Dialog } from "./dialog";

export type ApplyAction = "create" | "update" | "unchanged";

/** One ticket that the sheets ask for. */
export type ApplyPreviewRow = {
	reference: string;
	kind: "epic" | "story";
	title: string;
	/** The estimate of a story, in days. It comes from the sheet. */
	days?: number | null;
	action: ApplyAction;
	/** The names of the fields that differ, for an update. */
	changes: string[];
	key?: string | null;
};

/** What the tracker answered for one row, after the apply. */
export type ApplyResult = {
	reference: string;
	/** What the apply did with the row. */
	action: ApplyAction;
	key?: string | null;
	error?: string | null;
	/** The fields that this tracker cannot hold. */
	skipped: string[];
};

type Line = ApplyPreviewRow & { group: Group; detail: string };
type Group = ApplyAction | "written" | "failed";

const ORDER: Group[] = ["failed", "written", "create", "update", "unchanged"];
const DOT: Record<Group, Status> = {
	create: "info",
	update: "warning",
	unchanged: "idle",
	written: "success",
	failed: "danger",
};

/**
 * The rows that an apply would write, with nothing written. After the person applies, each row
 * shows its result. A failed row never undoes the rows before it.
 */
export function ApplyDialog({
	open,
	onOpenChange,
	title,
	rows,
	results,
	busy,
	error,
	onApply,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	rows: ApplyPreviewRow[];
	results?: ApplyResult[];
	busy?: boolean;
	error?: string | null;
	onApply: () => void;
}) {
	const { t } = useI18n();
	const a = t.work.apply;
	const lines = useMemo<Line[]>(() => {
		const byRef = new Map((results ?? []).map((r) => [r.reference, r]));
		return rows
			.map((row): Line => {
				const res = byRef.get(row.reference);
				if (!res)
					return {
						...row,
						group: row.action,
						detail: row.changes.map((f) => a.field[f as keyof typeof a.field] ?? f).join(", "),
					};
				const skipped = res.skipped.map((f) => a.field[f as keyof typeof a.field] ?? f).join(", ");
				return {
					...row,
					key: res.key ?? row.key,
					group: res.error ? "failed" : res.action === "unchanged" ? "unchanged" : "written",
					detail: res.error ?? (skipped ? `${a.skipped}: ${skipped}` : ""),
				};
			})
			.sort((x, y) => ORDER.indexOf(x.group) - ORDER.indexOf(y.group));
	}, [rows, results, a]);

	const columns = useMemo<ColumnDef<Line>[]>(
		() => [
			{
				id: "state",
				header: "",
				meta: { width: "1rem" },
				cell: ({ row }) => (
					<StatusDot status={DOT[row.original.group]} label={a.group[row.original.group]} />
				),
			},
			{
				id: "kind",
				header: a.kind,
				meta: { width: "4.5rem" },
				cell: ({ row }) => <Badge>{a.kinds[row.original.kind]}</Badge>,
			},
			{ id: "title", header: a.name, cell: ({ row }) => row.original.title },
			{
				id: "days",
				header: a.days,
				meta: { width: "4rem", numeric: true },
				cell: ({ row }) => (row.original.days == null ? "" : String(row.original.days)),
			},
			{
				id: "key",
				header: a.ticket,
				meta: { width: "6rem" },
				cell: ({ row }) => <span className="font-mono text-11">{row.original.key ?? ""}</span>,
			},
			{
				id: "detail",
				header: a.detail,
				meta: { width: "12rem" },
				cell: ({ row }) => (
					<span className={row.original.group === "failed" ? "text-danger-text" : "text-n-11"}>
						{row.original.detail}
					</span>
				),
			},
		],
		[a],
	);

	const todo = rows.filter((r) => r.action !== "unchanged").length;
	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			title={title}
			wide
			actions={
				results ? null : (
					<Button variant="primary" disabled={busy || todo === 0} onClick={onApply}>
						{a.apply}
					</Button>
				)
			}
		>
			<div className="flex h-72 flex-col rounded-md border border-n-7 bg-n-1">
				<DataTable
					label={title}
					data={lines}
					columns={columns}
					rowId={(r) => r.reference}
					group={(r) => r.group}
					groupLabel={(g) => a.group[g as Group]}
				/>
			</div>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</Dialog>
	);
}
