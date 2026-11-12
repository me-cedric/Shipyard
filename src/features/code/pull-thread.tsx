import { useEffect, useRef, useState } from "react";
import { type PullDetail, useForgeActions } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { RightButton } from "@/lib/rights";
import { Avatar } from "@/ui/atoms/avatar";
import { Textarea } from "@/ui/atoms/textarea";
import { ChatBubbleIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { MarkdownView } from "@/ui/organisms/markdown-view";
import { useRun } from "./use-run";

export type PullComment = PullDetail["comments"][number];
type Thread = PullDetail["threads"][number];

/** The time of a comment: date and time, the full form in the title. Nothing when the host gave none. */
function Stamp({ iso }: { iso: string }) {
	const { lang } = useI18n();
	const at = new Date(iso);
	if (!iso || Number.isNaN(at.getTime())) return null;
	return (
		<time
			dateTime={iso}
			title={new Intl.DateTimeFormat(lang, { dateStyle: "full", timeStyle: "long" }).format(at)}
		>
			{new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(at)}
		</time>
	);
}

/** One comment: the initials, the author, the time and the Markdown body. */
export function CommentBody({ c }: { c: PullComment }) {
	return (
		<div className="flex min-w-0 gap-2 px-3 py-2 text-ui">
			<Avatar name={c.author} />
			<div className="flex min-w-0 flex-1 flex-col [overflow-wrap:anywhere]">
				<span className="flex gap-2 text-12 text-n-11">
					<span className="font-medium text-n-12">{c.author}</span>
					<Stamp iso={c.created} />
				</span>
				<MarkdownView source={c.body} label={c.author} />
			</div>
		</div>
	);
}

/**
 * A review thread: the file and line, the Resolved or Open mark, its comments, Reply and Resolve or Reopen.
 * A resolved thread is one line until the person opens it.
 */
export function ThreadCard({ reference, th }: { reference: string; th: Thread }) {
	const { t } = useI18n();
	const c = t.forge.pullConversation;
	const { reply, resolve } = useForgeActions();
	const { failure, busy, run } = useRun();
	const [expanded, setExpanded] = useState(!th.resolved);
	const [replying, setReplying] = useState(false);
	const [body, setBody] = useState("");
	const replyButton = useRef<HTMLButtonElement>(null);
	const toggle = useRef<HTMLButtonElement>(null);
	const resolveButton = useRef<HTMLButtonElement>(null);
	// Set by a click on Resolve or Reopen: the focus follows the change once the new state is drawn.
	const moved = useRef(false);
	// The card stays mounted: it collapses on Resolve and opens on Reopen, and the draft stays.
	useEffect(() => {
		setExpanded(!th.resolved);
		if (!moved.current) return;
		moved.current = false;
		(th.resolved ? toggle : resolveButton).current?.focus();
	}, [th.resolved]);
	const place = th.path ? `${th.path}${th.line ? `:${th.line}` : ""}` : "";
	const where = place || c.inConversation;
	const mark = (
		<span className="inline-flex items-center gap-1 text-12 text-n-11">
			{th.resolved ? <CheckIcon size={12} /> : <ChatBubbleIcon size={12} />}
			{th.resolved ? c.resolved : c.open}
		</span>
	);
	const head = (
		<>
			<span className="truncate font-mono text-12 text-n-11">{place}</span>
			{mark}
		</>
	);
	return (
		<article aria-label={where} className="flex flex-col border-b last:border-b-0">
			{th.resolved ? (
				<button
					ref={toggle}
					type="button"
					aria-expanded={expanded}
					onClick={() => setExpanded(!expanded)}
					className="flex min-w-0 items-center gap-2 px-3 py-2 text-left text-ui hover:bg-n-3"
				>
					{expanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
					{head}
					{expanded ? null : (
						<span className="min-w-0 flex-1 truncate text-n-11">
							{th.comments[0]?.body.split("\n")[0]}
						</span>
					)}
				</button>
			) : (
				<div className="flex min-w-0 items-center gap-2 px-3 py-2">{head}</div>
			)}
			{expanded ? (
				<>
					{th.commentsTotal > th.comments.length ? (
						<p className="px-3 pt-2 text-12 text-n-11">
							{format(c.lastOf, { shown: th.comments.length, total: th.commentsTotal })}
						</p>
					) : null}
					{th.comments.map((x) => (
						<CommentBody key={x.id} c={x} />
					))}
					<div className="flex flex-wrap gap-2 px-3 py-2">
						<RightButton
							ref={replyButton}
							right="code.write"
							aria-expanded={replying}
							aria-label={format(c.replyTo, { place: where })}
							onClick={() => setReplying(!replying)}
						>
							{c.reply}
						</RightButton>
						<RightButton
							ref={resolveButton}
							right="code.write"
							busy={busy}
							onClick={() =>
								void run(async () => {
									moved.current = true;
									try {
										await resolve(reference, th.id, !th.resolved);
									} catch (e) {
										moved.current = false;
										throw e;
									}
								})
							}
						>
							{th.resolved ? c.reopen : c.resolve}
						</RightButton>
					</div>
					{replying ? (
						<div className="flex flex-col gap-2 px-3 pb-2">
							<Textarea label={c.replyBox} value={body} onChange={(e) => setBody(e.target.value)} />
							<div>
								<RightButton
									right="code.write"
									variant="primary"
									busy={busy}
									disabled={body.trim() === ""}
									onClick={() =>
										void run(async () => {
											await reply(reference, th.id, body);
											setBody("");
											setReplying(false);
											replyButton.current?.focus();
										})
									}
								>
									{c.postReply}
								</RightButton>
							</div>
						</div>
					) : null}
				</>
			) : null}
			<ErrorNotice error={failure} className="px-3 pb-2" />
		</article>
	);
}
