import { Elapsed } from "@/features/code/quality-live";
import { eventSentence, eventTone, payloadOf } from "@/features/home/event-sentence";
import { format, type Messages, useI18n } from "@/lib/i18n";
import type { RunLogEvent_Serialize, RunView } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/ui/atoms/status-dot";

/** Pretty-prints a JSON payload. A text that is not JSON stays as it is. */
export function pretty(payload: string): string {
	try {
		return JSON.stringify(JSON.parse(payload), null, 2);
	} catch {
		return payload;
	}
}

/** The steps of the run (done, now, next), the time since the start and the last thing that happened. */
export function LiveStrip({ run, events }: { run: RunView; events: RunLogEvent_Serialize[] }) {
	const { t } = useI18n();
	const f = t.factory;
	const last = events.at(-1);
	const start = events[0]?.ts;
	return (
		<section
			aria-label={f.steps}
			className="flex flex-col gap-2 rounded-lg border bg-surface-1 p-3"
		>
			<div className="flex items-center gap-2 text-ui">
				{start ? <Elapsed since={start} /> : null}
				{/* A polite live region: a new line is read once, without a jump of the focus. */}
				<span aria-live="polite" className="min-w-0 flex-1 truncate text-n-12">
					{last ? eventSentence(t.home.event, f.state, { ...last, key: run.key }) : ""}
				</span>
			</div>
			<ol className="flex flex-wrap gap-x-4 gap-y-1 text-12">
				{run.steps.map((s) => (
					<li
						key={s.id}
						aria-current={s.state === "running" ? "step" : undefined}
						className={cn(
							"flex items-center gap-1.5",
							s.state === "running" ? "font-medium text-n-12" : "text-n-11",
						)}
					>
						{s.state === "done" ? (
							<>
								<span aria-hidden="true" className="text-success">
									✓
								</span>
								<span className="sr-only">{f.step.done}</span>
							</>
						) : (
							<StatusDot
								status={
									s.state === "running"
										? "active"
										: s.state === "failed"
											? "danger"
											: s.state === "gate"
												? "warning"
												: "idle"
								}
								label={f.step[s.state]}
							/>
						)}
						{s.id}
					</li>
				))}
			</ol>
		</section>
	);
}

/** One row for each event: the time, a dot for its kind and one plain sentence. The raw JSON is behind Details. */
export function EventRows({ events, ticket }: { events: RunLogEvent_Serialize[]; ticket: string }) {
	const { t, lang } = useI18n();
	const time = new Intl.DateTimeFormat(lang, { timeStyle: "medium" });
	return (
		<ol className="flex flex-col">
			{events.map((e) => {
				const ev = { ...e, key: ticket };
				return (
					<li key={e.id} className="flex flex-col gap-1 border-b px-3 py-2 text-ui last:border-b-0">
						<div className="flex items-start gap-2">
							<span className="mt-1.5">
								<StatusDot status={eventTone(ev)} label={e.kind} />
							</span>
							<time className="shrink-0 font-mono text-12 text-n-10">
								{e.ts === null ? "" : time.format(e.ts)}
							</time>
							<span className="min-w-0 flex-1 break-words text-n-12">
								{eventSentence(t.home.event, t.factory.state, ev)}
							</span>
						</div>
						<details className="pl-5 text-12 text-n-11">
							<summary className="w-fit cursor-pointer select-none rounded-sm focus-visible:shadow-glow">
								{t.home.details}
							</summary>
							<pre className="overflow-x-auto font-mono text-11 whitespace-pre-wrap">
								{e.step ? `${e.step} · ${e.kind}\n` : `${e.kind}\n`}
								{pretty(e.payload)}
							</pre>
						</details>
					</li>
				);
			})}
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
