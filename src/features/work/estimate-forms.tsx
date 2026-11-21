import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { EstimateAgent } from "@/features/plan/estimate-agent";
import { Stepper } from "@/features/plan/estimate-stepper";
import { format, useI18n } from "@/lib/i18n";
import { confirmDialog } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { useWorkItems } from "@/lib/sync";
import { cn } from "@/lib/utils";
import {
	type Confidence,
	figure,
	type Sheet,
	type SheetView,
	slugify,
	type Task,
	useSheet,
	useTeam,
	useWorkActions,
} from "@/lib/work";
import { Button } from "@/ui/atoms/button";
import { Checkbox } from "@/ui/atoms/checkbox";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { linkClass } from "@/ui/atoms/link-button";
import { Select } from "@/ui/atoms/select";
import { XMarkIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { useGuard } from "./guard";
import { roleId } from "./team-rights";
import { TicketField } from "./ticket-field";

/** Each control inside is 44 px high or more (`spec:app-redesign#REQ-026`). A checkbox keeps its size. */
export const CONTROLS =
	"[&_button:not([role=checkbox])]:min-h-control [&_button:not([role=checkbox])]:min-w-(--control-h) [&_input:not([aria-hidden]):not([type=checkbox])]:min-h-control";

const NEW = "@@new";
const MINUTES_PER_DAY = 480;

/** A task id that no task of the sheet uses. */
function freeId(sheet: Sheet, base: string) {
	const used = new Set(sheet.features.flatMap((f) => f.tasks.map((t) => t.id)));
	let id = base || "task";
	for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
	return id;
}

function Alert({ text }: { text: string | null }) {
	return text ? (
		<p role="alert" className="text-ui text-danger-text">
			{text}
		</p>
	) : null;
}

const COLS = "flex flex-wrap items-start gap-6";
const FIELD = "flex flex-wrap items-center gap-3";
const NAME = "flex-[1_1_10rem] font-semibold";
const LEVELS = ["low", "medium", "high"] as const;

/**
 * One task of a sheet, as the body of its page (Plan / Estimates, one estimate). It writes the
 * entry and no total (REQ-010). `side` holds the cards of the right column that the page gives.
 */
export function TaskForm({
	slug,
	view,
	taskId,
	side,
	more,
	onSaved,
	onRemoved,
}: {
	slug: string;
	view: SheetView;
	/** Null for a new task. */
	taskId: string | null;
	side?: ReactNode;
	/** The card with the name, the effort and Remove of a task shows (the menu of the page). A new task shows it always. */
	more?: boolean;
	onSaved: (taskId: string) => void;
	onRemoved: () => void;
}) {
	const { t, lang } = useI18n();
	const e = t.work.estimates;
	const c = t.costing.task;
	const p = t.costing.estimate;
	const a = t.costing.agent;
	const sheet = view.sheet;
	const roleName = (id: string) => (t.rights.role as Record<string, string>)[roleId(id)] ?? id;
	const members = useTeam().data?.team.members ?? [];
	const roles = [
		...new Set([
			...members.map((m) => m.role),
			...sheet.features.flatMap((f) => f.tasks.map((x) => x.role)),
		]),
	];
	const act = useWorkActions();
	const { error, run } = useGuard();
	const found = sheet.features
		.flatMap((f) => f.tasks.map((x) => ({ f, x })))
		.find((r) => r.x.id === taskId);
	const [feature, setFeature] = useState(found?.f.id ?? sheet.features[0]?.id ?? NEW);
	const [newFeature, setNewFeature] = useState("");
	const [name, setName] = useState(found?.x.name ?? "");
	const [role, setRole] = useState(found?.x.role ?? roles[0] ?? "");
	const [mode, setMode] = useState<"days" | "percent">(
		found?.x.percent != null ? "percent" : "days",
	);
	const [effort, setEffort] = useState(String(found?.x.percent ?? found?.x.days ?? ""));
	const [other, setOther] = useState(found?.x.other ?? false);
	const [ticket, setTicket] = useState(found?.x.ticket ?? "");
	const [ticketOpen, setTicketOpen] = useState(false);
	const [note, setNote] = useState(found?.x.note ?? "");
	const [low, setLow] = useState(String(found?.x.optimistic ?? ""));
	const [high, setHigh] = useState(String(found?.x.pessimistic ?? ""));
	const [confidence, setConfidence] = useState<Confidence | "">(found?.x.confidence ?? "");
	const [assumptions, setAssumptions] = useState(
		(found?.x.assumptions ?? "").split("\n").filter((x) => x.trim() !== ""),
	);
	const [draft, setDraft] = useState("");
	const choices = useWorkItems({}).data ?? [];
	const linked = view.tickets.find((x) => x.task === taskId);
	// A three-point estimate has both ends. One end alone is not an estimate.
	const points = mode === "days" && low !== "" && high !== "";
	const oneEnd = mode === "days" && (low === "") !== (high === "");
	const expected =
		points && effort !== ""
			? Math.round(((Number(low) + 4 * Number(effort) + Number(high)) / 6) * 8) / 8
			: null;
	const frozen = sheet.frozen === true;

	const save = async () => {
		const featureId = feature === NEW ? freeFeature(sheet, newFeature) : feature;
		const id = found?.x.id ?? freeId(sheet, slugify(`${featureId}-${name}`));
		const n = Number(effort);
		// A text that waits in the field of a new assumption is saved too.
		const lines = [...assumptions, draft.trim()].filter(Boolean);
		const entry: Task = {
			id,
			name,
			description: found?.x.description ?? "",
			role,
			...(mode === "days" ? { days: n } : { percent: n }),
			...(mode === "days" && other ? { other: true } : {}),
			...(ticket.trim() ? { ticket: ticket.trim() } : {}),
			note,
			...(points ? { optimistic: Number(low), pessimistic: Number(high) } : {}),
			...(confidence ? { confidence } : {}),
			...(lines.length > 0 ? { assumptions: lines.join("\n") } : {}),
		};
		const withFeature = sheet.features.some((f) => f.id === featureId)
			? sheet.features
			: [...sheet.features, { id: featureId, name: newFeature.trim(), description: "", tasks: [] }];
		// The task keeps its place in its feature. A moved task leaves its old feature.
		const features = withFeature.map((f) => {
			if (f.id !== featureId) return { ...f, tasks: f.tasks.filter((x) => x.id !== id) };
			return f.tasks.some((x) => x.id === id)
				? { ...f, tasks: f.tasks.map((x) => (x.id === id ? entry : x)) }
				: { ...f, tasks: [...f.tasks, entry] };
		});
		if (await run(() => act.saveSheet(slug, { ...sheet, features }))) onSaved(id);
	};

	const stepper = (label: string, value: string, set: (v: string) => void) => (
		<div className="flex flex-[1_1_150px] flex-col items-start gap-2">
			<span className="text-13 font-semibold text-n-11">{label}</span>
			<Stepper
				label={label}
				value={value}
				onType={set}
				onStep={(by) => set(String(Math.max(0, (Number(value) || 0) + by)))}
			/>
		</div>
	);
	const nameField = (
		<div className={FIELD}>
			<span className={NAME}>{e.sheetName}</span>
			<Input
				label={e.task}
				value={name}
				onChange={(ev) => setName(ev.target.value)}
				className="flex-[1_1_200px]"
			/>
		</div>
	);

	return (
		<div className={`${COLS} ${CONTROLS}`}>
			<div className="flex min-w-0 flex-[3_1_480px] flex-col gap-4">
				<Card pad>
					<form
						className="flex flex-col gap-5"
						onSubmit={(ev) => {
							ev.preventDefault();
							void save();
						}}
					>
						{found ? null : nameField}
						<div className="flex flex-wrap gap-4">
							{mode === "days" ? (
								<>
									{stepper(a.best, low, setLow)}
									{stepper(c.likely, effort, setEffort)}
									{stepper(a.worst, high, setHigh)}
								</>
							) : (
								stepper(e.percent, effort, setEffort)
							)}
						</div>
						{expected != null ? (
							<output className="text-n-11">
								{format(c.expected, { days: figure(expected, lang) })}
							</output>
						) : null}
						{found && mode === "percent" ? (
							<p className="text-n-11">
								{format(e.computed, { days: figure(view.days[found.x.id], lang) })}
							</p>
						) : null}
						<div className={FIELD}>
							<span className={NAME}>{p.howSure}</span>
							{/* biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box */}
							<div role="group" aria-label={p.howSure} className="flex rounded-md bg-n-4 p-1">
								{LEVELS.map((v) => (
									// `Segmented` always has one choice on. Here a second press clears the choice.
									<button
										key={v}
										type="button"
										aria-pressed={confidence === v}
										onClick={() => setConfidence(confidence === v ? "" : v)}
										className={cn(
											"min-h-control rounded-sm px-3.5 font-medium",
											confidence === v
												? "bg-surface-1 text-n-12 shadow-1"
												: "text-n-10 hover:text-n-12",
										)}
									>
										{c.level[v]}
									</button>
								))}
							</div>
						</div>
						<div className={FIELD}>
							<span className={NAME}>{e.role}</span>
							{roles.length > 0 ? (
								<Select
									label={e.role}
									value={role}
									onValueChange={setRole}
									className="font-semibold [&_svg]:hidden"
									items={roles.map((r) => ({ value: r, label: roleName(r) }))}
								/>
							) : (
								// No team and no task yet: no role to choose from.
								<Input
									label={e.role}
									value={role}
									onChange={(ev) => setRole(ev.target.value)}
									className="w-40"
								/>
							)}
							<span className="font-semibold">{e.feature}</span>
							<Select
								label={e.feature}
								value={feature}
								className="font-semibold [&_svg]:hidden"
								onValueChange={setFeature}
								items={[
									...sheet.features.map((f) => ({ value: f.id, label: f.name })),
									{ value: NEW, label: e.newFeature },
								]}
							/>
							{feature === NEW ? (
								<Input
									label={e.featureName}
									value={newFeature}
									onChange={(ev) => setNewFeature(ev.target.value)}
									className="flex-[1_1_200px]"
								/>
							) : null}
						</div>
						<div className={FIELD}>
							<span className={NAME}>{e.ticket}</span>
							{ticket && !ticketOpen ? (
								<>
									<Link
										to="/flow/list"
										search={{ q: ticket } as never}
										className={cn(linkClass, "self-center")}
									>
										{linked && ticket === found?.x.ticket ? linked.title : ticket}
									</Link>
									<Button onClick={() => setTicketOpen(true)}>{p.change}</Button>
								</>
							) : ticketOpen ? (
								<span className="min-w-0 flex-[1_1_200px]">
									<TicketField
										label={e.ticket}
										value={ticket}
										onChange={setTicket}
										items={choices}
									/>
								</span>
							) : (
								<Button onClick={() => setTicketOpen(true)}>{p.chooseTicket}</Button>
							)}
						</div>
						{linked ? (
							<dl className="flex gap-6">
								<div>
									<dt className="text-13 text-n-11">{e.taskEstimate}</dt>
									<dd>
										{figure(view.days[linked.task], lang)} {e.dayUnit}
									</dd>
								</div>
								<div>
									<dt className="text-13 text-n-11">{e.ticketEstimate}</dt>
									<dd>
										{linked.estimateMinutes == null
											? "—"
											: `${figure(linked.estimateMinutes / MINUTES_PER_DAY, lang)} ${e.dayUnit}`}
									</dd>
								</div>
							</dl>
						) : null}
						<div className={FIELD}>
							<span className={NAME}>{e.note}</span>
							<Input
								label={e.note}
								value={note}
								onChange={(ev) => setNote(ev.target.value)}
								className="flex-[1_1_200px]"
							/>
						</div>
						{mode === "days" ? (
							<div className="flex min-h-control items-center gap-3">
								<span className="mr-auto font-semibold">{p.otherWork}</span>
								<Checkbox
									label={p.otherWork}
									hideLabel
									checked={other}
									onCheckedChange={setOther}
								/>
							</div>
						) : null}
						<Alert text={error} />
						<RightButton
							right="work.edit"
							type="submit"
							variant="primary"
							className="self-start"
							reason={oneEnd ? p.bothEnds : undefined}
							disabled={
								name.trim() === "" ||
								effort === "" ||
								(feature === NEW && newFeature.trim() === "") ||
								oneEnd ||
								frozen
							}
						>
							{t.work.save}
						</RightButton>
					</form>
					{found ? (
						<div className="flex flex-col gap-3 pt-5">
							<EstimateAgent slug={slug} view={view} ids={[found.x.id]} />
						</div>
					) : null}
				</Card>
				<Card pad className="flex flex-col gap-3">
					<h2 className="text-17 font-semibold">{p.onlyIf}</h2>
					{assumptions.map((line, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: two lines can hold the same text
							key={i}
							className="flex items-center gap-2 rounded-field bg-n-3 p-4"
						>
							<span className="min-w-0 flex-1">{line}</span>
							<IconButton
								label={format(p.removeAssumption, { text: line })}
								onClick={() => setAssumptions(assumptions.filter((_, at) => at !== i))}
							>
								<XMarkIcon size={14} />
							</IconButton>
						</div>
					))}
					<form
						className="flex flex-wrap gap-2.5"
						onSubmit={(ev) => {
							ev.preventDefault();
							if (draft.trim() === "") return;
							setAssumptions([...assumptions, draft.trim()]);
							setDraft("");
						}}
					>
						<Input
							label={p.newAssumption}
							value={draft}
							onChange={(ev) => setDraft(ev.target.value)}
							className="flex-[1_1_200px]"
						/>
						<Button type="submit">{p.add}</Button>
					</form>
				</Card>
			</div>
			<div className="flex min-w-0 flex-[2_1_300px] flex-col gap-4">
				{side}
				{found && !more ? null : (
					<Card pad className="flex flex-col gap-3">
						<h2 className="text-13 font-semibold text-n-11">{t.ui.more}</h2>
						{found ? nameField : null}
						<div className={FIELD}>
							<span className={NAME}>{e.effort}</span>
							<Select
								label={e.effort}
								value={mode}
								onValueChange={(v) => setMode(v as "days" | "percent")}
								items={[
									{ value: "days", label: e.days },
									{ value: "percent", label: e.percent },
								]}
							/>
						</div>
						{found ? (
							<RightButton
								right="work.edit"
								className="self-start text-danger-text"
								disabled={frozen}
								onClick={() =>
									void run(async () => {
										if (!(await confirmDialog(format(e.confirmRemove, { name: found.x.name }))))
											return;
										await act.saveSheet(slug, {
											...sheet,
											features: sheet.features.map((f) => ({
												...f,
												tasks: f.tasks.filter((x) => x.id !== found.x.id),
											})),
										});
										onRemoved();
									})
								}
							>
								{t.work.remove}
							</RightButton>
						) : null}
					</Card>
				)}
			</div>
		</div>
	);
}

const freeFeature = (sheet: Sheet, name: string) => {
	const base = slugify(name) || "feature";
	let id = base;
	for (let n = 2; sheet.features.some((f) => f.id === id); n++) id = `${base}-${n}`;
	return id;
};

/** The name, currency and margin of a sheet, or a new sheet, as the body of its page. */
export function SheetForm({
	slug,
	onSaved,
}: {
	/** The sheet to change. Null for a new one. */
	slug: string | null;
	onSaved: (slug: string) => void;
}) {
	const { t } = useI18n();
	const e = t.work.estimates;
	const view = useSheet(slug).data;
	const act = useWorkActions();
	const { error, run } = useGuard();
	const [name, setName] = useState(view?.sheet.name ?? "");
	const [currency, setCurrency] = useState(view?.sheet.currency ?? "EUR");
	const [margin, setMargin] = useState(
		view?.sheet.marginRate == null ? "" : String(Math.round(view.sheet.marginRate * 10000) / 100),
	);
	const [id, setId] = useState(slug ?? "");
	const target = slug ?? (id || slugify(name));
	return (
		<form
			className={`flex max-w-3xl flex-col gap-4 ${CONTROLS}`}
			onSubmit={async (ev) => {
				ev.preventDefault();
				const sheet: Sheet = {
					features: [],
					...view?.sheet,
					name,
					currency: currency.toUpperCase(),
					marginRate: margin === "" ? null : Number(margin) / 100,
				};
				if (await run(() => act.saveSheet(target, sheet))) onSaved(target);
			}}
		>
			<Card className="py-2">
				<SettingsRow label={e.sheetName}>
					<Input label={e.sheetName} value={name} onChange={(ev) => setName(ev.target.value)} />
				</SettingsRow>
				{slug === null ? (
					<SettingsRow label={e.slug}>
						<Input
							label={e.slug}
							value={id || slugify(name)}
							onChange={(ev) => setId(ev.target.value)}
						/>
					</SettingsRow>
				) : null}
				<SettingsRow label={e.currency}>
					<Input
						label={e.currency}
						value={currency}
						maxLength={3}
						onChange={(ev) => setCurrency(ev.target.value)}
					/>
				</SettingsRow>
				<SettingsRow label={e.margin}>
					<Input
						label={e.margin}
						type="number"
						min={0}
						step={0.5}
						value={margin}
						onChange={(ev) => setMargin(ev.target.value)}
					/>
				</SettingsRow>
			</Card>
			<Alert text={error} />
			<RightButton
				right="work.edit"
				type="submit"
				variant="primary"
				className="self-start"
				disabled={name.trim() === "" || target === "" || view?.sheet.frozen === true}
			>
				{t.work.save}
			</RightButton>
		</form>
	);
}
