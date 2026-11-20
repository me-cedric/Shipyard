import { type CSSProperties, type PointerEvent, useRef, useState } from "react";
import { weekStart } from "@/features/work/week-focus";
import { cn } from "@/lib/utils";
import { addDays, diffDays } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { ATTENTION_CHIP } from "@/ui/molecules/attention-card";
import { firstName, usePlainDay } from "./capacity";
import type { PlanBar } from "./timeline-export";

/** A drag of fewer pixels is a click. */
const DRAG = 4;
/** The width of the column of the task names. */
const LABEL = "11rem";

function BarButton({
	bar,
	style,
	days,
	name,
	unstaffed,
	onMove,
	onOpen,
}: {
	bar: PlanBar;
	style: CSSProperties;
	/** The days of the whole scale: a drag reads the width of one day from the track. */
	days: number;
	name: string;
	unstaffed: string;
	onMove: (days: number) => void;
	onOpen: () => void;
}) {
	const [dx, setDx] = useState(0);
	const drag = useRef<{ x: number; day: number; moved: boolean } | null>(null);
	const down = (e: PointerEvent<HTMLButtonElement>) => {
		// A drag that leaves the bar still ends on it. A test DOM has no capture.
		e.currentTarget.setPointerCapture?.(e.pointerId);
		const width = e.currentTarget.parentElement?.clientWidth ?? 0;
		drag.current = { x: e.clientX, day: width / days, moved: false };
	};
	const track = (e: PointerEvent<HTMLButtonElement>) => {
		const d = drag.current;
		if (!d?.day) return;
		if (Math.abs(e.clientX - d.x) >= DRAG) d.moved = true;
		if (d.moved) setDx(Math.round((e.clientX - d.x) / d.day) * d.day);
	};
	const up = () => {
		const d = drag.current;
		drag.current = null;
		if (d?.moved && dx !== 0) onMove(Math.round(dx / d.day));
		setDx(0);
	};
	return (
		// The button is as tall as the row, so the target is 44 px or more. The pill inside is the mark.
		<button
			type="button"
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
				onMove((e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 7 : 1));
			}}
			style={{ ...style, translate: dx }}
			className="group absolute inset-y-0 z-10 flex min-w-28 touch-none items-center rounded-full outline-none"
		>
			<span
				// The name of the button starts with the text of the pill; the rest is for a screen reader.
				className={cn(
					"flex h-9 w-full items-center gap-2 overflow-hidden rounded-full px-1.5 text-14 font-semibold whitespace-nowrap group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent",
					bar.over
						? ATTENTION_CHIP
						: bar.owner
							? "bg-accent-subtle text-accent-text"
							: "bg-n-4 text-n-11",
				)}
			>
				{bar.owner ? (
					<>
						<span aria-hidden="true" className="flex">
							<Avatar name={bar.owner} size="s" className="bg-surface-1" />
						</span>
						{firstName(bar.owner)}
					</>
				) : (
					<span className="px-2">{unstaffed}</span>
				)}
				<span className="sr-only">{`, ${name}`}</span>
			</span>
		</button>
	);
}

/**
 * The timeline of the plan: a column for each week, a label for each feature and one bar for each
 * task. Left and Right move the focused bar by one day, Shift by seven. A drag moves it too. The
 * caller stores the decision: the bar never moves by itself.
 */
export function TimelineBars({
	bars,
	today,
	todayLabel,
	unstaffed,
	barLabel,
	milestoneLabel,
	onMove,
	onOpen,
}: {
	bars: PlanBar[];
	today: string;
	todayLabel: string;
	unstaffed: string;
	barLabel: (bar: PlanBar) => string;
	/** The name of the mark at the end of a feature: its last day. */
	milestoneLabel: (group: string, day: string) => string;
	onMove: (id: string, days: number) => void;
	onOpen: (id: string) => void;
}) {
	const day = usePlainDay();
	// Day text sorts as dates do.
	const from = weekStart(bars.map((b) => b.start).sort()[0] ?? today);
	const last =
		bars
			.map((b) => b.end)
			.sort()
			.at(-1) ?? today;
	// Four weeks or more, as the design shows.
	const weeks = Math.max(4, Math.ceil((diffDays(from, last) + 1) / 7));
	const days = weeks * 7;
	const pct = (n: number) => `${(n / days) * 100}%`;
	const lines: CSSProperties = {
		backgroundImage: "linear-gradient(to right, var(--n-6) 1px, transparent 1px)",
		backgroundSize: `${100 / weeks}% 100%`,
	};
	const groups = [...new Set(bars.map((b) => b.group))];
	const at = diffDays(from, today);
	return (
		<div className="overflow-x-auto">
			<div className="relative min-w-190">
				<div className="flex min-h-control items-center">
					<span className="shrink-0" style={{ width: LABEL }} />
					<div className="flex flex-1">
						{Array.from({ length: weeks }, (_, i) => addDays(from, i * 7)).map((w) => (
							<span key={w} className="flex-1 text-13 font-semibold text-n-10">
								{day(w)}
							</span>
						))}
					</div>
				</div>
				{groups.map((g) => {
					// The design lists the tasks of a feature by start day.
					const mine = bars
						.filter((b) => b.group === g)
						.sort((a, b) => a.start.localeCompare(b.start));
					const end =
						mine
							.map((b) => b.end)
							.sort()
							.at(-1) ?? today;
					return (
						<section key={g} aria-label={g}>
							<div className="flex items-end pt-3.5 pb-1">
								<h2 className="shrink-0 text-13 font-semibold text-n-10" style={{ width: LABEL }}>
									{g}
								</h2>
								<div className="relative h-4 flex-1">
									<span
										role="img"
										aria-label={milestoneLabel(g, day(end))}
										title={milestoneLabel(g, day(end))}
										className="absolute top-1 size-2 -translate-x-1/2 rotate-45 rounded-[2px] bg-n-9"
										style={{ left: pct(diffDays(from, end) + 1) }}
									/>
								</div>
							</div>
							{mine.map((b) => (
								<div key={b.id} className="flex min-h-13 items-center">
									<span className="shrink-0 truncate pr-3 font-medium" style={{ width: LABEL }}>
										{b.name}
									</span>
									<div className="relative min-h-13 flex-1" style={lines}>
										<BarButton
											bar={b}
											days={days}
											name={barLabel(b)}
											unstaffed={unstaffed}
											style={{
												left: pct(diffDays(from, b.start)),
												width: pct(diffDays(b.start, b.end) + 1),
											}}
											onMove={(n) => onMove(b.id, n)}
											onOpen={() => onOpen(b.id)}
										/>
									</div>
								</div>
							))}
						</section>
					);
				})}
				{at >= 0 && at < days ? (
					<span
						role="img"
						aria-label={`${todayLabel} ${day(today)}`}
						title={`${todayLabel} ${day(today)}`}
						className="pointer-events-none absolute top-11 bottom-0 w-px bg-n-9"
						style={{ left: `calc(${LABEL} + (100% - ${LABEL}) * ${(at + 0.5) / days})` }}
					/>
				) : null}
			</div>
		</div>
	);
}
