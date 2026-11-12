import {
	type ColumnDef,
	type ColumnSizingState,
	flexRender,
	getCoreRowModel,
	type Row,
	type RowData,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table";
import { Fragment, type ReactNode, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { useViewState } from "@/lib/shell/view-state";
import { cn } from "@/lib/utils";
import { CheckIcon } from "../icons";
import { MenuButton } from "../molecules/menu-button";
import { Splitter } from "../molecules/splitter";
import { VirtualList } from "./virtual-list";

declare module "@tanstack/react-table" {
	// The type parameters must match the library's own.
	interface ColumnMeta<TData extends RowData, TValue> {
		/** A CSS grid track: `6rem`, `1fr`. Default `1fr`. */
		width?: string;
		/** Right-aligned numbers in the mono face. */
		numeric?: boolean;
		/** The cell names its row: a `rowheader`, like `th scope="row"`. */
		rowHeader?: boolean;
		/** Let the cell wrap and show its controls whole: no clip at the edge. */
		wrap?: boolean;
	}
}

/** The list of a `flow` table: every row in normal flow, so a row that wraps pushes the next one down. */
function FlowList<T>({
	items,
	itemKey,
	renderItem,
	header,
	role,
}: {
	items: T[];
	itemKey: (item: T, index: number) => string;
	renderItem: (item: T, index: number) => ReactNode;
	header?: ReactNode;
	role?: "rowgroup";
	// accepted so that both lists take the same props; a flow row needs neither
	isRow?: (item: T) => boolean;
	rowHeight?: number;
}) {
	return (
		<div role={role}>
			{header}
			{items.map((item, i) => (
				<Fragment key={itemKey(item, i)}>{renderItem(item, i)}</Fragment>
			))}
		</div>
	);
}

type Entry<T> = { kind: "group"; id: string; count: number } | { kind: "row"; row: Row<T> };

/**
 * A dense table of 28 px rows on TanStack Table and Virtual. A row opens with Enter or a click.
 * With `group`, a heading with a count shows each time the group changes. With `memory`, a Columns
 * menu hides and shows columns and a handle resizes each one; both stay per project across a restart.
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
	rowHeight,
	memory,
	rowLabel,
	flow,
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
	/** The height of a row in px, when a cell wraps. */
	rowHeight?: number;
	/** The name that keeps the columns of this table. No name, no menu and no resize. */
	memory?: string;
	/** An accessible name for a row, when the text of its cells is not the name. */
	rowLabel?: (row: T) => string;
	/** Rows in normal flow with an automatic height and no virtual list: a small table whose cells wrap. */
	flow?: boolean;
}) {
	const { t } = useI18n();
	const [view, setView] = useViewState<{ hidden: VisibilityState; sizes: ColumnSizingState }>(
		`columns:${memory ?? ""}`,
		{ hidden: {}, sizes: {} },
	);
	// The width of a header cell with no saved size, so the first resize starts from it.
	const [cells, setCells] = useState<Record<string, number>>({});
	const table = useReactTable({
		data,
		columns,
		getRowId: rowId,
		getCoreRowModel: getCoreRowModel(),
		state: { columnVisibility: view.hidden, columnSizing: view.sizes },
		onColumnVisibilityChange: (u) =>
			setView({ ...view, hidden: typeof u === "function" ? u(view.hidden) : u }),
		onColumnSizingChange: (u) =>
			setView({ ...view, sizes: typeof u === "function" ? u(view.sizes) : u }),
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
		.map((c) => (view.sizes[c.id] ? `${view.sizes[c.id]}px` : (c.columnDef.meta?.width ?? "1fr")))
		.join(" ");
	const grid = { gridTemplateColumns: tracks };

	const named = table
		.getAllLeafColumns()
		.filter((c) => typeof c.columnDef.header === "string" && c.columnDef.header !== "");
	const List = flow ? FlowList : VirtualList;
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{memory ? (
				<div className="flex justify-end border-b px-3 py-1">
					<MenuButton
						label={t.ui.columns}
						items={named.map((c) => ({
							id: c.id,
							label: String(c.columnDef.header),
							checked: c.getIsVisible(),
							icon: c.getIsVisible() ? <CheckIcon size={12} /> : undefined,
							// the last visible column stays: a table with no column shows nothing
							disabled: c.getIsVisible() && table.getVisibleLeafColumns().length === 1,
							onSelect: () => c.toggleVisibility(),
						}))}
					/>
				</div>
			) : null}
			<div role="table" aria-label={label} className="flex min-h-0 flex-1 flex-col">
				<List
					role="rowgroup"
					items={entries}
					itemKey={(e) => (e.kind === "group" ? `g:${e.id}` : e.row.id)}
					isRow={(e) => e.kind === "row"}
					rowHeight={rowHeight}
					header={
						<div role="row" style={grid} className="grid h-row items-center gap-3 border-b px-3">
							{table.getHeaderGroups().flatMap((hg) =>
								hg.headers.map((h) => (
									<div
										key={h.id}
										ref={(el) => {
											const w = el?.offsetWidth;
											if (w && cells[h.id] !== w) setCells((m) => ({ ...m, [h.id]: w }));
										}}
										// An empty header (a status dot, an action) is a plain cell: axe rejects a nameless columnheader.
										role={h.column.columnDef.header === "" ? "cell" : "columnheader"}
										title={
											typeof h.column.columnDef.header === "string"
												? h.column.columnDef.header
												: undefined
										}
										className={cn(
											"relative truncate text-12 font-medium text-n-11",
											h.column.columnDef.meta?.numeric && "text-right",
										)}
									>
										{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
										{memory && typeof h.column.columnDef.header === "string" ? (
											<Splitter
												label={format(t.ui.columnWidth, { name: h.column.columnDef.header })}
												value={view.sizes[h.id] ?? cells[h.id] ?? 120}
												min={48}
												max={600}
												onChange={(size) =>
													table.setColumnSizing((all) => ({ ...all, [h.id]: size }))
												}
												onReset={() => table.setColumnSizing(({ [h.id]: _gone, ...rest }) => rest)}
												className="top-0 right-0 w-1"
											/>
										) : null}
									</div>
								)),
							)}
						</div>
					}
					renderItem={(e) => {
						if (e.kind === "group")
							return (
								<div role="row" className="flex h-row items-center border-b bg-n-2 px-3">
									<div role="cell">
										<h2 className="text-12 font-medium text-n-11">
											{format(t.count, { name: groupLabel?.(e.id) ?? e.id, count: e.count })}
										</h2>
									</div>
								</div>
							);
						const original = e.row.original;
						const id = rowId(original);
						return (
							<div
								role="row"
								aria-label={rowLabel?.(original)}
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
								style={rowHeight ? { ...grid, height: rowHeight } : grid}
								className={cn(
									"grid h-row items-center gap-3 border-b px-3",
									onOpen && "cursor-pointer hover:bg-n-3",
									selected === id && "bg-n-4",
								)}
							>
								{e.row.getVisibleCells().map((cell) => (
									<div
										key={cell.id}
										role={cell.column.columnDef.meta?.rowHeader ? "rowheader" : "cell"}
										className={cn(
											"min-w-0 text-ui",
											!cell.column.columnDef.meta?.wrap && "truncate",
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
						{footer
							.map((cell, i) => ({ cell, i }))
							.filter(({ i }) => table.getAllLeafColumns()[i]?.getIsVisible() ?? true)
							.map(({ cell, i }) => (
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
		</div>
	);
}
