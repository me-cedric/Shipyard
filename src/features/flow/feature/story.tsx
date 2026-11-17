import { useState } from "react";
import type { RunScopeData } from "@/features/factory/runs/run-detail";
import { EventRows, isImportant, LiveLine, nameOf } from "@/features/factory/runs/run-live";
import { RunNeeds } from "@/features/factory/runs/run-needs";
import { RunUnits } from "@/features/factory/runs/run-units";
import { eventSentence } from "@/features/home/event-sentence";
import { format, useI18n } from "@/lib/i18n";
import { Button } from "@/ui/atoms/button";
import { Segmented } from "@/ui/atoms/segmented";
import { Panel } from "@/ui/molecules/panel";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { RunGraph } from "@/ui/organisms/run-graph";

/** More events than this open on Important. */
const MANY_EVENTS = 20;

/** The plain events that show before a person opens the full log. */
const PLAIN_EVENTS = 8;

/** The full log of the run: the Important and All switch, and Load more. */
function EventLog({ scope }: { scope: RunScopeData }) {
	const { t } = useI18n();
	const f = t.factory;
	const { run, events, log, active } = scope;
	const [pick, setPick] = useState<"important" | "all" | null>(null);
	const filter = pick ?? (events.length > MANY_EVENTS ? "important" : "all");
	const shown = filter === "important" ? events.filter(isImportant) : events;
	// Newest first once a live run has every event, so the latest shows under the live line.
	// While pages load, or past the cap, the list stays oldest first: it never shows a wrong newest.
	const listed = active && !log.hasNextPage ? shown.toReversed() : shown;
	return (
		<Panel
			title={f.log}
			count={shown.length}
			flush
			toolbar={
				<div className="w-44">
					<Segmented
						label={f.eventsShow}
						value={filter}
						onValueChange={setPick}
						items={[
							{ value: "important", label: f.eventsImportant },
							{ value: "all", label: f.eventsAll },
						]}
					/>
				</div>
			}
		>
			<EventRows events={listed} ticket={run.key} />
			{log.hasNextPage ? (
				<div className="border-t p-2">
					<Button
						className="min-h-control"
						variant="ghost"
						onClick={() => void log.fetchNextPage()}
					>
						{f.more}
					</Button>
				</div>
			) : null}
		</Panel>
	);
}

/** The requests of the run with their cost, the workflow graph and the sessions. */
function Requests({ scope, unit }: { scope: RunScopeData; unit?: string }) {
	const { t } = useI18n();
	const f = t.factory;
	const { run, workflow, events } = scope;
	return (
		<section aria-label={t.flow.feature.requests} className="flex flex-col gap-4">
			<StatStrip
				items={[
					{ label: f.tokens, value: run.tokens.toLocaleString(), tone: "accent" },
					{ label: f.turns, value: String(run.turns), tone: "accent" },
					...(run.costUsd === null
						? []
						: [{ label: f.cost, value: `$${run.costUsd.toFixed(2)}`, tone: "accent" as const }]),
				]}
			/>
			{workflow ? (
				<>
					<h3 className="text-14 font-medium text-n-12">{nameOf(run.workflow)}</h3>
					<RunGraph
						label={f.workflow}
						steps={workflow.steps.map((s) => {
							const live = run.steps.find((x) => x.id === s.id);
							return {
								id: s.id,
								name: nameOf(s.id),
								needs: s.needs ?? [],
								state: live?.state ?? "pending",
								units: s.for_each ? live?.units.length : undefined,
							};
						})}
					/>
				</>
			) : null}
			<RunUnits run={run} events={events} unit={unit} />
		</section>
	);
}

/**
 * The Story section (`spec:app-redesign#REQ-012`, `spec:app-redesign#REQ-015`): what waits for the person
 * first, then the events as plain sentences with one control for all of them, and on demand the
 * requests and the sessions. `unit` is the session that a link names: it opens the sessions.
 */
export function Story({
	scope,
	unit,
	details,
}: {
	scope: RunScopeData;
	unit?: string;
	details?: boolean;
}) {
	const { t } = useI18n();
	const f = t.factory;
	const x = t.flow.feature;
	const { run, events, log, waits, active, loading, error, needs } = scope;
	const [showLog, setLog] = useState(false);
	const [pick, setPick] = useState<boolean | null>(null);
	const open = pick ?? (unit !== undefined || details === true);
	const important = events.filter(isImportant);
	const base = important.length ? important : events;
	// Newest first once every page is in; before that the list stays oldest first, so it never shows a wrong newest.
	const plain = (log.hasNextPage ? base : base.toReversed()).slice(0, PLAIN_EVENTS);
	return (
		<div className="flex flex-col gap-4">
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<div ref={needs} className="contents">
				<RunNeeds run={run} events={events} waits={waits} />
			</div>
			{active ? <LiveLine run={run} events={loading ? [] : events} /> : null}
			{run.state === "RetryQueued" && run.reason ? (
				<p role="status" className="text-ui text-n-11">
					{format(f.why.stop, { text: run.reason })}
				</p>
			) : null}
			{plain.length ? (
				<ul className="flex flex-col gap-1 text-ui text-n-12">
					{plain.map((e) => (
						<li key={e.id}>{eventSentence(t.home.event, f.state, { ...e, key: run.key })}</li>
					))}
				</ul>
			) : (
				<p className="text-ui text-n-11">{x.noEvents}</p>
			)}
			<div className="flex flex-wrap gap-2">
				<Button className="min-h-control" aria-expanded={showLog} onClick={() => setLog(!showLog)}>
					{format(x.allEvents, { count: events.length })}
				</Button>
				<Button className="min-h-control" aria-expanded={open} onClick={() => setPick(!open)}>
					{open ? x.hideDetails : x.showDetails}
				</Button>
			</div>
			{showLog ? <EventLog scope={scope} /> : null}
			{open ? <Requests scope={scope} unit={unit} /> : null}
		</div>
	);
}
