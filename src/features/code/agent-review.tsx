import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import {
	commands,
	type PullDetail,
	type ReviewDraft,
	type ReviewFinding,
	type ReviewVerdict,
	unwrap,
} from "@/lib/ipc";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Select } from "@/ui/atoms/select";
import { Textarea } from "@/ui/atoms/textarea";
import { SparklesIcon } from "@/ui/icons";
import { DiffView, shownLines } from "@/ui/molecules/diff-view";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Panel } from "@/ui/molecules/panel";

const VERDICTS: ReviewVerdict[] = ["approve", "comment", "request_changes"];

const reviewKey = (d: PullDetail) => ["code", "pr-review", d.number, d.headSha] as const;

function Finding({ f, onDrop }: { f: ReviewFinding; onDrop: () => void }) {
	const { t } = useI18n();
	return (
		<div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-2 px-2 py-1 text-ui">
			<Badge variant={f.severity === "P2" ? "neutral" : "danger"}>{f.severity}</Badge>
			<span className="font-mono text-12">
				{f.path}:{f.line}
			</span>
			<span className="min-w-0 flex-1">{f.text}</span>
			<Button variant="ghost" onClick={onDrop}>
				{format(t.forge.agent.drop, { path: f.path, line: f.line })}
			</Button>
		</div>
	);
}

/** The draft of the agent: edit the summary and the verdict, drop a finding, post with one click. */
function Draft({ d, draft }: { d: PullDetail; draft: ReviewDraft }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const [summary, setSummary] = useState(draft.summary);
	const [verdict, setVerdict] = useState<ReviewVerdict>(draft.verdict);
	const [kept, setKept] = useState<ReviewFinding[]>(draft.findings);
	const [error, setError] = useState<unknown>(null);
	const [posting, setPosting] = useState(false);
	// The state shows the button off; the ref stops a second click before the next render.
	const sent = useRef(false);
	useEffect(() => {
		setSummary(draft.summary);
		setVerdict(draft.verdict);
		setKept(draft.findings);
	}, [draft]);
	const post = async () => {
		if (sent.current) return;
		sent.current = true;
		setPosting(true);
		setError(null);
		try {
			await unwrap(
				commands.prReviewPost(
					{ number: d.number, headSha: d.headSha, summary, verdict, findings: kept },
					true,
				),
			);
		} catch (e) {
			sent.current = false;
			setError(e);
		} finally {
			await qc.invalidateQueries({ queryKey: ["code"] });
			setPosting(false);
		}
	};
	// A finding shows under its line when the diff has that line, else in the list below the diffs.
	const shown = new Map(d.files.map((f) => [f.path, shownLines(f.patch ?? "")]));
	const onDiff = (k: ReviewFinding) => shown.get(k.path)?.has(k.line) ?? false;
	const drop = (k: ReviewFinding) => setKept(kept.filter((x) => x !== k));
	const finding = (k: ReviewFinding) => (
		<Finding key={`${k.path}:${k.line}:${k.text}`} f={k} onDrop={() => drop(k)} />
	);
	const notes = (path: string) => {
		const out: Record<number, ReactNode[]> = {};
		for (const k of kept.filter((x) => x.path === path && onDiff(x)))
			out[k.line] = [...(out[k.line] ?? []), finding(k)];
		return out;
	};
	const files = d.files.filter((f) => f.patch && kept.some((k) => k.path === f.path && onDiff(k)));
	return (
		<Panel title={t.forge.agent.panel} count={kept.length} icon={<SparklesIcon size={14} />}>
			<div className="flex flex-col gap-2 p-3">
				<Textarea
					label={t.forge.agent.summary}
					value={summary}
					disabled={draft.posted}
					onChange={(e) => setSummary(e.target.value)}
				/>
				<Select
					label={t.forge.agent.verdict}
					value={verdict}
					onValueChange={(v) => setVerdict(v as ReviewVerdict)}
					items={VERDICTS.map((v) => ({ value: v, label: t.forge.agent.verdicts[v] }))}
				/>
				{files.map((f) => (
					<section key={f.path} aria-label={f.path} className="flex flex-col gap-1">
						<p className="font-mono text-12 text-n-11">{f.path}</p>
						<DiffView
							text={f.patch ?? ""}
							label={format(t.forge.diff, { path: f.path })}
							binaryLabel=""
							truncatedLabel=""
							notes={notes(f.path)}
						/>
					</section>
				))}
				{kept.filter((k) => !onDiff(k)).map(finding)}
				<div>
					{draft.posted ? (
						<Badge variant="success">{t.forge.agent.posted}</Badge>
					) : (
						<Button variant="primary" disabled={posting} onClick={() => void post()}>
							{t.forge.agent.post}
						</Button>
					)}
				</div>
				<ErrorNotice error={error} className="text-ui text-danger-text" />
			</div>
		</Panel>
	);
}

/** "Review with an agent" on an open pull request, and the draft that comes back. */
export function AgentReview({ d }: { d: PullDetail }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<unknown>(null);
	const draft = useQuery({
		queryKey: reviewKey(d),
		queryFn: () => unwrap(commands.prReviewGet(d.number, d.headSha)),
	}).data;
	const start = async () => {
		setBusy(true);
		setError(null);
		try {
			await unwrap(commands.prReviewStart(d.number, true));
		} catch (e) {
			setError(e);
		} finally {
			setBusy(false);
			await qc.invalidateQueries({ queryKey: ["code", "pr-review"] });
		}
	};
	return (
		<>
			{d.state === "open" ? (
				<section className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
					<Button disabled={busy || draft != null} onClick={() => void start()}>
						<SparklesIcon size={14} />
						{busy ? t.forge.agent.reviewing : t.forge.agent.review}
					</Button>
					{busy ? (
						<Button variant="ghost" onClick={() => void commands.prReviewStop(d.number)}>
							{t.forge.agent.stop}
						</Button>
					) : null}
					<ErrorNotice error={error} className="text-ui text-danger-text" />
				</section>
			) : null}
			{draft ? <Draft d={d} draft={draft} /> : null}
		</>
	);
}
