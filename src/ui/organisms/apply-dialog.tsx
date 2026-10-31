import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { Badge } from "../atoms/badge";
import { Button } from "../atoms/button";
import { Checkbox } from "../atoms/checkbox";
import { Input } from "../atoms/input";
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

/** `typed` and `days` are the text of the two fields of a row in review. They sit in the row so the table keeps its cells while a person types. */
type Line = ApplyPreviewRow & {
	group: Group;
	detail: string;
	dropped: boolean;
	typed: string;
	typedDays: string;
};
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
 * shows its result. A failed row never undoes the rows before it. With `review`, each row to write
 * can be approved, edited (title and days) or dropped before the write: `onApply` gets the rows
 * that stay, as the person edited them.
 */
export function ApplyDialog({
	open,
	onOpenChange,
	title,
	rows,
	results,
	busy,
	error,
	review,
	onApply,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	rows: ApplyPreviewRow[];
	results?: ApplyResult[];
	busy?: boolean;
	error?: string | null;
	review?: boolean;
	onApply: (rows: ApplyPreviewRow[]) => void;
}) {
	const { t } = useI18n();
	const a = t.work.apply;
	const r = t.review.apply;
	const [dropped, setDropped] = useState<string[]>([]);
	const [edits, setEdits] = useState<Record<string, { title?: string; days?: string }>>({});
	const editable = Boolean(review) && !results;
	const edit = useCallback(
		(ref: string, patch: { title?: string; days?: string }) =>
			setEdits((all) => ({ ...all, [ref]: { ...all[ref], ...patch } })),
		[],
	);
	const toggle = useCallback(
		(ref: string, on: boolean) =>
			setDropped((d) => (on ? d.filter((x) => x !== ref) : [...d, ref])),
		[],
	);
	/** The rows that stay, with the title and days that the person typed. */
	const approved = rows
		.filter((x) => x.action !== "unchanged" && !dropped.includes(x.reference))
		.map((x) => {
			const e = edits[x.reference];
			const days = e?.days === undefined ? x.days : e.days === "" ? null : Number(e.days);
			return { ...x, title: e?.title ?? x.title, days };
		});
	const lines = useMemo<Line[]>(() => {
		const byRef = new Map((results ?? []).map((r) => [r.reference, r]));
		return rows
			.filter((row) => !(review && results) || byRef.has(row.reference))
			.map((row): Line => {
				const res = byRef.get(row.reference);
				const own = {
					dropped: dropped.includes(row.reference),
					typed: edits[row.reference]?.title ?? row.title,
					typedDays: edits[row.reference]?.days ?? String(row.days ?? ""),
				};
				if (!res)
					return {
						...row,
						...own,
						group: row.action,
						detail: row.changes.map((f) => a.field[f as keyof typeof a.field] ?? f).join(", "),
					};
				const skipped = res.skipped.map((f) => a.field[f as keyof typeof a.field] ?? f).join(", ");
				return {
					...row,
					...own,
					key: res.key ?? row.key,
					group: res.error ? "failed" : res.action === "unchanged" ? "unchanged" : "written",
					detail: res.error ?? (skipped ? `${a.skipped}: ${skipped}` : ""),
				};
			})
			.sort((x, y) => ORDER.indexOf(x.group) - ORDER.indexOf(y.group));
	}, [rows, results, a, review, dropped, edits]);

	const columns = useMemo<ColumnDef<Line>[]>(
		() => [
			...(editable
				? [
						{
							id: "approve",
							header: "",
							meta: { width: "2rem" },
							cell: ({ row }: { row: { original: Line } }) =>
								row.original.action === "unchanged" ? null : (
									<Checkbox
										hideLabel
										label={format(r.write, { name: row.original.title })}
										checked={!row.original.dropped}
										onCheckedChange={(on) => toggle(row.original.reference, on)}
									/>
								),
						},
					]
				: []),
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
			{
				id: "title",
				header: a.name,
				cell: ({ row }) => {
					const x = row.original;
					if (!editable || x.action === "unchanged") return x.title;
					return (
						<Input
							label={format(r.title, { name: x.title })}
							value={x.typed}
							onChange={(e) => edit(x.reference, { title: e.target.value })}
						/>
					);
				},
			},
			{
				id: "days",
				header: a.days,
				meta: { width: editable ? "6rem" : "4rem", numeric: true },
				cell: ({ row }) => {
					const x = row.original;
					if (!editable || x.action === "unchanged" || x.kind !== "story")
						return x.days == null ? "" : String(x.days);
					return (
						<Input
							type="number"
							min={0}
							step={0.5}
							label={format(r.days, { name: x.title })}
							value={x.typedDays}
							onChange={(e) => edit(x.reference, { days: e.target.value })}
						/>
					);
				},
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
		[a, r, editable, edit, toggle],
	);

	const todo = approved.length;
	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			title={title}
			wide
			actions={
				results ? null : (
					<Button variant="primary" disabled={busy || todo === 0} onClick={() => onApply(approved)}>
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
