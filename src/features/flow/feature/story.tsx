import { type ReactNode, useState } from "react";
import type { RunScopeData } from "@/features/factory/runs/run-detail";
import { EventRows, isImportant, LiveLine, nameOf } from "@/features/factory/runs/run-live";
import { RunNeeds } from "@/features/factory/runs/run-needs";
import { RunUnits } from "@/features/factory/runs/run-units";
import { eventSentence } from "@/features/home/event-sentence";
import { format, useI18n } from "@/lib/i18n";
import { Button } from "@/ui/atoms/button";
import { LinkButton } from "@/ui/atoms/link-button";
import { Segmented } from "@/ui/atoms/segmented";
import { Card } from "@/ui/molecules/card";
import { Panel } from "@/ui/molecules/panel";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { RunGraph } from "@/ui/organisms/run-graph";
import { stopAction } from "../stop-action";
import { StopLinks } from "./stop-card";

/** More events than this open on Important. */
const MANY_EVENTS = 20;

/** The plain events that show before a person opens the full log. */
const PLAIN_EVENTS = 8;

/** The full log of the run: the Important and All switch, and Load more. */
export function EventLog({ scope }: { scope: RunScopeData }) {
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

/** The requests of the run with their cost, the workflow graph and the sessions: Chat shows them for a link that names a session. */
export function Requests({ scope, unit }: { scope: RunScopeData; unit?: string }) {
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
 * The Story section (`spec:app-redesign#REQ-012`, `spec:app-redesign#REQ-015`, picture 003): what
 * waits for the person first, then one card with a time and one plain sentence for each event, and
 * one link for all of them. `ticket` is false on the ticket page: its Comments card replies on the
 * ticket. `bare` draws no card of events: the plan in review stands alone (picture 024).
 */
export function Story({
	scope,
	ticket,
	bare,
	onFiles,
	children,
}: {
	scope: RunScopeData;
	ticket?: boolean;
	bare?: boolean;
	/** The plan in review links to the files that it changes. */
	onFiles?: () => void;
	/** The cards of the ticket page: they show under what waits. */
	children?: ReactNode;
}) {
	const { t, lang } = useI18n();
	const f = t.factory;
	const x = t.flow.feature;
	const { run, events, log, waits, active, loading, error, needs } = scope;
	const [showLog, setLog] = useState(false);
	const important = events.filter(isImportant);
	const base = important.length ? important : events;
	// Newest first once every page is in; before that the list stays oldest first, so it never shows a wrong newest.
	const plain = (log.hasNextPage ? base : base.toReversed()).slice(0, PLAIN_EVENTS);
	// The page is the feature: a sentence of the Story names no ticket.
	const own = t.flow.look.page.event;
	const said = { ...t.home.event, ...own, what: { ...t.home.event.what, ...own.what } };
	const hm = new Intl.DateTimeFormat(lang, {
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	});
	// The actor of an event is the agent of its step, in bold; an event with no step names "the agent".
	const sentence = (e: (typeof events)[number]) => {
		const actor = e.step ? nameOf(e.step.split(".")[0] ?? "") : t.flow.look.page.theAgent;
		const text = eventSentence(said, f.state, { ...e, key: actor });
		return text.startsWith(actor) ? (
			<span className="min-w-0">
				<b className="font-semibold">{actor}</b>
				{text.slice(actor.length)}
			</span>
		) : (
			text
		);
	};
	const all = (
		<LinkButton aria-expanded={showLog} onClick={() => setLog(!showLog)}>
			{format(x.allEvents, { count: events.length })}
		</LinkButton>
	);
	return (
		<div className="flex flex-col gap-4">
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<div ref={needs} className="contents">
				<RunNeeds run={run} events={events} waits={waits} ticket={ticket} onFiles={onFiles} />
			</div>
			{/* The newest event is read once; the first line of the card shows it. */}
			{active ? (
				<div className="sr-only">
					<LiveLine run={run} events={loading ? [] : events} />
				</div>
			) : null}
			{run.state === "RetryQueued" && run.reason ? (
				<p role="status" className="text-ui text-n-11">
					{format(f.why.stop, { text: run.reason })}
				</p>
			) : null}
			{children}
			{stopAction(run) && ticket ? <StopLinks /> : null}
			{/* The full log of a page with no card of events is in Chat (More). */}
			{bare ? null : (
				<Card pad className="flex flex-col gap-1.5">
					<h2 className="pb-1.5 text-17 font-semibold text-n-12">{x.section.story}</h2>
					{plain.length ? (
						<ol className="flex flex-col">
							{plain.map((e) => (
								<li key={e.id} className="flex items-baseline gap-3.5 py-3 text-n-12">
									<time className="w-13 shrink-0 whitespace-nowrap text-13 text-n-11">
										{e.ts === null ? "" : hm.format(e.ts)}
									</time>
									{sentence(e)}
								</li>
							))}
						</ol>
					) : (
						<p className="text-n-11">{x.noEvents}</p>
					)}
					{all}
				</Card>
			)}
			{showLog ? <EventLog scope={scope} /> : null}
		</div>
	);
}
