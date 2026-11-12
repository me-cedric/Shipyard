import { useState } from "react";
import { type PullDetail, useForgeActions } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { RightButton } from "@/lib/rights";
import { Textarea } from "@/ui/atoms/textarea";
import { ChatBubbleIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Panel } from "@/ui/molecules/panel";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { MarkdownView } from "@/ui/organisms/markdown-view";
import { CloseConfirm } from "./close-confirm";
import { CommentBody, ThreadCard } from "./pull-thread";
import { useRun } from "./use-run";

type Item =
	| { id: string; at: number; comment: PullDetail["comments"][number] }
	| { id: string; at: number; thread: PullDetail["threads"][number] };

/** The time of a comment in ms, or `Infinity` when the host gave none: it sorts after the others. */
const time = (iso: string | undefined) => {
	const ms = iso ? Date.parse(iso) : Number.NaN;
	return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
};

/** The general comments and the threads in time order. A thread counts from its first comment. */
export function conversation(d: PullDetail): Item[] {
	const items: Item[] = [
		...d.comments.map((comment) => ({ id: `c${comment.id}`, at: time(comment.created), comment })),
		...d.threads.map((thread) => ({
			id: `t${thread.id}`,
			at: time(thread.comments[0]?.created),
			thread,
		})),
	];
	// The sort is stable: items with no time keep their order, comments first.
	return items.sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? -1 : 1));
}

/**
 * The write box, one textarea. Comment posts a general comment. Submit review opens the dialog with the text (Approve and Request changes live there). The draft lives in the page, so a tab change keeps it.
 */
function Reply({
	d,
	body,
	setBody,
	onReview,
}: {
	d: PullDetail;
	body: string;
	setBody: (body: string) => void;
	onReview: (text: string) => void;
}) {
	const { t } = useI18n();
	const c = t.forge.pullConversation;
	const { comment, close, sendBack } = useForgeActions();
	const { failure, busy, run } = useRun();
	const [closing, setClosing] = useState(false);
	const [tab, setTab] = useState<"write" | "preview">("write");
	const agent = d.links.some((l) => l.startsWith("run:"));
	const open = d.state === "open";
	const send = (job: () => Promise<unknown>) =>
		void run(async () => {
			await job();
			setBody("");
		});
	return (
		<div className="flex flex-col gap-2 rounded-lg border bg-surface-1 px-3 py-2 shadow-1">
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
				<Textarea label={t.forge.comment} value={body} onChange={(e) => setBody(e.target.value)} />
			) : (
				<div className="min-h-16 [overflow-wrap:anywhere]">
					<MarkdownView source={body} label={c.previewLabel} />
				</div>
			)}
			<div className="flex flex-wrap gap-2">
				<RightButton
					right="code.write"
					variant="primary"
					busy={busy}
					disabled={body.trim() === ""}
					onClick={() => send(() => comment(d.number, body))}
				>
					{t.forge.comment}
				</RightButton>
				<RightButton right="code.write" busy={busy} onClick={() => onReview(body)}>
					{t.forge.pullReview.submit}
				</RightButton>
				{agent && open ? (
					<RightButton
						right="code.write"
						busy={busy}
						onClick={() => send(() => sendBack(d.number, body))}
					>
						{t.forge.sendBack}
					</RightButton>
				) : null}
				{open && closing ? (
					<CloseConfirm
						number={d.number}
						onCancel={() => setClosing(false)}
						onConfirm={() => {
							setClosing(false);
							send(() => close(d.number, body));
						}}
					/>
				) : open ? (
					<RightButton
						right="code.write"
						variant="danger"
						busy={busy}
						onClick={() => setClosing(true)}
					>
						{t.forge.close}
					</RightButton>
				) : null}
			</div>
			<ErrorNotice error={failure} className="px-3 py-2" />
		</div>
	);
}

/** The conversation of the Overview (REQ-047): comments and threads in time order, then the write box. */
export function Conversation({
	d,
	draft,
	setDraft,
	onReview,
}: {
	d: PullDetail;
	draft: string;
	setDraft: (draft: string) => void;
	onReview: (text: string) => void;
}) {
	const { t } = useI18n();
	const c = t.forge.pullConversation;
	const items = conversation(d);
	return (
		<>
			{items.length > 0 ? (
				<Panel
					title={t.forge.threads}
					count={items.length}
					icon={<ChatBubbleIcon size={14} />}
					flush
				>
					{d.commentsTruncated ? (
						<p className="border-b px-3 py-2 text-12 text-n-11">
							{format(c.latestComments, { count: d.comments.length })}
						</p>
					) : null}
					{d.threadsTruncated ? (
						<p className="border-b px-3 py-2 text-12 text-n-11">
							{format(c.firstThreads, { count: d.threads.length })}
						</p>
					) : null}
					{items.map((i) =>
						"thread" in i ? (
							<ThreadCard key={i.id} reference={d.reference} th={i.thread} />
						) : (
							<div key={i.id} className="border-b last:border-b-0">
								<CommentBody c={i.comment} />
							</div>
						),
					)}
				</Panel>
			) : null}
			<Reply d={d} body={draft} setBody={setDraft} onReview={onReview} />
		</>
	);
}
