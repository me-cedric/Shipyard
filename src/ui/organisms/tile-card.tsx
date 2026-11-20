import { Menu } from "@base-ui/react/menu";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "../atoms/button";
import { MenuList } from "../molecules/menu-button";
import { type Chart, TileChart } from "./tile-chart";

export type TileLabels = {
	table: string;
	chart: string;
	pin: string;
	unpin: string;
	cut: string;
	/** The name of the menu of a tile, before its title. */
	more: string;
	/** The name of each chart kind, for the accessible name of a chart. */
	charts: Record<Chart, string>;
};
export type TileBody = {
	columns: string[];
	rows: string[][];
	cut: boolean;
	/** The name of the source when it is not available. */
	off: string | null;
};

/**
 * One tile of a dashboard: bars for a count column, or the table behind them. A tile whose source
 * is off stays visible and greyed. A cut answer says so (knowledge REQ-023).
 */
export function TileCard({
	title,
	data,
	offText,
	labels,
	pinned,
	onPin,
	actions,
	lead,
	edit,
	chart = "bars",
}: {
	title: string;
	data: TileBody | undefined;
	/** The chart kind: bars when a tile names none. */
	chart?: Chart;
	/** The sentence that names a source that is off. */
	offText: string;
	labels: TileLabels;
	pinned?: boolean;
	onPin?: () => void;
	/** Extra controls, after the title. */
	actions?: React.ReactNode;
	/** A part before the title: the drag handle. */
	lead?: React.ReactNode;
	/** The tile of the edit page: a dashed outline. */
	edit?: boolean;
}) {
	const [table, setTable] = useState(false);
	const off = data?.off != null;
	return (
		<section
			aria-label={title}
			aria-disabled={off || undefined}
			className={cn(
				"flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-lg bg-surface-2 px-6 py-5.5 shadow-2",
				edit && "outline-2 outline-n-8 outline-dashed",
				off && "opacity-60",
			)}
		>
			<header className="flex shrink-0 items-center gap-2">
				{lead}
				<h2
					className={cn(
						"min-w-0 flex-1 text-n-12",
						// In edit mode the title wraps to two lines beside the handle and the two buttons.
						edit
							? "line-clamp-2 break-words text-15 font-semibold"
							: "truncate text-17 font-semibold",
					)}
				>
					{title}
				</h2>
				{actions}
				{/* Show as table and the pin: one quiet menu, so that a tile in read mode has no icon row. */}
				{/* Edit mode shows Settings and Remove only: the menu stays in read mode. */}
				{edit || (off && !onPin) ? null : (
					<Menu.Root>
						<Menu.Trigger
							render={
								<Button
									variant="ghost"
									className="px-2.5"
									aria-label={`${labels.more} ${title}`}
									title={`${labels.more} ${title}`}
								/>
							}
						>
							<svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="currentColor">
								<circle cx="3" cy="8" r="1.25" />
								<circle cx="8" cy="8" r="1.25" />
								<circle cx="13" cy="8" r="1.25" />
							</svg>
						</Menu.Trigger>
						<MenuList
							items={[
								...(off
									? []
									: [
											{
												id: "table",
												label: labels.table,
												checked: table,
												onSelect: () => setTable(!table),
											},
										]),
								...(onPin
									? [{ id: "pin", label: pinned ? labels.unpin : labels.pin, onSelect: onPin }]
									: []),
							]}
						/>
					</Menu.Root>
				)}
			</header>
			{/* tabIndex 0: a keyboard reader scrolls the body. */}
			<div
				// biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region needs focus.
				tabIndex={0}
				className={cn(
					"flex min-h-0 flex-1 flex-col overflow-y-auto rounded-md border border-n-7 border-dashed bg-n-2 p-3",
				)}
			>
				{off ? (
					<p className="text-ui text-n-11">{offText}</p>
				) : table || data?.columns.length !== 2 ? (
					<table aria-label={`${title}, ${labels.table}`} className="w-full text-left text-13">
						<thead>
							<tr className="border-b text-n-11">
								{(data?.columns ?? []).map((c) => (
									<th key={c} className="py-0.5 font-medium">
										{c}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{(data?.rows ?? []).map((r) => (
								<tr key={r.join("\u0000")} className="border-b">
									{r.map((c, i) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: the cells never reorder
										<td key={i} className="py-0.5">
											{c}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				) : (
					<TileChart
						chart={chart}
						title={title}
						rows={data?.rows ?? []}
						names={labels.charts}
						barsName={`${title}, ${labels.chart}`}
					/>
				)}
			</div>
			{data?.cut ? <p className="text-12 text-warning-text">{labels.cut}</p> : null}
		</section>
	);
}
