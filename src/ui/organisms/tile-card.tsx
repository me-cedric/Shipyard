import { useState } from "react";
import { cn } from "@/lib/utils";
import { IconButton } from "../atoms/icon-button";
import { LockClosedIcon, LockOpenIcon, ViewColumnsIcon } from "../icons";

export type TileLabels = {
	table: string;
	chart: string;
	pin: string;
	unpin: string;
	cut: string;
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
}: {
	title: string;
	data: TileBody | undefined;
	/** The sentence that names a source that is off. */
	offText: string;
	labels: TileLabels;
	pinned?: boolean;
	onPin?: () => void;
	/** Extra controls, left of the pin. */
	actions?: React.ReactNode;
}) {
	const [table, setTable] = useState(false);
	const off = data?.off != null;
	const max = Math.max(1, ...(data?.rows ?? []).map((r) => Number(r[1]) || 0));
	return (
		<section
			aria-label={title}
			aria-disabled={off || undefined}
			className={cn(
				"flex min-h-0 flex-col gap-1 rounded-md border border-n-7 bg-n-2 p-2",
				off && "opacity-60",
			)}
		>
			<header className="flex items-center gap-1">
				<h2 className="min-w-0 flex-1 truncate text-ui font-medium">{title}</h2>
				{actions}
				{off ? null : (
					<IconButton
						label={labels.table}
						aria-pressed={table}
						className="size-6"
						onClick={() => setTable(!table)}
					>
						<ViewColumnsIcon size={12} />
					</IconButton>
				)}
				{onPin ? (
					<IconButton
						label={pinned ? labels.unpin : labels.pin}
						aria-pressed={!!pinned}
						className="size-6"
						onClick={onPin}
					>
						{pinned ? <LockClosedIcon size={12} /> : <LockOpenIcon size={12} />}
					</IconButton>
				) : null}
			</header>
			{off ? (
				<p className="text-ui text-n-11">{offText}</p>
			) : table || data?.columns.length !== 2 ? (
				<table aria-label={`${title}, ${labels.table}`} className="w-full text-left text-12">
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
				<ul aria-label={`${title}, ${labels.chart}`} className="flex flex-col gap-1 text-12">
					{(data?.rows ?? []).map(([name, n]) => (
						<li key={name} className="flex items-center gap-2">
							<span className="w-28 shrink-0 truncate">{name}</span>
							<span aria-hidden="true" className="h-2 flex-1 rounded-sm bg-n-4">
								<span
									className="block h-2 rounded-sm bg-accent"
									style={{ width: `${((Number(n) || 0) / max) * 100}%` }}
								/>
							</span>
							<span className="font-mono">{n}</span>
						</li>
					))}
				</ul>
			)}
			{data?.cut ? <p className="text-12 text-warning-text">{labels.cut}</p> : null}
		</section>
	);
}
