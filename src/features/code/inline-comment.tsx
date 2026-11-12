import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import {
	type PendingComment,
	usePendingReview,
	usePostLineComment,
} from "@/lib/code/pending-review";
import { format, useI18n } from "@/lib/i18n";
import { RightButton } from "@/lib/rights";
import { Button } from "@/ui/atoms/button";
import { Textarea } from "@/ui/atoms/textarea";
import { ClockIcon } from "@/ui/icons";
import { ConfirmButton } from "@/ui/molecules/confirm-button";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { MarkdownView } from "@/ui/organisms/markdown-view";

/**
 * The box under a line of the diff. Add review comment keeps the text in the pending review on this
 * computer. Add single comment posts it at once, and a refusal of the code host keeps the box and the text.
 * Escape closes an empty box only: a box with text asks first through Cancel.
 */
export function InlineBox({
	reference,
	headSha,
	path,
	line,
	onClose,
}: {
	reference: string;
	headSha: string;
	path: string;
	line: number;
	onClose: () => void;
}) {
	const { t } = useI18n();
	const i = t.forge.pullInline;
	const c = t.forge.pullConversation;
	const review = usePendingReview(reference);
	const single = usePostLineComment(reference);
	const [body, setBody] = useState("");
	const [tab, setTab] = useState<"write" | "preview">("write");
	const area = useRef<HTMLTextAreaElement>(null);
	useEffect(() => area.current?.focus(), []);
	const empty = body.trim() === "";
	const entry = { path, line, body, headSha };
	const keys = (e: KeyboardEvent) => {
		if (e.key !== "Escape" || !empty) return;
		e.stopPropagation();
		onClose();
	};
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Escape closes an empty box from any control in it
		<div onKeyDown={keys} className="flex flex-col gap-2 rounded-lg border bg-surface-1 px-3 py-2">
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
					ref={area}
					label={format(i.boxLabel, { n: line })}
					value={body}
					onChange={(e) => setBody(e.target.value)}
				/>
			) : (
				<div className="min-h-16 [overflow-wrap:anywhere]">
					<MarkdownView source={body} label={c.previewLabel} />
				</div>
			)}
			<div className="flex flex-wrap gap-2">
				<RightButton
					right="code.write"
					variant="primary"
					disabled={empty || single.pending}
					onClick={() => {
						review.add(entry);
						onClose();
					}}
				>
					{i.addReview}
				</RightButton>
				<RightButton
					right="code.write"
					busy={single.pending}
					disabled={empty}
					onClick={() => void single.post(entry).then(onClose, () => {})}
				>
					{i.addSingle}
				</RightButton>
				{empty ? (
					<Button onClick={onClose}>{i.cancel}</Button>
				) : (
					<ConfirmButton confirm={i.discard} onConfirm={onClose}>
						{i.cancel}
					</ConfirmButton>
				)}
			</div>
			<ErrorNotice error={single.error} />
		</div>
	);
}

/**
 * A pending comment under its line: marked Pending, with its Markdown text, Edit and Delete. A
 * comment made on an older push says so, and its text still shows.
 */
export function PendingCard({
	c,
	outdated,
	storageError,
	onSave,
	onRemove,
}: {
	c: PendingComment;
	outdated: boolean;
	/** Why the pending review is not saved on this computer: the comment is in memory only. */
	storageError?: string | null;
	onSave: (body: string) => void;
	onRemove: () => void;
}) {
	const { t } = useI18n();
	const i = t.forge.pullInline;
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(c.body);
	const edit = useRef<HTMLButtonElement>(null);
	const back = useRef(false);
	// After Save or Cancel the focus returns to Edit.
	useEffect(() => {
		if (editing || !back.current) return;
		back.current = false;
		edit.current?.focus();
	}, [editing]);
	const done = () => {
		back.current = true;
		setEditing(false);
	};
	return (
		<article
			aria-label={`${i.pending}: ${c.path}:${c.line}`}
			className="flex flex-col gap-1 px-3 py-2 text-ui"
		>
			<span className="flex flex-wrap items-center gap-2 text-12 text-n-11">
				<span className="inline-flex items-center gap-1">
					<ClockIcon size={12} />
					{i.pending}
				</span>
				<span>{format(i.line, { n: c.line })}</span>
				{outdated ? <span>{i.older}</span> : null}
			</span>
			{editing ? (
				<>
					<Textarea
						label={format(i.editFor, { n: c.line })}
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
					/>
					<div className="flex gap-2">
						<Button
							variant="primary"
							disabled={draft.trim() === ""}
							onClick={() => {
								onSave(draft);
								done();
							}}
						>
							{i.save}
						</Button>
						<Button
							onClick={() => {
								setDraft(c.body);
								done();
							}}
						>
							{i.cancel}
						</Button>
					</div>
				</>
			) : (
				<>
					<div className="[overflow-wrap:anywhere]">
						<MarkdownView source={c.body} label={i.pending} />
					</div>
					<div className="flex gap-2">
						<Button
							ref={edit}
							aria-label={format(i.editFor, { n: c.line })}
							onClick={() => {
								setDraft(c.body);
								setEditing(true);
							}}
						>
							{i.edit}
						</Button>
						{c.body.trim() ? (
							<ConfirmButton
								aria-label={format(i.deleteFor, { n: c.line })}
								confirm={i.deleteAsk}
								onConfirm={onRemove}
							>
								{i.delete}
							</ConfirmButton>
						) : (
							<Button aria-label={format(i.deleteFor, { n: c.line })} onClick={onRemove}>
								{i.delete}
							</Button>
						)}
					</div>
				</>
			)}
			<ErrorNotice error={storageError && format(i.notSaved, { reason: storageError })} />
		</article>
	);
}
