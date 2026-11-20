import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { useRuns } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";
import { runHref } from "@/lib/shell";
import { memberName, useTeam } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { ChevronRightIcon } from "@/ui/icons";
import { eventSentence } from "./event-sentence";
import { useMyItems } from "./stats";

const SHOWN = 20;
/** The rows that show before "N more" (picture 092 shows a short list). */
const FIRST = 3;
// shortcut: one page of 50 events for each run, so a very long run misses its newest events; upgrade with a log tail command.
const PAGE = 50;

/** The time of the last visit of Today. It moves to now after the first render, so this visit still shows what was new. */
export function useLastVisit() {
	const { todaySeen, setPrefs, loaded } = usePrefs();
	const since = useRef<number | null>(null);
	// The pref holds seconds; the events hold milliseconds.
	if (loaded && since.current === null) since.current = todaySeen * 1000;
	// biome-ignore lint/correctness/useExhaustiveDependencies: write once, when the prefs are read
	useEffect(() => {
		if (loaded) setPrefs({ todaySeen: Math.floor(Date.now() / 1000) });
	}, [loaded]);
	return since.current;
}

/** What happened on my tickets and runs since the last visit, with one link to all news (spec:app-redesign#REQ-009). */
export function SinceAway() {
	const { t } = useI18n();
	const members = useTeam().data?.team.members ?? [];
	const mine = useMyItems();
	const keys = new Set(mine.map((i) => i.key));
	const myRuns = (useRuns().data ?? []).filter((r) => keys.has(r.key));
	const since = useLastVisit();
	const title = useId();
	const [all, setAll] = useState(false);
	const logs = useQueries({
		queries: myRuns.map((r) => ({
			queryKey: ["home", "activity", r.id] as const,
			queryFn: () => unwrap(commands.runLogPage(r.id, 0, PAGE)),
		})),
	});
	const events = myRuns
		.flatMap((r, n) =>
			(logs[n]?.data?.events ?? []).map((e) => ({ ...e, run: r.id, key: r.key, title: r.title })),
		)
		.filter((e) => (e.ts ?? 0) > (since ?? Number.POSITIVE_INFINITY))
		.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
		.slice(0, SHOWN);
	if (!events.length) return null;
	const shown = all ? events : events.slice(0, FIRST);
	return (
		<section aria-labelledby={title} className="rounded-lg bg-surface-2 py-2 shadow-2">
			<h2 id={title} className="px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-11">
				{t.home.today.away}
			</h2>
			<ul>
				{shown.map((e) => (
					<li key={`${e.run}:${e.id}`} className="border-t border-n-6 first:border-t-0">
						<Link
							{...runHref(e.run)}
							title={`${e.title} · ${format(t.home.stat.by, { name: memberName(members, mine.find((i) => i.key === e.key)?.member ?? null) })}`}
							className="flex min-h-15 items-center gap-3 px-6 py-2 text-n-12"
						>
							<Avatar agent size="s" name={e.step ?? t.ui.activity.system} />
							<span className="min-w-0 flex-1 truncate">
								{eventSentence(t.home.event, t.factory.state, e)}
							</span>
						</Link>
					</li>
				))}
			</ul>
			{shown.length < events.length ? (
				<button
					type="button"
					onClick={() => setAll(true)}
					className="flex min-h-15 w-full items-center border-t border-n-6 px-6 text-left font-semibold text-n-12"
				>
					{format(t.home.queueMore, { count: events.length - shown.length })}
				</button>
			) : null}
			<Link
				to="/today/news"
				className="flex min-h-15 items-center justify-between border-t border-n-6 px-6 font-semibold text-n-12"
			>
				{t.rights.today.allNews}
				<ChevronRightIcon size={20} />
			</Link>
		</section>
	);
}
