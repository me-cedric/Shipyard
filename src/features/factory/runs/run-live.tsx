import { useState } from "react";
import { eventSentence, eventTone, payloadOf } from "@/features/home/event-sentence";
import { format, type Messages, useI18n } from "@/lib/i18n";
import type { RunLogEvent_Serialize, RunView } from "@/lib/ipc";
import { IconButton } from "@/ui/atoms/icon-button";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ChevronDownIcon, ChevronUpIcon } from "@/ui/icons";

/** Pretty-prints a JSON payload. A text that is not JSON stays as it is. */
export function pretty(payload: string): string {
	try {
		return JSON.stringify(JSON.parse(payload), null, 2);
	} catch {
		return payload;
	}
}

/** The name of a step or a workflow from its id: "self-review" gives "Self review". */
export const nameOf = (id: string) => {
	const text = id.replace(/[-_.]+/g, " ").trim();
	return text.charAt(0).toUpperCase() + text.slice(1);
};

/** The newest event as one sentence, in a polite live region: a new line is read once, with no jump of the focus. */
export function LiveLine({ run, events }: { run: RunView; events: RunLogEvent_Serialize[] }) {
	const { t } = useI18n();
	const last = events.at(-1);
	return (
		<p aria-live="polite" className="min-w-0 truncate text-ui text-n-12">
			{last ? eventSentence(t.home.event, t.factory.state, { ...last, key: run.key }) : ""}
		</p>
	);
}

/** An event that the person reads first: a question, an approval, an error, a state change or a result. */
export function isImportant(e: RunLogEvent_Serialize): boolean {
	const p = payloadOf(e.payload);
	switch (e.kind) {
		case "state":
		case "question":
		case "write":
		case "pr":
		case "review":
		case "alert":
			return true;
		case "runner":
			return typeof p.error === "string";
		case "note":
			return (
				typeof p.stop === "string" ||
				typeof p.blocked === "string" ||
				typeof p.step_failed === "string"
			);
		case "tool":
			return p.tool === "report";
		default:
			return false;
	}
}

function EventRow({ event: e, ticket }: { event: RunLogEvent_Serialize; ticket: string }) {
	const { t, lang } = useI18n();
	const [open, setOpen] = useState(false);
	const ev = { ...e, key: ticket };
	const hm = new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" });
	const full = new Intl.DateTimeFormat(lang, { timeStyle: "medium" });
	const kinds: Record<string, string> = t.factory.kinds;
	return (
		<li className="flex flex-col border-b px-3 text-ui last:border-b-0">
			<div className="flex min-h-row items-center gap-2">
				<StatusDot status={eventTone(ev)} label={kinds[e.kind] ?? t.factory.kinds.other} />
				<time
					title={e.ts === null ? undefined : full.format(e.ts)}
					className="shrink-0 font-mono text-12 text-n-10"
				>
					{e.ts === null ? "" : hm.format(e.ts)}
				</time>
				<span className="min-w-0 flex-1 truncate text-n-12">
					{eventSentence(t.home.event, t.factory.state, ev)}
				</span>
				<IconButton label={t.home.details} aria-expanded={open} onClick={() => setOpen(!open)}>
					{open ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
				</IconButton>
			</div>
			{open ? (
				<pre className="overflow-x-auto pb-2 pl-5 font-mono text-11 whitespace-pre-wrap text-n-11">
					{e.step ? `${e.step} · ${e.kind}\n` : `${e.kind}\n`}
					{pretty(e.payload)}
				</pre>
			) : null}
		</li>
	);
}

/** One line for each event: a dot for its kind, the time, one plain sentence. The raw JSON opens from the chevron at the end of the line. */
export function EventRows({ events, ticket }: { events: RunLogEvent_Serialize[]; ticket: string }) {
	return (
		<ol className="flex flex-col">
			{events.map((e) => (
				<EventRow key={e.id} event={e} ticket={ticket} />
			))}
		</ol>
	);
}

/** The text of the latest `blocked` note. */
export function lastBlock(events: RunLogEvent_Serialize[]): string | undefined {
	return events
		.map((e) => (e.kind === "note" ? payloadOf(e.payload).blocked : undefined))
		.findLast((b): b is string => typeof b === "string");
}

/** The record of an escalation (`factory` REQ-053), as the engine writes it in the log. */
export type Escalation = {
	cause: string;
	lines: string[];
	tried: string;
	action: string;
	attempt: number;
};

/** The record of the newest stop note, when that note escalated. */
export function escalationOf(events: RunLogEvent_Serialize[]): Escalation | undefined {
	for (const e of events.toReversed()) {
		const p = payloadOf(e.payload);
		if (e.kind === "note" && (typeof p.stop === "string" || typeof p.blocked === "string"))
			return p.escalation as Escalation | undefined;
	}
}

/** Why a run stopped, in one plain sentence: the latest stop note or runner error, else a failed step. */
export function stopReason(
	why: Messages["factory"]["why"],
	run: RunView,
	events: RunLogEvent_Serialize[],
): string {
	const esc = escalationOf(events);
	const cause = esc && (why.cause as Record<string, string>)[esc.cause];
	if (cause) return cause;
	// The backend reads the newest events: the loaded pages can miss them on a long log.
	const said = run.reason ?? null;
	if (said) {
		const turns = /max turns \((\d+)\)/.exec(said);
		if (turns) return format(why.turns, { count: turns[1] ?? "" });
		if (/^budget$/i.test(said)) return why.budget;
		return format(why.stop, { text: said });
	}
	for (const e of events.toReversed()) {
		const p = payloadOf(e.payload);
		if (e.kind === "note" && typeof p.stop === "string") {
			const turns = /max turns \((\d+)\)/.exec(p.stop);
			if (turns) return format(why.turns, { count: turns[1] ?? "" });
			if (/budget/i.test(p.stop)) return why.budget;
			return format(why.stop, { text: p.stop });
		}
		if (e.kind === "note" && typeof p.blocked === "string")
			return format(why.stop, { text: p.blocked });
		if (e.kind === "runner" && typeof p.error === "string")
			return format(why.error, { text: p.error });
	}
	const failed = run.steps.find((s) => s.state === "failed");
	return failed ? format(why.step, { step: failed.id }) : why.none;
}
