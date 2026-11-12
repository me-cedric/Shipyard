import { Popover } from "@base-ui/react/popover";
import { Link } from "@tanstack/react-router";
import { AnimatePresence } from "motion/react";
import { useGuard } from "@/features/work/guard";
import { useRunActions, useRuns } from "@/lib/factory";
import { latestPerTicket } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import { useRights } from "@/lib/rights";
import { Leave } from "@/ui/atoms/leave";
import { LiveDot } from "@/ui/atoms/live-dot";
import { InboxIcon } from "@/ui/icons";
import { ConfirmButton } from "@/ui/molecules/confirm-button";
import { SessionsPart, useLiveSessions } from "./active-sessions";
import { useCounts } from "./counts";

const chip =
	"inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-ui text-n-11 transition-colors duration-(--duration-fast) hover:bg-n-3 hover:text-n-12";
const heading = "flex min-h-row items-center border-b px-3 text-12 font-medium text-n-11";

/** The Runs part: each live run with its stop, as in Home / Today. */
function RunsPart({ live }: { live: { id: string; key: string; title: string }[] }) {
	const { t } = useI18n();
	const { cancel } = useRunActions();
	const { error, run } = useGuard();
	const stopGate = useRights().gate("runs.start");
	const title = format(t.count, { name: t.shell.runs, count: live.length });
	return (
		<section aria-label={t.shell.runs}>
			<Link to="/factory/runs" className={`${heading} text-accent-text hover:underline`}>
				{title}
			</Link>
			{error ? (
				<p role="alert" className="px-3 py-2 text-danger-text">
					{error}
				</p>
			) : null}
			{/* The list stays mounted so the last row can leave; the empty text sits after it. */}
			<ul
				aria-label={t.shell.runs}
				tabIndex={-1}
				className="max-h-60 overflow-y-auto py-1 empty:hidden"
			>
				<AnimatePresence initial={false}>
					{live.map((r) => (
						<Leave as="li" key={r.id} className="flex items-center gap-2.5 px-3 py-1.5">
							<span className="font-mono text-12 text-n-11">{r.key}</span>
							<span className="min-w-0 flex-1 truncate">{r.title}</span>
							<ConfirmButton
								variant="ghost"
								{...stopGate}
								confirm={format(t.factory.machine.confirmStop, { name: r.key })}
								onConfirm={() => void run(() => cancel(r.id))}
							>
								{format(t.factory.machine.stop, { name: r.key })}
							</ConfirmButton>
						</Leave>
					))}
				</AnimatePresence>
			</ul>
			{live.length === 0 ? <p className="px-3 py-3 text-n-10">{t.shell.runsNone}</p> : null}
		</section>
	);
}

/**
 * The one Activity button of the top bar: the needs-you count, a dot while a run or a session is
 * active, and a panel with Needs you, Runs and Sessions.
 */
export function Activity() {
	const { t } = useI18n();
	const { needsYou, live: liveCount } = useCounts();
	const sessions = useLiveSessions();
	const live = latestPerTicket(useRuns().data ?? []).filter(
		(r) => r.lane === "working" || r.lane === "needs_you",
	);
	const active = liveCount > 0 || sessions.some((s) => s.state === "working");
	const counts = [
		format(t.count, { name: t.home.needsYou, count: needsYou }),
		format(t.count, { name: t.shell.runs, count: live.length }),
		format(t.count, { name: t.panels.sessions.title, count: sessions.length }),
	];
	return (
		<Popover.Root>
			<Popover.Trigger className={chip}>
				<span className="sr-only">{`${t.shell.activity}: ${counts.join(", ")}`}</span>
				{/* The dot is the mark of a live run or session: a shape, not a colour alone. */}
				<span className="relative flex">
					<InboxIcon size={14} />
					{active ? <LiveDot className="absolute -top-0.5 -right-0.5 size-1.5" /> : null}
				</span>
				<span aria-hidden="true" className={needsYou ? "font-mono text-warning-text" : "font-mono"}>
					{needsYou}
				</span>
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
					<Popover.Popup className="w-[26rem] max-w-[calc(100vw-2rem)] rounded-lg border border-n-6 bg-surface-3 text-ui shadow-3 transition-[opacity,scale] duration-(--duration-base) ease-spring origin-(--transform-origin) data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
						<Popover.Title className="sr-only">{t.shell.activity}</Popover.Title>
						<section aria-label={t.home.needsYou}>
							<Link to="/home/today" className={`${heading} text-accent-text hover:underline`}>
								{counts[0]}
							</Link>
							{needsYou === 0 ? <p className="px-3 py-3 text-n-10">{t.shell.needsNone}</p> : null}
						</section>
						<RunsPart live={live} />
						<SessionsPart />
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}
