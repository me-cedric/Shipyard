import { useState } from "react";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import { useWorkItems } from "@/lib/sync";
import { useTicketComments, useTicketEditCaps, useWorkActions, useWorkContext } from "@/lib/work";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { Textarea } from "@/ui/atoms/textarea";
import { TicketBudget } from "./ticket-budget";

/**
 * What a person does with the words of a ticket: edit the title, add a label, read the comments
 * and post one. Each write is one click. A tracker without comments says so and shows no box.
 * Legacy source: `pages/tickets/ticket-edit.tsx` and `tickets_issue` (`jira.rs`).
 */
export function TicketThread({ itemKey }: { itemKey: string }) {
	const { t } = useI18n();
	const d = t.work.thread;
	const x = t.personal.thread;
	const item = (useWorkItems({}).data ?? []).find((i) => i.key === itemKey);
	const caps = useWorkContext().data?.capabilities;
	const edit = useTicketEditCaps().data;
	const comments = useTicketComments(itemKey, caps?.comments === true);
	const act = useWorkActions();
	const { error, run } = useGuard();
	const [title, setTitle] = useState<string | null>(null);
	const [label, setLabel] = useState("");
	const [body, setBody] = useState("");
	// `null` until the person edits: the field shows the description of the tracker.
	const [description, setDescription] = useState<string | null>(null);
	const [priority, setPriority] = useState("");
	const [type, setType] = useState("");
	const [due, setDue] = useState("");
	const [days, setDays] = useState("");
	if (!(item && caps && edit)) return null;

	return (
		<section aria-label={d.title} className="flex flex-col gap-3">
			<h3 className="text-12 font-medium text-n-11">{d.title}</h3>
			<TicketBudget item={item} />
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
			{edit.labels ? (
				<form
					className="flex items-center gap-2"
					onSubmit={async (e) => {
						e.preventDefault();
						if (await run(() => act.addLabel(itemKey, label))) setLabel("");
					}}
				>
					<Input label={d.label} value={label} onChange={(e) => setLabel(e.target.value)} />
					<Button type="submit" disabled={label.trim() === ""}>
						{d.addLabel}
					</Button>
				</form>
			) : null}
			<div className="flex flex-wrap items-center gap-1">
				{item.labels.map((l) =>
					edit.removeLabel ? (
						<Button
							key={l}
							variant="ghost"
							aria-label={format(d.removeLabel, { label: l })}
							onClick={() => void run(() => act.removeLabel(itemKey, l))}
						>
							{l}
						</Button>
					) : (
						<Badge key={l}>{l}</Badge>
					),
				)}
			</div>
			{edit.description ? (
				<form
					className="flex flex-col gap-2"
					onSubmit={async (e) => {
						e.preventDefault();
						if (
							description !== null &&
							(await run(() => act.editTicket(itemKey, null, description)))
						)
							setDescription(null);
					}}
				>
					<Textarea
						label={d.description}
						value={description ?? item.description}
						onChange={(e) => setDescription(e.target.value)}
					/>
					<div>
						<Button
							type="submit"
							disabled={description === null || description === item.description}
						>
							{d.saveDescription}
						</Button>
					</div>
				</form>
			) : null}
			{edit.priority ? (
				<Select
					label={d.priority}
					value={priority}
					onValueChange={(p) =>
						void run(() => act.setPriority(itemKey, p)).then((ok) => ok && setPriority(p))
					}
					items={Object.entries(d.priorities).map(([value, label]) => ({ value, label }))}
				/>
			) : null}
			{edit.issueType ? (
				<form
					className="flex items-center gap-2"
					onSubmit={async (e) => {
						e.preventDefault();
						if (await run(() => act.setType(itemKey, type))) setType("");
					}}
				>
					<Input label={x.type} value={type} onChange={(e) => setType(e.target.value)} />
					<Button type="submit" disabled={type.trim() === ""}>
						{x.setType}
					</Button>
				</form>
			) : null}
			{edit.dueDate ? (
				<form
					className="flex items-center gap-2"
					onSubmit={async (e) => {
						e.preventDefault();
						await run(() => act.setDue(itemKey, due || null));
					}}
				>
					<Input label={x.due} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
					<Button type="submit">{due ? x.setDue : x.clearDue}</Button>
				</form>
			) : null}
			{edit.estimate ? (
				<form
					className="flex items-center gap-2"
					onSubmit={async (e) => {
						e.preventDefault();
						if (await run(() => act.setEstimate(itemKey, Number(days)))) setDays("");
					}}
				>
					<Input
						label={x.estimate}
						type="number"
						min={0}
						step="0.5"
						value={days}
						onChange={(e) => setDays(e.target.value)}
					/>
					<Button type="submit" disabled={days.trim() === "" || !(Number(days) >= 0)}>
						{x.setEstimate}
					</Button>
				</form>
			) : null}
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
