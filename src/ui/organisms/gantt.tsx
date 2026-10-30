import { type PointerEvent, useRef, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { addDays, diffDays, isoWeekday } from "@/lib/work/dates";
import { Tooltip } from "../atoms/tooltip";
import { VirtualList } from "./virtual-list";

export type GanttBar = {
	id: string;
	name: string;
	/** The feature. A heading with a count shows each time it changes. */
	group: string;
	/** The member. Each member has one tone. */
	owner?: string;
	/** `YYYY-MM-DD`, both ends included. */
	start: string;
	end: string;
	/** A person fixed the start. */
	fixed?: boolean;
};

type Entry = { kind: "group"; id: string; count: number } | { kind: "bar"; bar: GanttBar };

const LABEL = 224;
const TONES = [
	"border-accent/60 bg-accent-subtle text-accent-text",
	"border-success/60 bg-success-subtle text-success-text",
	"border-warning/60 bg-warning-subtle text-warning-text",
	"border-info/60 bg-info-subtle text-info-text",
] as const;
const UNSTAFFED = "border-dashed border-n-8 bg-n-4 text-n-11";

/** A drag of fewer pixels is a click. */
const DRAG = 4;

/** The used share of the capacity of each day, by `YYYY-MM-DD`. Above 1 is over capacity. */
export type Band = Record<string, number>;

const bandTone = (ratio: number) =>
	ratio > 1 + 1e-6 ? "bg-danger" : ratio >= 1 - 1e-6 ? "bg-accent" : "bg-accent/40";

/** One strip of load: a cell for each day with work, red over capacity. */
function LoadStrip({
	band,
	x,
	dayWidth,
}: {
	band: Band;
	x: (day: string) => number;
	dayWidth: number;
}) {
	return (
		<>
			{Object.entries(band).map(([day, ratio]) => (
				<span
					key={day}
					aria-hidden="true"
					data-over={ratio > 1 + 1e-6 || undefined}
					className={cn("absolute bottom-0 h-1", bandTone(ratio))}
					style={{ left: x(day), width: Math.max(1, dayWidth - 1) }}
				/>
			))}
		</>
	);
}

function BarButton({
	bar,
	tone,
	left,
	width,
	dayWidth,
	name,
	selected,
	onMove,
	onOpen,
}: {
	bar: GanttBar;
	tone: string;
	left: number;
	width: number;
	dayWidth: number;
	name: string;
	selected: boolean;
	onMove: (days: number) => void;
	onOpen: () => void;
}) {
	const [dx, setDx] = useState(0);
	const drag = useRef<{ x: number; moved: boolean } | null>(null);
	const down = (e: PointerEvent<HTMLButtonElement>) => {
		// A drag that leaves the bar still ends on it. A test DOM has no capture.
		e.currentTarget.setPointerCapture?.(e.pointerId);
		drag.current = { x: e.clientX, moved: false };
	};
	const track = (e: PointerEvent<HTMLButtonElement>) => {
		const d = drag.current;
		if (!d) return;
		if (Math.abs(e.clientX - d.x) >= DRAG) d.moved = true;
		if (d.moved) setDx(Math.round((e.clientX - d.x) / dayWidth) * dayWidth);
	};
	const up = () => {
		const d = drag.current;
		drag.current = null;
		if (d?.moved && dx !== 0) onMove(Math.round(dx / dayWidth));
		setDx(0);
	};
	const owner = bar.owner ?? "";
	// shortcut: about 7 px a character at 11 px, plus the padding; a measure would need a layout pass.
	const fits = owner.length * 7 + 16 <= width;
	return (
		<>
			<Tooltip label={bar.name} shortcut="← →">
				<button
					type="button"
					data-nav=""
					aria-label={name}
					aria-current={selected ? "true" : undefined}
					onPointerDown={down}
					onPointerMove={track}
					onPointerUp={up}
					onPointerCancel={() => {
						drag.current = null;
						setDx(0);
					}}
					onClick={() => {
						if (dx === 0) onOpen();
					}}
					onKeyDown={(e) => {
						if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
						e.preventDefault();
						e.stopPropagation();
						onMove((e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 7 : 1));
					}}
					style={{ left: left + dx, width }}
					className={cn(
						"absolute top-1 flex h-5 touch-none items-center overflow-hidden rounded-full border px-2 text-left text-11 font-medium whitespace-nowrap shadow-1 transition-shadow duration-(--duration-fast) hover:shadow-2",
						tone,
						bar.fixed && "border-l-4",
						selected && "shadow-glow outline-2 outline-offset-1 outline-n-12",
					)}
				>
					{fits ? <span className="truncate">{owner}</span> : null}
				</button>
			</Tooltip>
			{/* A short bar puts the name beside it, so the name is never cut. */}
			{fits || !owner ? null : (
				<span
					aria-hidden="true"
					className="pointer-events-none absolute top-1 flex h-5 items-center text-11 whitespace-nowrap text-n-11"
					style={{ left: left + dx + width + 4 }}
				>
					{owner}
				</span>
			)}
		</>
	);
}

/**
 * Bars on a time scale, with a today marker. Left and Right move the focused bar by one day,
 * Shift by seven. A drag moves it too. The caller stores the decision: the bar never moves
 * by itself.
 */
export function Gantt({
	bars,
	today,
	isOff,
	selected,
	barLabel,
	todayLabel,
	milestoneLabel,
	dayWidth = 18,
	band,
	bandLabel,
	groupBand,
	onMove,
	onOpen,
}: {
	bars: GanttBar[];
	today: string;
	/** True for a day that no one works: a weekend or a holiday. */
	isOff: (day: string) => boolean;
	selected?: string | null;
	barLabel: (bar: GanttBar) => string;
	todayLabel: string;
	/** The name of the diamond at the end of a group: its last day. */
	milestoneLabel?: (group: string, day: string) => string;
	dayWidth?: number;
	/** The load of the whole team, under the dates. */
	band?: Band;
	/** The name of the band, in the first column. */
	bandLabel?: string;
	/** The load of one group, in its heading row: a member in the resource view. */
	groupBand?: (group: string) => Band | undefined;
	onMove: (id: string, days: number) => void;
	onOpen: (id: string) => void;
}) {
	const { t, lang } = useI18n();
	// Day text sorts as dates do.
	const first = [today, ...bars.map((b) => b.start)].sort()[0] ?? today;
	const last = [today, ...bars.map((b) => b.end)].sort().at(-1) ?? today;
	// A week of air before the first bar and after the last one.
	const from = addDays(first, -7);
	// At least ten weeks, so the scale fills a wide window.
	const days = Math.max(diffDays(from, addDays(last, 7)) + 1, 70);
	const width = LABEL + days * dayWidth;
	const x = (day: string) => LABEL + diffDays(from, day) * dayWidth;

	const entries: Entry[] = [];
	const counts = new Map<string, number>();
	const ends = new Map<string, string>();
	for (const b of bars) {
		counts.set(b.group, (counts.get(b.group) ?? 0) + 1);
		if (b.end > (ends.get(b.group) ?? "")) ends.set(b.group, b.end);
	}
	let lastGroup: string | null = null;
	for (const b of bars) {
		if (b.group !== lastGroup)
			entries.push({ kind: "group", id: b.group, count: counts.get(b.group) ?? 0 });
		lastGroup = b.group;
		entries.push({ kind: "bar", bar: b });
	}
	const owners = [...new Set(bars.flatMap((b) => (b.owner ? [b.owner] : [])))];
	const dayList = Array.from({ length: days }, (_, i) => addDays(from, i));
	const monthStarts = dayList.filter((d, i) => i === 0 || d.endsWith("-01"));

	return (
		<VirtualList
			items={entries}
			width={width}
			itemKey={(e) => (e.kind === "group" ? `g:${e.id}` : e.bar.id)}
			isRow={(e) => e.kind === "bar"}
			header={
				<div className="relative h-10 border-b bg-surface-1" style={{ minWidth: width }}>
					<div className="sticky left-0 z-10 flex h-full w-56 items-end border-r bg-surface-1 px-3 pb-0.5 text-11 text-n-11">
						{band ? bandLabel : null}
					</div>
					{band ? <LoadStrip band={band} x={x} dayWidth={dayWidth} /> : null}
					<span
						aria-hidden="true"
						className="absolute bottom-0.5 z-10 -translate-x-1/2 rounded-full bg-accent-gradient px-1.5 font-mono text-11 text-accent-fg shadow-glow"
						style={{ left: x(today) + dayWidth / 2 }}
					>
						{today.slice(8)}
					</span>
					{monthStarts.map((d) => (
						<span
							key={d}
							className="absolute top-0 h-5 text-12 font-medium text-n-11"
							style={{ left: x(d) + 4 }}
						>
							{new Date(`${d}T00:00:00Z`).toLocaleDateString(lang, {
								month: "short",
								year: d.endsWith("-01") || d === from ? "numeric" : undefined,
								timeZone: "UTC",
							})}
						</span>
					))}
					{dayList
						.filter((d) => dayWidth >= 6 && isoWeekday(d) === 1)
						.map((d) => (
							<span
								key={d}
								className="absolute top-5 font-mono text-11 text-n-10"
								style={{ left: x(d) + 2 }}
							>
								{d.slice(8)}
							</span>
						))}
				</div>
			}
			renderItem={(e) =>
				e.kind === "group" ? (
					<div
						className="relative flex h-row items-center border-b bg-n-2"
						style={{ minWidth: width }}
					>
						<h2 className="sticky left-0 z-10 px-3 text-12 font-medium text-n-11">
							{format(t.count, { name: e.id, count: e.count })}
						</h2>
						{groupBand?.(e.id) ? (
							<LoadStrip band={groupBand(e.id) ?? {}} x={x} dayWidth={dayWidth} />
						) : null}
						{ends.get(e.id) ? (
							<span
								role="img"
								aria-label={
									milestoneLabel?.(e.id, ends.get(e.id) ?? "") ?? `${e.id} ${ends.get(e.id)}`
								}
								className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] bg-accent-gradient shadow-glow"
								style={{ left: x(ends.get(e.id) ?? today) + dayWidth }}
							/>
						) : null}
					</div>
				) : (
					<div className="relative h-row border-b" style={{ minWidth: width }}>
						<div className="sticky left-0 z-10 flex h-full w-56 items-center border-r bg-surface-1 px-3 text-ui">
							<span className="truncate">{e.bar.name}</span>
						</div>
						<BarButton
							bar={e.bar}
							tone={
								e.bar.owner
									? (TONES[owners.indexOf(e.bar.owner) % TONES.length] ?? UNSTAFFED)
									: UNSTAFFED
							}
							left={x(e.bar.start)}
							width={(diffDays(e.bar.start, e.bar.end) + 1) * dayWidth}
							dayWidth={dayWidth}
							name={barLabel(e.bar)}
							selected={selected === e.bar.id}
							onMove={(d) => onMove(e.bar.id, d)}
							onOpen={() => onOpen(e.bar.id)}
						/>
					</div>
				)
			}
		>
			{dayList
				.filter((d) => isOff(d))
				.map((d) => (
					<div
						key={d}
						aria-hidden="true"
						className="absolute top-0 bottom-0 bg-n-2"
						style={{ left: x(d), width: dayWidth }}
					/>
				))}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute top-0 bottom-0 bg-linear-to-b from-accent-soft to-transparent"
				style={{ left: x(today), width: dayWidth }}
			/>
			<div
				role="img"
				aria-label={`${todayLabel} ${today}`}
				className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 -translate-x-1/2 bg-accent shadow-glow"
				style={{ left: x(today) + dayWidth / 2 }}
			/>
		</VirtualList>
	);
}
