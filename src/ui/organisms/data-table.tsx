import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	type Row,
	type RowData,
	useReactTable,
} from "@tanstack/react-table";
import type { ReactNode } from "react";
import { format, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { VirtualList } from "./virtual-list";

declare module "@tanstack/react-table" {
	// The type parameters must match the library's own.
	interface ColumnMeta<TData extends RowData, TValue> {
		/** A CSS grid track: `6rem`, `1fr`. Default `1fr`. */
		width?: string;
		/** Right-aligned numbers in the mono face. */
		numeric?: boolean;
	}
}

type Entry<T> = { kind: "group"; id: string; count: number } | { kind: "row"; row: Row<T> };

/**
 * A dense table of 28 px rows on TanStack Table and Virtual. A row opens with Enter or a click.
 * With `group`, a heading with a count shows each time the group changes.
 */
export function DataTable<T extends RowData>({
	columns,
	data,
	rowId,
	label,
	group,
	groupLabel,
	onOpen,
	selected,
	footer,
}: {
	columns: ColumnDef<T>[];
	data: T[];
	rowId: (row: T) => string;
	label: string;
	group?: (row: T) => string;
	groupLabel?: (group: string) => string;
	onOpen?: (row: T) => void;
	selected?: string | null;
	/** The cells of a last row outside the scroll, one for each column: the totals. */
	footer?: ReactNode[];
}) {
	const { t } = useI18n();
	const table = useReactTable({
		data,
		columns,
		getRowId: rowId,
		getCoreRowModel: getCoreRowModel(),
	});
	const rows = table.getRowModel().rows;
	const entries: Entry<T>[] = [];
	const counts = new Map<string, number>();
	if (group)
		for (const r of rows) counts.set(group(r.original), (counts.get(group(r.original)) ?? 0) + 1);
	let last: string | null = null;
	for (const r of rows) {
		const g = group?.(r.original) ?? null;
		if (g !== null && g !== last) entries.push({ kind: "group", id: g, count: counts.get(g) ?? 0 });
		last = g;
		entries.push({ kind: "row", row: r });
	}
	const tracks = table
		.getVisibleLeafColumns()
		.map((c) => c.columnDef.meta?.width ?? "1fr")
		.join(" ");
	const grid = { gridTemplateColumns: tracks };

	return (
		<div role="table" aria-label={label} className="flex min-h-0 flex-1 flex-col">
			<VirtualList
				items={entries}
				itemKey={(e) => (e.kind === "group" ? `g:${e.id}` : e.row.id)}
				isRow={(e) => e.kind === "row"}
				header={
					<div role="row" style={grid} className="grid h-row items-center gap-3 border-b px-3">
						{table.getHeaderGroups().flatMap((hg) =>
							hg.headers.map((h) => (
								<div
									key={h.id}
									role="columnheader"
									className={cn(
										"truncate text-12 font-medium text-n-11",
										h.column.columnDef.meta?.numeric && "text-right",
									)}
								>
									{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
								</div>
							)),
						)}
					</div>
				}
				renderItem={(e) => {
					if (e.kind === "group")
						return (
							<div className="flex h-row items-center border-b bg-n-2 px-3">
								<h3 className="text-12 font-medium text-n-11">
									{format(t.count, { name: groupLabel?.(e.id) ?? e.id, count: e.count })}
								</h3>
							</div>
						);
					const original = e.row.original;
					const id = rowId(original);
					return (
						<div
							role="row"
							data-nav={onOpen ? "" : undefined}
							tabIndex={onOpen ? 0 : undefined}
							aria-current={selected === id ? "true" : undefined}
							onClick={onOpen ? () => onOpen(original) : undefined}
							onKeyDown={
								onOpen
									? (ev) => {
											if (ev.key === "Enter" || ev.key === " ") {
												ev.preventDefault();
												onOpen(original);
											}
										}
									: undefined
							}
							style={grid}
							className={cn(
								"grid h-row items-center gap-3 border-b px-3",
								onOpen && "cursor-default hover:bg-n-3",
								selected === id && "bg-n-4",
							)}
						>
							{e.row.getVisibleCells().map((cell) => (
								<div
									key={cell.id}
									role="cell"
									className={cn(
										"min-w-0 truncate text-ui",
										cell.column.columnDef.meta?.numeric && "text-right font-mono",
									)}
								>
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
								</div>
							))}
						</div>
					);
				}}
			/>
			{footer ? (
				<div
					role="row"
					style={grid}
					className="grid h-row items-center gap-3 border-t px-3 font-medium"
				>
					{footer.map((cell, i) => (
						<div
							key={columns[i]?.id ?? i}
							role="cell"
							className={cn("truncate text-ui", i > 0 && "text-right font-mono")}
						>
							{cell}
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}
