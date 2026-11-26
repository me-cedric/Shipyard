import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import {
	commands,
	type WiringReview as Review,
	unwrap,
	type WireState,
	type Wiring,
} from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { SetupCard, SetupRow, StatePill } from "../parts";
import { message } from "./keys";

export const wiringKey = ["mcp", "wiring"] as const;
export const outsideKey = ["mcp", "outside"] as const;

const PILL = { wired: "ready", "out-of-date": "fix" } as const;
const MARK = { same: " ", add: "+", del: "-" } as const;

/**
 * The agent tools that Shipyard finds, each with its state. Wire and Update show the file as it
 * would be written. Nothing is written before the person accepts that review.
 */
export function McpWiring() {
	const { t } = useI18n();
	const o = t.settings.outside;
	const qc = useQueryClient();
	const list = useQuery({
		queryKey: wiringKey,
		queryFn: () => unwrap(commands.mcpWiringList()),
	});
	const outside = useQuery({
		queryKey: outsideKey,
		queryFn: () => unwrap(commands.mcpOutsideGet()),
	});
	// A written file does not mean a server that runs: the pill needs both.
	const stopped = outside.data?.running === false;
	const [review, setReview] = useState<{ id: string; r: Review } | null>(null);
	const [note, setNote] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const attempt = async (job: () => Promise<void>) => {
		setError(null);
		setNote(null);
		try {
			await job();
		} catch (e) {
			setError(message(e));
		}
	};
	const state: Record<WireState, string> = {
		wired: o.stateWired,
		"out-of-date": o.stateOutOfDate,
		"not-wired": o.stateNotWired,
	};
	const rows = list.data ?? [];
	const p = t.personal.setup;
	return (
		<SetupCard title={p.shareTools}>
			{rows.length === 0 && list.isSuccess ? (
				<p className="px-6 py-2 text-ui text-n-11">{o.agentsNone}</p>
			) : null}
			{rows.map((w: Wiring) => (
				<SetupRow key={w.id} label={<span title={w.path}>{w.label}</span>}>
					{w.state === "not-wired" ? (
						<span className="sr-only">{state[w.state]}</span>
					) : (
						<StatePill state={w.state === "wired" && stopped ? "off" : PILL[w.state]}>
							{w.state === "wired" ? (stopped ? o.stopped : p.connected) : state[w.state]}
						</StatePill>
					)}
					{w.state === "wired" && stopped && outside.data ? (
						<Button
							variant="primary"
							onClick={() =>
								void attempt(async () => {
									const g = outside.data?.gates;
									if (!g) return;
									await unwrap(commands.mcpOutsideSet({ ...g, enabled: true }));
									await qc.invalidateQueries({ queryKey: outsideKey });
								})
							}
						>
							{p.turnOn}
						</Button>
					) : null}
					{w.state === "wired" ? null : (
						<Button
							variant="secondary"
							aria-label={format(w.state === "out-of-date" ? o.update : p.connectName, {
								name: w.label,
							})}
							onClick={() =>
								void attempt(async () =>
									setReview({ id: w.id, r: await unwrap(commands.mcpWiringReview(w.id)) }),
								)
							}
						>
							{w.state === "out-of-date" ? t.personal.setup.update : p.connect}
						</Button>
					)}
				</SetupRow>
			))}
			{review ? (
				<section aria-label={format(o.review, { path: review.r.path })} className="px-6 pb-2">
					<h4 className="py-1 font-mono text-12 text-n-11">
						{format(o.review, { path: review.r.path })}
					</h4>
					<pre className="max-h-64 overflow-auto rounded-md border bg-n-2 p-2 font-mono text-12">
						{review.r.lines.map((l, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: a diff line has no id
								key={i}
								className={
									l.kind === "add"
										? "bg-success-subtle text-success-text"
										: l.kind === "del"
											? "bg-danger-subtle text-danger-text"
											: ""
								}
							>
								{MARK[l.kind]} {l.text}
							</div>
						))}
					</pre>
					<div className="flex gap-2 pt-2">
						<Button
							variant="primary"
							onClick={() =>
								void attempt(async () => {
									const path = await unwrap(commands.mcpWiringApply(review.id, review.r.after));
									setReview(null);
									setNote(format(o.wired, { path }));
									await qc.invalidateQueries({ queryKey: wiringKey });
								})
							}
						>
							{o.write}
						</Button>
						<Button variant="ghost" onClick={() => setReview(null)}>
							{o.cancel}
						</Button>
					</div>
				</section>
			) : null}
			{note ? (
				<p role="status" className="px-6 pb-2 text-ui text-success-text">
					{note}
				</p>
			) : null}
			{error ? (
				<p role="alert" className="px-6 pb-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</SetupCard>
	);
}
