import { useRef, useState } from "react";
import { type PullDetail, useForgeActions, usePendingReview } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import type { ReviewOutcome } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { IconButton } from "@/ui/atoms/icon-button";
import { Textarea } from "@/ui/atoms/textarea";
import { TrashIcon } from "@/ui/icons";
import { ConfirmButton } from "@/ui/molecules/confirm-button";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { Dialog } from "@/ui/organisms/dialog";
import { MarkdownView } from "@/ui/organisms/markdown-view";
import { useRun } from "./use-run";

export type Verdict = "comment" | "approve" | "request_changes";
/** What the dialog keeps in the page, so closing it loses nothing. `posted` holds the ids of the comments that stayed after a partial result: their review went out. */
export type ReviewDraft = { text: string; verdict: Verdict; posted: string[] };
/** The most notes that one review takes (the backend limit). */
const MAX_NOTES = 100;
const VERDICTS: Verdict[] = ["comment", "approve", "request_changes"];

/**
 * Submit review (REQ-049, REQ-051): one verdict, the review text and the pending line comments, sent as
 * one review. A refusal of the code host shows here and keeps the comments and the text. A comment on a
 * file that left the pull request, or on an older commit, is marked and still sent: the code host folds
 * it into the text when its line is gone, so no text is lost.
 */
export function SubmitReview({
	d,
	draft,
	onChange,
	onClose,
	onSent,
}: {
	d: PullDetail;
	draft: ReviewDraft;
	onChange: (patch: Partial<ReviewDraft>) => void;
	onClose: () => void;
	/** `left` holds the ids of the comments that the code host did not take. */
	onSent: (outcome: ReviewOutcome, left: string[]) => void;
}) {
	const { t } = useI18n();
	const r = t.forge.pullReview;
	const c = t.forge.pullConversation;
	const { submitReview } = useForgeActions();
	const { comments, settle, remove } = usePendingReview(d.reference);
	const { failure, busy, run } = useRun();
	const i = t.forge.pullInline;
	const body = draft.text;
	// After a partial result the verdict is out: only a comment review goes now.
	const locked = comments.some((x) => draft.posted.includes(x.id));
	const verdict: Verdict = locked ? "comment" : draft.verdict;
	const [tab, setTab] = useState<"write" | "preview">("write");
	const [missing, setMissing] = useState(false);
	const first = useRef<HTMLInputElement>(null);
	const label: Record<Verdict, string> = {
		comment: r.comment,
		approve: r.approve,
		request_changes: r.requestChanges,
	};
	const older = (x: (typeof comments)[number]) =>
		x.headSha !== d.headSha || !d.files.some((f) => f.path === x.path);
	const submit = () => {
		if (verdict === "request_changes" && body.trim() === "") {
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
			const outcome = await submitReview(d.reference, verdict, body, notes, d.headSha);
			onSent(outcome, settle(outcome.failed));
		});
	};
	// The backend takes 100 notes at most: say so before a Submit that always fails.
	const over = comments.length - MAX_NOTES;
	const empty = verdict === "comment" && body.trim() === "" && comments.length === 0;
	return (
		<Dialog
			open
			onOpenChange={(open) => !open && onClose()}
			title={r.title}
			wide
			initialFocus={first}
			actions={
				<RightButton
					right="code.write"
					variant="primary"
					busy={busy}
					disabled={empty || over > 0}
					reason={over > 0 ? format(r.tooMany, { n: over }) : empty ? r.empty : undefined}
					onClick={submit}
				>
					{r.submit}
				</RightButton>
			}
		>
			<fieldset className="flex flex-wrap gap-2 border-0 p-0">
				<legend className="sr-only">{r.verdict}</legend>
				{VERDICTS.map((v, i) => (
					<label
						key={v}
						className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border bg-surface-2 px-3 text-ui text-n-12 has-disabled:opacity-50 has-checked:border-accent has-checked:bg-accent-soft has-focus-visible:outline-[length:var(--focus-width,2px)] has-focus-visible:outline-accent"
					>
						<input
							ref={i === 0 ? first : undefined}
							type="radio"
							name="review-verdict"
							value={v}
							checked={verdict === v}
							disabled={locked && v !== "comment"}
							onChange={() => onChange({ verdict: v })}
							className="sr-only"
						/>
						{label[v]}
					</label>
				))}
			</fieldset>
			{locked ? (
				<p role="status" className="text-ui text-n-11">
					{r.posted}
				</p>
			) : null}
			<ViewTabs
				label={c.editor}
				value={tab}
				onValueChange={setTab}
				tabs={[
					{ value: "write", label: c.write },
					{ value: "preview", label: c.preview },
				]}
			/>
			{tab === "write" ? (
				<Textarea
					label={r.text}
					value={body}
					aria-invalid={missing || undefined}
					aria-describedby={missing ? "review-text-error" : undefined}
					onChange={(e) => {
						onChange({ text: e.target.value });
						setMissing(false);
					}}
				/>
			) : (
				<div className="min-h-16 [overflow-wrap:anywhere]">
					<MarkdownView source={body} label={c.previewLabel} />
				</div>
			)}
			{missing ? (
				<p id="review-text-error" role="alert" className="text-ui text-danger-text">
					{r.needsText}
				</p>
			) : null}
			{comments.length > 0 ? (
				<ul
					aria-label={r.list}
					aria-describedby={over > 0 ? "review-too-many" : undefined}
					className={cn(
						"flex max-h-60 flex-col overflow-auto rounded-lg border",
						over > 0 && "border-danger",
					)}
				>
					{comments.map((x) => (
						<li key={x.id} className="flex items-center gap-2 border-b px-3 py-1 last:border-b-0">
							<div className="flex min-w-0 flex-1 flex-col text-ui">
								<span className="flex items-center gap-2 font-mono text-12 text-n-11">
									{x.path}:{x.line}
									{older(x) ? <Badge variant="warning">{r.older}</Badge> : null}
								</span>
								{x.body.includes("\n") ? (
									<details>
										<summary className="cursor-pointer [overflow-wrap:anywhere]">
											{x.body.split("\n")[0]}
										</summary>
										<MarkdownView source={x.body} label={i.pending} />
									</details>
								) : (
									<span className="[overflow-wrap:anywhere]">{x.body}</span>
								)}
							</div>
							{x.body.trim() ? (
								<ConfirmButton
									aria-label={r.remove.replace("{place}", `${x.path}:${x.line}`)}
									confirm={i.deleteAsk}
									onConfirm={() => remove(x.id)}
								>
									<TrashIcon size={14} />
								</ConfirmButton>
							) : (
								<IconButton
									label={r.remove.replace("{place}", `${x.path}:${x.line}`)}
									onClick={() => remove(x.id)}
								>
									<TrashIcon size={14} />
								</IconButton>
							)}
						</li>
					))}
				</ul>
			) : null}
			{over > 0 ? (
				<p id="review-too-many" role="alert" className="text-ui text-danger-text">
					{format(r.tooMany, { n: over })}
				</p>
			) : null}
			<ErrorNotice error={failure} />
		</Dialog>
	);
}
