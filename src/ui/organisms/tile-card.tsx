import { useState } from "react";
import { cn } from "@/lib/utils";
import { MenuButton } from "../molecules/menu-button";

export type TileLabels = {
	table: string;
	chart: string;
	pin: string;
	unpin: string;
	cut: string;
	/** The name of the menu of a tile, before its title. */
	more: string;
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
}: {
	title: string;
	data: TileBody | undefined;
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
	const counts = (data?.rows ?? []).map((r) => Number(r[1]) || 0);
	const max = Math.max(1, ...counts);
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
						"min-w-0 flex-1 truncate text-n-12",
						edit ? "text-14 font-semibold" : "text-17 font-semibold",
					)}
				>
					{title}
				</h2>
				{actions}
				{/* Show as table and the pin: one quiet menu, so that a tile in read mode has no icon row. */}
				{off && !onPin ? null : (
					<MenuButton
						iconOnly
						label={`${labels.more} ${title}`}
						icon={
							<svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="currentColor">
								<circle cx="3" cy="8" r="1.25" />
								<circle cx="8" cy="8" r="1.25" />
								<circle cx="13" cy="8" r="1.25" />
							</svg>
						}
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
				)}
			</header>
			{/* tabIndex 0: a keyboard reader scrolls the body. */}
			<div
				// biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region needs focus.
				tabIndex={0}
				className={cn(
					"flex min-h-0 flex-1 flex-col overflow-y-auto",
					edit && "rounded-md border border-n-7 border-dashed bg-n-2 p-3",
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
					<ul aria-label={`${title}, ${labels.chart}`} className="flex flex-col gap-2 text-13">
						{(data?.rows ?? []).map(([name, n]) => (
							<li key={name} className="flex items-center gap-2">
								<span className="w-28 shrink-0 truncate text-n-10">{name}</span>
								<span aria-hidden="true" className="h-2 flex-1 rounded-full bg-n-4">
									<span
										className="block h-2 rounded-full bg-accent"
										style={{ width: `${((Number(n) || 0) / max) * 100}%` }}
									/>
								</span>
								<span className="w-8 text-right font-semibold text-n-12">{n}</span>
							</li>
						))}
					</ul>
				)}
			</div>
			{data?.cut ? <p className="text-12 text-warning-text">{labels.cut}</p> : null}
		</section>
	);
}
