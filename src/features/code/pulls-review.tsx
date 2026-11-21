import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { webUrl } from "@/features/factory/runs/run-summary";
import {
	type PrRowView,
	type PullDetail,
	useForgeActions,
	usePendingReview,
	usePull,
} from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { openUrl } from "@/lib/menus";
import { RightButton } from "@/lib/rights";
import { pullHref } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Textarea } from "@/ui/atoms/textarea";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { AgentReview } from "./agent-review";
import { FitSegmented } from "./fit-segmented";
import { usePullAsk } from "./pull-ask";
import { useRun } from "./use-run";

type Verdict = "comment" | "approve" | "request_changes";
/** The most notes that one review takes (the backend limit). */
const MAX_NOTES = 100;

/** The verdict, the message and Submit review of the selected pull request. Same logic as the dialog of the page. */
function ReviewForm({ d }: { d: PullDetail }) {
	const { t } = useI18n();
	const r = t.forge.pullReview;
	const x = t.flow.look.pulls;
	const { submitReview } = useForgeActions();
	const { comments, settle } = usePendingReview(d.reference);
	const { failure, busy, run } = useRun();
	const [verdict, setVerdict] = useState<Verdict>("comment");
	const [text, setText] = useState("");
	const [missing, setMissing] = useState(false);
	const [sent, setSent] = useState(false);
	const over = comments.length - MAX_NOTES;
	const empty = verdict === "comment" && text.trim() === "" && comments.length === 0;
	const submit = () => {
		if (verdict === "request_changes" && text.trim() === "") {
			setMissing(true);
			return;
		}
		void run(async () => {
			const notes = comments.map(({ path, line, body, headSha }) => ({
				path,
				line,
				body,
				headSha,
			}));
			const outcome = await submitReview(d.reference, verdict, text, notes, d.headSha);
			settle(outcome.failed);
			setText("");
			setSent(true);
		});
	};
	return (
		<>
			<FitSegmented
				label={r.verdict}
				value={verdict}
				onValueChange={(v) => {
					setVerdict(v);
					setSent(false);
				}}
				items={[
					{ value: "approve", label: r.approve },
					{ value: "request_changes", label: x.askChanges },
					{ value: "comment", label: r.comment },
				]}
			/>
			<div className="flex flex-col gap-2">
				<span aria-hidden="true" className="font-semibold text-n-12">
					{x.message}
				</span>
				<Textarea
					label={x.message}
					className="min-h-28"
					value={text}
					aria-invalid={missing || undefined}
					onChange={(e) => {
						setText(e.target.value);
						setMissing(false);
						setSent(false);
					}}
				/>
			</div>
			{missing ? (
				<p role="alert" className="text-ui text-danger-text">
					{r.needsText}
				</p>
			) : null}
			{over > 0 ? (
				<p role="alert" className="text-ui text-danger-text">
					{format(r.tooMany, { n: over })}
				</p>
			) : null}
			{sent ? (
				<p role="status" className="text-ui text-n-11">
					{x.sent}
				</p>
			) : null}
			<RightButton
				right="code.write"
				variant="primary"
				busy={busy}
				disabled={empty || over > 0}
				reason={over > 0 ? format(r.tooMany, { n: over }) : empty ? r.empty : undefined}
				onClick={submit}
				className="w-full"
			>
				{r.submit}
			</RightButton>
			<ErrorNotice error={failure} />
		</>
	);
}

/** The Reviewer card: review with an agent, write the description. */
function ReviewerCard({ d }: { d: PullDetail }) {
	const { t } = useI18n();
	const askPull = usePullAsk(d);
	return (
		<Card pad className="flex flex-col gap-3">
			<div className="flex items-center gap-3">
				<Avatar name="R" agent />
				<span className="font-semibold">{t.flow.look.pulls.reviewer}</span>
			</div>
			{/* `AgentReview` draws its own row: the classes give its button the width of the design. */}
			<div className="flex flex-wrap gap-2.5 [&>section]:flex-[1_1_130px] [&>section_button]:w-full [&>section>span]:flex [&>section>span]:w-full [&_svg]:hidden">
				<AgentReview d={d} />
				<Button
					className="flex-[1_1_130px]"
					onClick={() => askPull(t.workspace.pr.prompt.describe)}
				>
					{t.flow.look.pull.describe}
				</Button>
			</div>
		</Card>
	);
}

/** The review panel of the pull requests page: the selected pull request, the review, the reviewer and the links. */
export function PullReviewPanel({ r, className }: { r: PrRowView; className?: string }) {
	const { t } = useI18n();
	const x = t.flow.look.pulls;
	const pull = usePull(r.number);
	// The detail of another pull request may still show while the new one loads.
	const d = pull.data?.reference === r.reference ? pull.data : null;
	const url = webUrl(r.url);
	return (
		<div className={cn("flex flex-col gap-6", className)}>
			{/* The verdict switch takes the width of its words, not of the card. */}
			<Card pad className="flex flex-col gap-3.5">
				<h2 className="text-13 font-semibold text-n-11">{t.flow.look.pull.review}</h2>
				<h3 className="text-20 font-semibold text-n-12">
					{/* The title opens the page of the pull request: no extra button under the card. */}
					<Link
						{...pullHref(r.reference)}
						className="rounded-sm hover:underline focus-visible:shadow-glow focus-visible:outline-none"
					>
						{r.title}
					</Link>
				</h3>
				{d ? (
					<span className="font-mono text-n-11">
						{format(t.flow.look.pull.branches, { source: d.sourceBranch, target: d.targetBranch })}
					</span>
				) : null}
				{r.draft ? <Badge className="self-start">{t.forge.draft}</Badge> : null}
				{d && r.state === "open" ? <ReviewForm key={r.reference} d={d} /> : null}
			</Card>
			{d ? <ReviewerCard d={d} /> : null}
			{url ? (
				<Button className="w-full" onClick={() => openUrl(url)}>
					{x.openHost}
				</Button>
			) : null}
		</div>
	);
}
