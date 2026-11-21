import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { RightButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
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
		// `order-last w-full`: in the action row of the Overview, the draft takes its own line below the buttons.
		<Panel
			title={t.forge.agent.panel}
			count={kept.length}
			icon={<SparklesIcon size={14} />}
			className="order-last w-full"
		>
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
							path={f.path}
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
						<RightButton
							right="runs.approve"
							variant="primary"
							disabled={posting}
							onClick={() => void post()}
						>
							{t.forge.agent.post}
						</RightButton>
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
				<section className="flex flex-wrap items-center gap-2">
					<RightButton
						right="runs.start"
						disabled={busy || draft != null}
						onClick={() => void start()}
					>
						<SparklesIcon size={14} />
						{busy ? t.forge.agent.reviewing : t.forge.agent.review}
					</RightButton>
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

/** The comments that a person marked as solved. shortcut: kept until the app reloads; keep them in the draft when a command can drop one finding. */
const solved = new Set<string>();

/**
 * The comments of the agent reviews that wait, on one file of the local changes. A reply and
 * "Apply the fix" leave a draft in the assistant: a person sends it. "Solved" hides the comment.
 */
export function LocalReview({ path }: { path: string }) {
	const { t } = useI18n();
	const n = t.forge.now;
	const { ask } = useShell();
	const [, redraw] = useState(0);
	const [reply, setReply] = useState("");
	const waiting =
		useQuery({
			queryKey: ["code", "pr-review", "waiting"],
			queryFn: () => unwrap(commands.prReviewWaiting()),
		}).data ?? [];
	const drafts = useQueries({
		queries: waiting.map((w) => ({
			queryKey: ["code", "pr-review", w.number, w.headSha],
			queryFn: () => unwrap(commands.prReviewGet(w.number, w.headSha)),
		})),
	});
	const findings = drafts
		.flatMap((d) => d.data?.findings ?? [])
		.filter((f) => f.path === path && !solved.has(`${f.path}:${f.line}:${f.text}`));
	return findings.map((f) => (
		<section
			key={`${f.line}:${f.text}`}
			aria-label={format(n.comment, { line: f.line })}
			className="mx-6 mb-5 flex flex-col gap-3 rounded-[14px] bg-n-3 p-4"
		>
			<p className="flex items-start gap-3">
				<Avatar agent size="s" name={n.reviewer} />
				<span className="min-w-0">
					<span className="font-semibold">{n.reviewer}</span> {f.text}
				</span>
			</p>
			<form
				className="flex flex-wrap gap-2.5"
				onSubmit={(e) => {
					e.preventDefault();
					if (!reply.trim()) return;
					ask(format(n.replyPrompt, { path: f.path, line: f.line, text: f.text, reply }));
					setReply("");
				}}
			>
				<Input
					label={n.reply}
					className="flex-[1_1_200px]"
					value={reply}
					onChange={(e) => setReply(e.target.value)}
				/>
				<Button
					onClick={() => ask(format(n.fixPrompt, { path: f.path, line: f.line, text: f.text }))}
				>
					{n.applyFix}
				</Button>
				<Button
					onClick={() => {
						solved.add(`${f.path}:${f.line}:${f.text}`);
						redraw((x) => x + 1);
					}}
				>
					{n.solved}
				</Button>
			</form>
		</section>
	));
}
