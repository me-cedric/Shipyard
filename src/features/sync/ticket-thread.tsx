import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import { useWorkItems } from "@/lib/sync";
import { useTicketComments, useTicketEditCaps, useWorkActions, useWorkContext } from "@/lib/work";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input, type InputProps } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { Textarea } from "@/ui/atoms/textarea";
import { PencilIcon, XMarkIcon } from "@/ui/icons";
import { MarkdownView } from "@/ui/organisms/markdown-view";
import { TicketBudget } from "./ticket-budget";

/** The title of a ticket. The pencil swaps it for a field: Enter saves, Escape cancels. */
export function TicketTitle({ itemKey }: { itemKey: string }) {
	const { t } = useI18n();
	const d = t.work.thread;
	const item = (useWorkItems({}).data ?? []).find((i) => i.key === itemKey);
	const edit = useTicketEditCaps().data;
	const act = useWorkActions();
	const { error, run } = useGuard();
	// `null` when not editing.
	const [title, setTitle] = useState<string | null>(null);
	if (!item) return null;
	if (title === null)
		return (
			<div className="flex items-start gap-1">
				<h3 className="min-w-0 flex-1 text-16 font-medium [overflow-wrap:anywhere]">
					{item.title}
				</h3>
				{edit?.title ? (
					<IconButton label={d.editSummary} onClick={() => setTitle(item.title)}>
						<PencilIcon size={14} />
					</IconButton>
				) : null}
			</div>
		);
	return (
		<form
			className="flex flex-col gap-2"
			onKeyDown={(e) => {
				if (e.key !== "Escape") return;
				e.stopPropagation();
				setTitle(null);
			}}
			onSubmit={async (e) => {
				e.preventDefault();
				if (await run(() => act.editTicket(itemKey, title, null))) setTitle(null);
			}}
		>
			<Input label={d.summary} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
			<div className="flex gap-2">
				<Button type="submit" disabled={title.trim() === "" || title.trim() === item.title}>
					{d.save}
				</Button>
				<Button onClick={() => setTitle(null)}>{d.cancel}</Button>
			</div>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</form>
	);
}

/** A value button of a row (ticket page). It opens the edit of the field; Escape, Enter or a click away close it. */
function RowValue({
	shown,
	children,
}: {
	shown: string;
	children: (close: () => void) => ReactNode;
}) {
	const [open, setOpen] = useState(false);
	if (!open) return <Button onClick={() => setOpen(true)}>{shown}</Button>;
	const close = () => setOpen(false);
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the keys and the blur of the field bubble here
		<div
			className="flex items-center justify-end gap-1"
			onBlur={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget)) close();
			}}
			onKeyDown={(e) => {
				if (e.key !== "Escape") return;
				e.stopPropagation();
				close();
			}}
		>
			{children(close)}
		</div>
	);
}

/** The labels of a ticket: chips that remove on a click, and a field to add one. `rows`: the ticket page, where a button opens the field. */
export function TicketLabels({ itemKey, rows }: { itemKey: string; rows?: boolean }) {
	const { t } = useI18n();
	const d = t.work.thread;
	const item = (useWorkItems({}).data ?? []).find((i) => i.key === itemKey);
	const edit = useTicketEditCaps().data;
	const act = useWorkActions();
	const { error, run } = useGuard();
	const [label, setLabel] = useState("");
	if (!(item && edit)) return null;
	return (
		<div className="flex flex-wrap items-center justify-end gap-2">
			<div className="flex flex-wrap items-center gap-1">
				{item.labels.map((l) =>
					edit.removeLabel ? (
						<Button
							key={l}
							variant="ghost"
							className={rows ? "rounded-full bg-n-3" : undefined}
							aria-label={format(d.removeLabel, { label: l })}
							onClick={() => void run(() => act.removeLabel(itemKey, l))}
						>
							{l}
							{rows ? <XMarkIcon size={14} /> : null}
						</Button>
					) : (
						<Badge key={l}>{l}</Badge>
					),
				)}
			</div>
			{edit.labels && rows ? (
				<RowValue shown={d.addALabel}>
					{(close) => (
						<form
							className="flex items-center gap-2"
							onSubmit={async (e) => {
								e.preventDefault();
								if (await run(() => act.addLabel(itemKey, label))) {
									setLabel("");
									close();
								}
							}}
						>
							<Input
								label={d.label}
								className="w-32"
								value={label}
								onChange={(e) => setLabel(e.target.value)}
								autoFocus
							/>
							<Button type="submit" disabled={label.trim() === ""}>
								{d.addLabel}
							</Button>
						</form>
					)}
				</RowValue>
			) : edit.labels ? (
				<form
					className="flex items-center gap-2"
					onSubmit={async (e) => {
						e.preventDefault();
						if (await run(() => act.addLabel(itemKey, label))) setLabel("");
					}}
				>
					<Input
						label={d.label}
						className="w-32"
						value={label}
						onChange={(e) => setLabel(e.target.value)}
					/>
					<Button type="submit" disabled={label.trim() === ""}>
						{d.addLabel}
					</Button>
				</form>
			) : null}
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</div>
	);
}

/** One property: its name on the left, its value on the right. A narrow panel wraps the value below. */
// shortcut: the page does not hold the saved value of a field, so a row shows the last value of this session.
export function Prop({ label, children }: { label: string; children: ReactNode }) {
	const id = useId();
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
		<div role="group" aria-labelledby={id} className="flex flex-wrap gap-x-3 gap-y-1 py-2">
			<span id={id} className="w-28 shrink-0 pt-1 text-12 text-n-11">
				{label}
			</span>
			<div className="flex min-w-0 flex-[1_1_9rem] flex-col gap-1">{children}</div>
		</div>
	);
}

/** One text field of a property: Enter and blur save it, and only when it holds a value. */
function SaveField({
	value,
	ok,
	onChange,
	onSave,
	...props
}: {
	value: string;
	/** True when the text is worth a save. */
	ok: boolean;
	onChange: (v: string) => void;
	onSave: () => void;
} & Omit<InputProps, "value" | "onChange">) {
	return (
		<Input
			{...props}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			onBlur={() => ok && onSave()}
			onKeyDown={(e) => {
				if (e.key !== "Enter") return;
				e.preventDefault();
				if (ok) onSave();
			}}
		/>
	);
}

/** The fields of a ticket that one control sets: priority, type, due date and estimate. `rows`: the ticket page, where a button opens each field. */
export function TicketFields({
	itemKey,
	rows,
	only,
}: {
	itemKey: string;
	rows?: boolean;
	/** Draw only these fields, so the page can put its own rows between them. */
	only?: ("type" | "estimate" | "due" | "priority")[];
}) {
	const { t } = useI18n();
	const d = t.work.thread;
	const x = t.personal.thread;
	const edit = useTicketEditCaps().data;
	const act = useWorkActions();
	const { error, run } = useGuard();
	const [priority, setPriority] = useState("");
	const [type, setType] = useState("");
	// `saved` is the last date sent: a blur with the same date writes nothing.
	const [due, setDue] = useState("");
	const [saved, setSaved] = useState("");
	const [days, setDays] = useState("");
	if (!edit) return null;
	const sendDue = async (to: string) => {
		if (await run(() => act.setDue(itemKey, to || null))) {
			setDue(to);
			setSaved(to);
		}
	};
	// A form keeps the field after a save; a row shows its value on the button.
	const wrap = (shown: string, field: (close: () => void) => ReactNode) =>
		rows ? <RowValue shown={shown}>{field}</RowValue> : field(() => undefined);
	const keep = (clear: () => void) => (rows ? undefined : clear());
	const on = (k: NonNullable<typeof only>[number]) => !only || only.includes(k);
	return (
		<>
			{edit.issueType && on("type") ? (
				<Prop label={x.type}>
					{wrap(type || d.set, (close) => (
						<SaveField
							label={x.type}
							className="w-40"
							autoFocus={rows}
							value={type}
							ok={type.trim() !== ""}
							onChange={setType}
							onSave={async () => {
								if (await run(() => act.setType(itemKey, type))) {
									keep(() => setType(""));
									close();
								}
							}}
						/>
					))}
				</Prop>
			) : null}
			{edit.estimate && on("estimate") ? (
				<Prop label={x.estimate}>
					{wrap(days || d.set, (close) => (
						<SaveField
							label={x.estimate}
							type="number"
							className="w-40"
							autoFocus={rows}
							min={0}
							step="0.5"
							value={days}
							ok={days.trim() !== "" && Number(days) >= 0}
							onChange={setDays}
							onSave={async () => {
								if (await run(() => act.setEstimate(itemKey, Number(days)))) {
									keep(() => setDays(""));
									close();
								}
							}}
						/>
					))}
				</Prop>
			) : null}
			{edit.dueDate && on("due") ? (
				<Prop label={x.due}>
					{wrap(saved || d.set, (close) => (
						<div className="flex items-center justify-end gap-1">
							<SaveField
								label={x.due}
								type="date"
								className="w-40"
								autoFocus={rows}
								value={due}
								ok={due !== saved}
								onChange={setDue}
								onSave={() => void sendDue(due).then(rows ? close : undefined)}
							/>
							<IconButton label={x.clearDue} onClick={() => void sendDue("")}>
								<XMarkIcon size={14} />
							</IconButton>
						</div>
					))}
				</Prop>
			) : null}
			{edit.priority && on("priority") ? (
				<Prop label={d.priority}>
					<Select
						label={d.priority}
						className="w-auto min-w-24 max-w-full shrink"
						placeholder={rows ? d.set : undefined}
						value={priority}
						onValueChange={(p) =>
							void run(() => act.setPriority(itemKey, p)).then((ok) => ok && setPriority(p))
						}
						items={Object.entries(d.priorities).map(([value, label]) => ({ value, label }))}
					/>
				</Prop>
			) : null}
			{error ? (
				<p role="alert" className="py-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</>
	);
}

/** The description reads as Markdown. Edit swaps it for a field that grows with its text. */
export function TicketDescription({ itemKey }: { itemKey: string }) {
	const { t } = useI18n();
	const d = t.work.thread;
	const item = (useWorkItems({}).data ?? []).find((i) => i.key === itemKey);
	const edit = useTicketEditCaps().data;
	const act = useWorkActions();
	const { error, run } = useGuard();
	// `null` when not editing: the field opens with the description of the tracker.
	const [description, setDescription] = useState<string | null>(null);
	const area = useRef<HTMLTextAreaElement>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the height follows the text
	useEffect(() => {
		const el = area.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${el.scrollHeight}px`;
	}, [description]);
	if (!(item && edit)) return null;

	return (
		<section aria-label={d.title} className="flex flex-col gap-3">
			<TicketBudget item={item} />
			{description !== null ? (
				<form
					className="flex flex-col gap-2"
					onKeyDown={(e) => {
						if (e.key !== "Escape") return;
						e.stopPropagation();
						setDescription(null);
					}}
					onSubmit={async (e) => {
						e.preventDefault();
						if (await run(() => act.editTicket(itemKey, null, description))) setDescription(null);
					}}
				>
					<Textarea
						ref={area}
						rows={8}
						label={d.description}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						className="resize-none"
						autoFocus
					/>
					<div className="flex gap-2">
						<Button type="submit" disabled={description === item.description}>
							{d.saveDescription}
						</Button>
						<Button onClick={() => setDescription(null)}>{d.cancel}</Button>
					</div>
				</form>
			) : item.description.trim() !== "" ? (
				<div className="flex items-start gap-1">
					<div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
						<MarkdownView source={item.description} label={d.description} reading />
					</div>
					{edit.description ? (
						<IconButton label={d.editDescription} onClick={() => setDescription(item.description)}>
							<PencilIcon size={14} />
						</IconButton>
					) : null}
				</div>
			) : edit.description ? (
				<div>
					<Button onClick={() => setDescription("")}>{d.addDescription}</Button>
				</div>
			) : null}
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</section>
	);
}

/** The comments and the box to post one. A tracker without comments says so and shows no box. */
export function TicketComments({ itemKey }: { itemKey: string }) {
	const { t } = useI18n();
	const d = t.work.thread;
	const caps = useWorkContext().data?.capabilities;
	const comments = useTicketComments(itemKey, caps?.comments === true);
	const act = useWorkActions();
	const { error, run } = useGuard();
	const [body, setBody] = useState("");
	if (!caps) return null;
	return (
		<section aria-label={d.comments} className="flex flex-col gap-3">
			{caps.comments ? (
				<>
					<ul aria-label={d.comments} className="flex flex-col gap-2">
						{(comments.data ?? []).map((c) => (
							<li key={c.id} className="flex min-w-0 flex-col text-ui [overflow-wrap:anywhere]">
								<span className="text-12 text-n-11">
									{c.author} <time dateTime={c.created}>{c.created.slice(0, 10)}</time>
								</span>
								<MarkdownView source={c.body} label={c.author} />
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
