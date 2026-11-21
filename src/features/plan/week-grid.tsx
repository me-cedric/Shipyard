import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { useRights } from "@/lib/rights";
import { addDays, formatMinutes, isoWeekday } from "@/lib/work";
import { Input } from "@/ui/atoms/input";
import { LinkButton } from "@/ui/atoms/link-button";
import { StatusDot } from "@/ui/atoms/status-dot";
import { Card } from "@/ui/molecules/card";
import { usePlainDay } from "./capacity";

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

const firstLine = (s: string) => s.split("\n")[0] ?? "";

/**
 * Plan / Time: the hours of one week, a row for each ticket and a column for each working day
 * (`spec:app-redesign#REQ-019`). A cell with one entry or none is a field: a new value adds or
 * changes the entry, an empty value deletes it. A cell with more entries shows their sum: the list
 * of the entries changes each of them. The weekend shows on request, when it has entries.
 */
export function WeekGrid({
	week,
	entries,
	undone,
	nameOf,
	onChange,
	onNote,
	onAdd,
}: {
	/** The Monday of the week. */
	week: string;
	entries: WeekEntry[];
	/** The cell (`ticket|day`) whose change did not go through. A new `n` makes its field show the stored hours again. */
	undone: { cell: string; n: number };
	/** The title of a ticket, for its key. */
	nameOf: (ticket: string) => string;
	onChange: (ticket: string, day: string, entry: WeekEntry | null, text: string) => void;
	/** A new first line for the note of each entry of a row. */
	onNote: (row: WeekEntry[], text: string) => void;
	onAdd: () => void;
}) {
	const { t, lang } = useI18n();
	const p = t.planPlace;
	const plain = usePlainDay();
	const { can } = useRights();
	const [weekend, setWeekend] = useState(false);
	const all = Array.from({ length: 7 }, (_, i) => addDays(week, i));
	const mine = entries.filter((x) => all.includes(x.day));
	const hasWeekend = mine.some((x) => isoWeekday(x.day) > 5);
	const days = weekend && hasWeekend ? all : all.slice(0, 5);
	// A row for each ticket of the week. The entries with no ticket are the last row.
	const tickets = [...new Set(mine.map((x) => x.ticket))].sort(
		(a, b) => Number(!a) - Number(!b) || a.localeCompare(b),
	);
	const sum = (list: WeekEntry[]) => list.reduce((n, x) => n + x.minutes, 0);
	const weekday = (d: string, form: "short" | "long") =>
		new Date(`${d}T00:00:00Z`).toLocaleDateString(lang, { weekday: form, timeZone: "UTC" });
	const title = format(p.week, { day: plain(week) });
	const edit = can("work.edit");
	return (
		<Card role="region" aria-label={title} className="shrink-0 overflow-x-auto px-6 py-2">
			<table aria-label={title} className="w-full min-w-170">
				<thead>
					<tr className="h-11 text-13 text-n-10">
						<td />
						{days.map((d) => (
							<th key={d} scope="col" className="w-18 font-semibold">
								{weekday(d, "short")}
							</th>
						))}
						<th scope="col" className="w-16 text-right font-semibold">
							{p.time.total}
						</th>
					</tr>
				</thead>
				<tbody>
					{tickets.map((ticket) => {
						const row = mine.filter((x) => x.ticket === ticket);
						const name = ticket ? nameOf(ticket) : t.work.time.noTicket;
						const note = firstLine(row[0]?.note ?? "");
						return (
							<tr key={ticket} className="h-17 border-t border-n-6">
								<th scope="row" className="text-left font-semibold">
									<span className="flex items-center gap-2.5 pr-2.5">
										<span className="max-w-60 truncate" title={ticket || undefined}>
											{name}
										</span>
										<Input
											// The stored note shows again after a change.
											key={note}
											label={format(p.time.noteFor, { ticket: name })}
											placeholder={t.work.time.note}
											disabled={!edit}
											defaultValue={note}
											className="min-w-24 flex-1 font-normal"
											onKeyDown={(ev) => ev.key === "Enter" && ev.currentTarget.blur()}
											onBlur={(ev) => {
												if (ev.target.value !== note) onNote(row, ev.target.value);
											}}
										/>
									</span>
								</th>
								{days.map((d) => {
									const cell = row.filter((x) => x.day === d);
									const one = cell[0] ?? null;
									return (
										<td key={d} className="relative px-1 text-center">
											{cell.length > 1 ? (
												formatMinutes(sum(cell))
											) : (
												<Input
													// The stored hours show again after a change, also a refused one.
													key={`${one?.id}:${one?.minutes}:${undone.cell === `${ticket}|${d}` ? undone.n : 0}`}
													label={format(p.hours, {
														ticket: name,
														day: `${weekday(d, "long")} ${plain(d)}`,
													})}
													placeholder="0"
													inputMode="decimal"
													disabled={!edit}
													defaultValue={one ? formatMinutes(one.minutes) : ""}
													className="w-16 px-1 text-center"
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
													label={t.work.time.state["to-send"]}
													className="absolute top-3 right-0 size-2"
												/>
											) : null}
										</td>
									);
								})}
								<td className="text-right font-semibold">{formatMinutes(sum(row))}</td>
							</tr>
						);
					})}
				</tbody>
				<tfoot>
					<tr className="h-17 border-t border-n-6">
						<td colSpan={days.length + 1}>
							<span className="flex items-center gap-6">
								<LinkButton disabled={!edit} onClick={onAdd}>
									{p.time.addTicket}
								</LinkButton>
								{hasWeekend ? (
									<LinkButton aria-pressed={weekend} onClick={() => setWeekend(!weekend)}>
										{p.time.weekend}
									</LinkButton>
								) : null}
							</span>
						</td>
						<td className="text-right font-semibold">{formatMinutes(sum(mine))}</td>
					</tr>
				</tfoot>
			</table>
		</Card>
	);
}
