import { useState } from "react";
import { useGuard } from "@/features/work/guard";
import { useI18n } from "@/lib/i18n";
import { useWorkItems } from "@/lib/sync";
import { useTicketComments, useWorkActions, useWorkContext } from "@/lib/work";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Textarea } from "@/ui/atoms/textarea";

/**
 * What a person does with the words of a ticket: edit the title, add a label, read the comments
 * and post one. Each write is one click. A tracker without comments says so and shows no box.
 * Legacy source: `pages/tickets/ticket-edit.tsx` and `tickets_issue` (`jira.rs`).
 */
export function TicketThread({ itemKey }: { itemKey: string }) {
	const { t } = useI18n();
	const d = t.work.thread;
	const item = (useWorkItems({}).data ?? []).find((i) => i.key === itemKey);
	const caps = useWorkContext().data?.capabilities;
	const comments = useTicketComments(itemKey, caps?.comments === true);
	const act = useWorkActions();
	const { error, run } = useGuard();
	const [title, setTitle] = useState<string | null>(null);
	const [label, setLabel] = useState("");
	const [body, setBody] = useState("");
	if (!(item && caps)) return null;

	return (
		<section aria-label={d.title} className="flex flex-col gap-3">
			<h3 className="text-12 font-medium text-n-11">{d.title}</h3>
			<form
				className="flex items-center gap-2"
				onSubmit={async (e) => {
					e.preventDefault();
					if (title !== null && (await run(() => act.editTicket(itemKey, title, null))))
						setTitle(null);
				}}
			>
				<Input
					label={d.summary}
					value={title ?? item.title}
					onChange={(e) => setTitle(e.target.value)}
				/>
				<Button type="submit" disabled={title === null || title.trim() === item.title}>
					{d.save}
				</Button>
			</form>
			<form
				className="flex items-center gap-2"
				onSubmit={async (e) => {
					e.preventDefault();
					if (await run(() => act.addLabel(itemKey, label))) setLabel("");
				}}
			>
				<Input label={d.label} value={label} onChange={(e) => setLabel(e.target.value)} />
				<Button type="submit" disabled={!caps.labels || label.trim() === ""}>
					{d.addLabel}
				</Button>
			</form>
			<div className="flex flex-wrap gap-1">
				{item.labels.map((l) => (
					<Badge key={l}>{l}</Badge>
				))}
			</div>
			{caps.comments ? (
				<>
					<ul aria-label={d.comments} className="flex flex-col gap-2">
						{(comments.data ?? []).map((c) => (
							<li key={c.id} className="flex flex-col text-ui">
								<span className="text-12 text-n-11">
									{c.author} <time dateTime={c.created}>{c.created.slice(0, 10)}</time>
								</span>
								<span className="whitespace-pre-wrap">{c.body}</span>
							</li>
						))}
					</ul>
					{comments.error ? (
						<p role="alert" className="text-ui text-danger-text">
							{String(comments.error)}
						</p>
					) : null}
					<form
						className="flex flex-col gap-2"
						onSubmit={async (e) => {
							e.preventDefault();
							if (await run(() => act.comment(itemKey, body))) setBody("");
						}}
					>
						<Textarea label={d.comment} value={body} onChange={(e) => setBody(e.target.value)} />
						<div>
							<Button type="submit" variant="primary" disabled={body.trim() === ""}>
								{d.post}
							</Button>
						</div>
					</form>
				</>
			) : (
				<p className="text-12 text-n-11">{d.noComments}</p>
			)}
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</section>
	);
}
