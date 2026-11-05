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

/** The labels of a ticket: chips that remove on a click, and a field to add one. */
export function TicketLabels({ itemKey }: { itemKey: string }) {
	const { t } = useI18n();
	const d = t.work.thread;
	const item = (useWorkItems({}).data ?? []).find((i) => i.key === itemKey);
	const edit = useTicketEditCaps().data;
	const act = useWorkActions();
	const { error, run } = useGuard();
	const [label, setLabel] = useState("");
	if (!(item && edit)) return null;
	return (
		<div className="flex flex-col gap-2">
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
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</div>
	);
}

/** One property: its name on the left, its value on the right. A narrow panel wraps the value below. */
export function Prop({ label, children }: { label: string; children: ReactNode }) {
	const id = useId();
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
		<div role="group" aria-labelledby={id} className="flex flex-wrap gap-x-3 gap-y-1 py-2">
			<span id={id} className="w-20 shrink-0 pt-1 text-12 text-n-11">
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

/** The fields of a ticket that one control sets: priority, type, due date and estimate. */
export function TicketFields({ itemKey }: { itemKey: string }) {
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
	return (
		<>
			{edit.priority ? (
				<Prop label={d.priority}>
					<Select
						label={d.priority}
						className="w-full min-w-0 max-w-full shrink"
						value={priority}
						onValueChange={(p) =>
							void run(() => act.setPriority(itemKey, p)).then((ok) => ok && setPriority(p))
						}
						items={Object.entries(d.priorities).map(([value, label]) => ({ value, label }))}
					/>
				</Prop>
			) : null}
			{edit.issueType ? (
				<Prop label={x.type}>
					<SaveField
						label={x.type}
						value={type}
						ok={type.trim() !== ""}
						onChange={setType}
						onSave={async () => (await run(() => act.setType(itemKey, type))) && setType("")}
					/>
				</Prop>
			) : null}
			{edit.dueDate ? (
				<Prop label={x.due}>
					<div className="flex items-center gap-1">
						<SaveField
							label={x.due}
							type="date"
							value={due}
							ok={due !== saved}
							onChange={setDue}
							onSave={() => void sendDue(due)}
						/>
						<IconButton label={x.clearDue} onClick={() => void sendDue("")}>
							<XMarkIcon size={14} />
						</IconButton>
					</div>
				</Prop>
			) : null}
			{edit.estimate ? (
				<Prop label={x.estimate}>
					<SaveField
						label={x.estimate}
						type="number"
						min={0}
						step="0.5"
						value={days}
						ok={days.trim() !== "" && Number(days) >= 0}
						onChange={setDays}
						onSave={async () =>
							(await run(() => act.setEstimate(itemKey, Number(days)))) && setDays("")
						}
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
