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
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { message } from "./keys";

export const wiringKey = ["mcp", "wiring"] as const;

const TONE = { wired: "success", "out-of-date": "warning", "not-wired": "neutral" } as const;
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
	return (
		<div className="flex flex-col rounded-lg border bg-surface-1 shadow-1">
			<h3 className="px-3 pt-2 text-12 font-medium text-n-11">{o.agents}</h3>
			{rows.length === 0 && list.isSuccess ? (
				<p className="px-3 py-2 text-ui text-n-11">{o.agentsNone}</p>
			) : null}
			{rows.map((w: Wiring) => (
				<SettingsRow key={w.id} label={w.label}>
					<span className="max-w-72 truncate font-mono text-12 text-n-11" title={w.path}>
						{w.path}
					</span>
					<Badge variant={TONE[w.state]}>{state[w.state]}</Badge>
					{w.state === "wired" ? null : (
						<Button
							variant="secondary"
							onClick={() =>
								void attempt(async () =>
									setReview({ id: w.id, r: await unwrap(commands.mcpWiringReview(w.id)) }),
								)
							}
						>
							{format(w.state === "out-of-date" ? o.update : o.wire, { name: w.label })}
						</Button>
					)}
				</SettingsRow>
			))}
			{review ? (
				<section aria-label={format(o.review, { path: review.r.path })} className="px-3 pb-2">
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
				<p role="status" className="px-3 pb-2 text-ui text-success-text">
					{note}
				</p>
			) : null}
			{error ? (
				<p role="alert" className="px-3 pb-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</div>
	);
}
