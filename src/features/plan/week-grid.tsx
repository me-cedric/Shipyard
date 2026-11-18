import { format, useI18n } from "@/lib/i18n";
import { useDay } from "@/lib/prefs";
import { useRights } from "@/lib/rights";
import { addDays, formatMinutes } from "@/lib/work";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ChevronLeftIcon, ChevronRightIcon } from "@/ui/icons";

/** One entry of the week: what a cell needs to show it and to change it. */
export type WeekEntry = {
	id: string;
	day: string;
	ticket: string;
	minutes: number;
	/** The whole note: a change of the hours must send it again. */
	note: string;
	/** The issue tracker does not hold the entry as written here. */
	pending: boolean;
};

/**
 * Plan / Time: the hours of one week, a row for each ticket and a column for each day
 * (`spec:app-redesign#REQ-019`). A cell with one entry or none is a field: a new value adds or
 * changes the entry, an empty value deletes it. A cell with more entries shows their sum: the list
 * of the month changes each of them.
 */
export function WeekGrid({
	week,
	entries,
	undone,
	onWeek,
	onChange,
}: {
	/** The Monday of the week. */
	week: string;
	entries: WeekEntry[];
	/** The cell (`ticket|day`) whose change did not go through. A new `n` makes its field show the stored hours again. */
	undone: { cell: string; n: number };
	onWeek: (week: string) => void;
	onChange: (ticket: string, day: string, entry: WeekEntry | null, text: string) => void;
}) {
	const { t, lang } = useI18n();
	const p = t.planPlace;
	const e = t.work.time;
	const day = useDay();
	const { can } = useRights();
	const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
	const mine = entries.filter((x) => days.includes(x.day));
	// A row for each ticket of the week. The entries with no ticket are the last row.
	const tickets = [...new Set(mine.map((x) => x.ticket))].sort(
		(a, b) => Number(!a) - Number(!b) || a.localeCompare(b),
	);
	const sum = (list: WeekEntry[]) => list.reduce((n, x) => n + x.minutes, 0);
	const title = format(p.week, { day: day(week) });
	return (
		<section aria-label={title} className="rounded-xl border bg-surface-1 px-4 py-3 shadow-1">
			<div className="flex items-center gap-2 pb-2">
				<IconButton
					className="size-(--control-h)"
					label={p.previousWeek}
					onClick={() => onWeek(addDays(week, -7))}
				>
					<ChevronLeftIcon size={14} />
				</IconButton>
				<h2 className="text-16 font-semibold text-n-12">{title}</h2>
				<IconButton
					className="size-(--control-h)"
					label={p.nextWeek}
					onClick={() => onWeek(addDays(week, 7))}
				>
					<ChevronRightIcon size={14} />
				</IconButton>
			</div>
			<div className="overflow-x-auto">
				<table aria-label={title} className="w-full text-ui">
					<thead>
						<tr className="text-12 text-n-11">
							<th scope="col" className="text-left font-medium">
								{e.ticket}
							</th>
							{days.map((d) => (
								<th key={d} scope="col" className="w-20 px-1 font-medium">
									{new Date(`${d}T00:00:00Z`).toLocaleDateString(lang, {
										weekday: "short",
										day: "numeric",
										timeZone: "UTC",
									})}
								</th>
							))}
							<th scope="col" className="w-20 text-right font-medium">
								{e.duration}
							</th>
						</tr>
					</thead>
					<tbody>
						{tickets.map((ticket) => {
							const row = mine.filter((x) => x.ticket === ticket);
							const name = ticket || e.noTicket;
							return (
								<tr key={ticket} className="border-t">
									<th scope="row" className="py-1 text-left font-mono text-12 font-medium">
										{name}
									</th>
									{days.map((d) => {
										const cell = row.filter((x) => x.day === d);
										const one = cell[0] ?? null;
										return (
											<td key={d} className="px-1 py-1 text-center">
												<span className="flex items-center justify-center gap-1">
													{cell.length > 1 ? (
														<span className="font-mono">{formatMinutes(sum(cell))}</span>
													) : (
														<Input
															// The stored hours show again after a change, also a refused one.
															key={`${one?.id}:${one?.minutes}:${undone.cell === `${ticket}|${d}` ? undone.n : 0}`}
															label={format(p.hours, { ticket: name, day: d })}
															disabled={!can("work.edit")}
															defaultValue={one ? formatMinutes(one.minutes) : ""}
															className="min-h-control w-16 text-center font-mono"
															onKeyDown={(ev) => ev.key === "Enter" && ev.currentTarget.blur()}
															onBlur={(ev) => {
																const text = ev.target.value.trim();
																if (text !== (one ? formatMinutes(one.minutes) : ""))
																	onChange(ticket, d, one, text);
															}}
														/>
													)}
													{cell.some((x) => x.pending) ? (
														<StatusDot
															status="warning"
															label={e.state["to-send"]}
															className="size-2"
														/>
													) : null}
												</span>
											</td>
										);
									})}
									<td className="text-right font-mono">{formatMinutes(sum(row))}</td>
								</tr>
							);
						})}
					</tbody>
					<tfoot>
						<tr className="border-t text-n-11">
							<td />
							{days.map((d) => (
								<td key={d} className="py-1 text-center font-mono text-12">
									{formatMinutes(sum(mine.filter((x) => x.day === d)))}
								</td>
							))}
							<td className="text-right font-mono font-semibold text-n-12">
								{formatMinutes(sum(mine))}
							</td>
						</tr>
					</tfoot>
				</table>
			</div>
		</section>
	);
}
