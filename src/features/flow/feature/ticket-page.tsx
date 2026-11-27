import { useState } from "react";
import { webUrl } from "@/features/factory/runs/run-summary";
import { useGuard } from "@/features/work/guard";
import { useI18n } from "@/lib/i18n";
import type { WorkItemView_Serialize } from "@/lib/ipc";
import { openUrl } from "@/lib/menus";
import { useTicketComments, useTicketEditCaps, useWorkActions, useWorkContext } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Textarea } from "@/ui/atoms/textarea";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { LeaveGuard } from "@/ui/organisms/leave-guard";
import { MarkdownView } from "@/ui/organisms/markdown-view";

/** "Edit the title" of the ticket page: the button swaps for a field. Enter saves, Escape cancels. */
export function EditTitle({ item }: { item: WorkItemView_Serialize }) {
	const { t } = useI18n();
	const d = t.work.thread;
	const edit = useTicketEditCaps().data;
	const act = useWorkActions();
	const { failure, run } = useGuard();
	// `null` when not editing.
	const [title, setTitle] = useState<string | null>(null);
	if (!edit?.title) return null;
	if (title === null)
		return (
			<Button onClick={() => setTitle(item.title)}>{t.flow.look.page.ticket.editTitle}</Button>
		);
	return (
		<form
			className="flex flex-[1_1_20rem] flex-wrap items-center gap-2.5"
			onKeyDown={(e) => {
				if (e.key !== "Escape") return;
				e.stopPropagation();
				setTitle(null);
			}}
			onSubmit={async (e) => {
				e.preventDefault();
				if (await run(() => act.editTicket(item.key, title, null))) setTitle(null);
			}}
		>
			<Input
				label={d.summary}
				className="flex-[1_1_240px]"
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				autoFocus
			/>
			<Button type="submit" disabled={title.trim() === "" || title.trim() === item.title}>
				{d.save}
			</Button>
			<Button onClick={() => setTitle(null)}>{d.cancel}</Button>
			<ErrorNotice error={failure} className="flex-[1_1_100%]" />
		</form>
	);
}

/** The text of the ticket: it reads as Markdown, and "Edit the text" swaps it for a field. */
function TicketText({ item }: { item: WorkItemView_Serialize }) {
	const { t } = useI18n();
	const d = t.work.thread;
	const edit = useTicketEditCaps().data;
	const act = useWorkActions();
	const { failure, run } = useGuard();
	// `null` when not editing.
	const [text, setText] = useState<string | null>(null);
	const url = webUrl(item.url);
	return (
		<Card pad className="flex flex-col gap-3">
			<LeaveGuard
				dirty={text !== null && text !== item.description}
				onSave={() => act.editTicket(item.key, null, text)}
			/>
			<div className="flex flex-wrap items-center gap-2.5">
				<h2 className="mr-auto text-20 font-semibold text-n-12">{t.flow.look.page.ticket.title}</h2>
				{edit?.description && text === null ? (
					<Button onClick={() => setText(item.description)}>
						{t.flow.look.page.ticket.editText}
					</Button>
				) : null}
				{url ? <Button onClick={() => openUrl(url)}>{t.flow.look.page.openTicket}</Button> : null}
			</div>
			{text !== null ? (
				<form
					className="flex flex-col gap-2"
					onKeyDown={(e) => {
						if (e.key !== "Escape") return;
						e.stopPropagation();
						setText(null);
					}}
					onSubmit={async (e) => {
						e.preventDefault();
						if (await run(() => act.editTicket(item.key, null, text))) setText(null);
					}}
				>
					<Textarea
						rows={8}
						label={d.description}
						value={text}
						onChange={(e) => setText(e.target.value)}
						autoFocus
					/>
					<div className="flex gap-2">
						<Button type="submit" disabled={text === item.description}>
							{d.saveDescription}
						</Button>
						<Button onClick={() => setText(null)}>{d.cancel}</Button>
					</div>
				</form>
			) : item.description.trim() !== "" ? (
				<div className="min-w-0 [overflow-wrap:anywhere]">
					<MarkdownView source={item.description} label={d.description} reading />
				</div>
			) : null}
			<ErrorNotice error={failure} />
		</Card>
	);
}

/** The comments: one row each (the author, then the text), and one line with Send. */
export function TicketThread({ itemKey }: { itemKey: string }) {
	const { t } = useI18n();
	const d = t.work.thread;
	const caps = useWorkContext().data?.capabilities;
	const comments = useTicketComments(itemKey, caps?.comments === true);
	const act = useWorkActions();
	const { failure, run } = useGuard();
	const [body, setBody] = useState("");
	return (
		<Card pad className="flex flex-col gap-3.5">
			<h2 className="text-20 font-semibold text-n-12">{t.flow.look.page.ticket.comments}</h2>
			{caps?.comments ? (
				<>
					<ul aria-label={d.comments} className="flex flex-col gap-2.5">
						{(comments.data ?? []).map((c) => (
							<li key={c.id} className="flex min-w-0 items-start gap-3 [overflow-wrap:anywhere]">
								<Avatar name={c.author} />
								<div className="min-w-0 pt-1">
									<b className="font-semibold">{c.author}</b> {c.body}
								</div>
							</li>
						))}
					</ul>
					<ErrorNotice error={comments.error} />
					<form
						className="flex flex-wrap items-center gap-2.5"
						onSubmit={async (e) => {
							e.preventDefault();
							if (body.trim() === "") return;
							if (await run(() => act.comment(itemKey, body))) setBody("");
						}}
					>
						<Input
							label={d.comment}
							caption={false}
							placeholder={d.comment}
							className="flex-[1_1_240px]"
							value={body}
							onChange={(e) => setBody(e.target.value)}
						/>
						<Button type="submit" disabled={body.trim() === ""}>
							{t.flow.look.page.stop.send}
						</Button>
					</form>
				</>
			) : (
				<p className="text-12 text-n-11">{d.noComments}</p>
			)}
			<ErrorNotice error={failure} />
		</Card>
	);
}

/** The ticket page (picture 026): the text of the ticket with the way to the issue tracker, and its comments. */
export function TicketCards({ item }: { item: WorkItemView_Serialize }) {
	return (
		<>
			<TicketText item={item} />
			<TicketThread itemKey={item.key} />
		</>
	);
}
