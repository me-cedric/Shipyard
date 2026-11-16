import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useRuns } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";
import { memberName, useTeam } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { ChevronRightIcon } from "@/ui/icons";
import { Panel } from "@/ui/molecules/panel";
import { Timeline, TimelineItem } from "@/ui/molecules/timeline";
import { eventSentence } from "./event-sentence";
import { useMyItems } from "./stats";

const SHOWN = 20;
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
	const { t, lang } = useI18n();
	const members = useTeam().data?.team.members ?? [];
	const mine = useMyItems();
	const keys = new Set(mine.map((i) => i.key));
	const myRuns = (useRuns().data ?? []).filter((r) => keys.has(r.key));
	const since = useLastVisit();
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
	const time = new Intl.DateTimeFormat(lang, { dateStyle: "short", timeStyle: "short" });
	return (
		<div className="px-4">
			<Panel title={t.home.today.away} count={events.length} flush>
				<Timeline>
					{events.map((e) => (
						<TimelineItem
							key={`${e.run}:${e.id}`}
							lead={<Avatar name={e.step ?? t.ui.activity.system} className="size-6" />}
							title={eventSentence(t.home.event, t.factory.state, e)}
							body={`${e.title} · ${format(t.home.stat.by, { name: memberName(members, mine.find((i) => i.key === e.key)?.member ?? null) })}`}
							time={e.ts === null ? "" : time.format(e.ts)}
						/>
					))}
				</Timeline>
				<Link
					to="/today/news"
					className="flex min-h-control items-center justify-between border-t px-3 text-ui font-medium hover:bg-n-3"
				>
					{t.rights.today.allNews}
					<ChevronRightIcon size={14} />
				</Link>
			</Panel>
		</div>
	);
}
