import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { confirmDialog } from "@/lib/ipc";
import { useShell } from "@/lib/shell";
import {
	type Confidence,
	figure,
	type Sheet,
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
import { Select } from "@/ui/atoms/select";
import { Textarea } from "@/ui/atoms/textarea";
import { TrashIcon } from "@/ui/icons";
import { useGuard } from "./guard";

const NEW = "@@new";
const UNSET = "@@unset";
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

/** One task of a sheet, in the inspector. It writes the entry and no total (REQ-010). */
export function TaskForm({ slug, taskId }: { slug: string; taskId: string | null }) {
	const { t, lang } = useI18n();
	const e = t.work.estimates;
	const view = useSheet(slug).data;
	const roles = [...new Set((useTeam().data?.team.members ?? []).map((m) => m.role))];
	const act = useWorkActions();
	const { openDetail } = useShell();
	const { error, run } = useGuard();
	const sheet = view?.sheet;
	const found = sheet?.features
		.flatMap((f) => f.tasks.map((x) => ({ f, x })))
		.find((r) => r.x.id === taskId);
	const [feature, setFeature] = useState(found?.f.id ?? sheet?.features[0]?.id ?? NEW);
	const [newFeature, setNewFeature] = useState("");
	const [name, setName] = useState(found?.x.name ?? "");
	const [role, setRole] = useState(found?.x.role ?? roles[0] ?? "");
	const [mode, setMode] = useState<"days" | "percent">(
		found?.x.percent != null ? "percent" : "days",
	);
	const [effort, setEffort] = useState(String(found?.x.percent ?? found?.x.days ?? ""));
	const [other, setOther] = useState(found?.x.other ?? false);
	const [ticket, setTicket] = useState(found?.x.ticket ?? "");
	const [note, setNote] = useState(found?.x.note ?? "");
	const [three, setThree] = useState(found?.x.optimistic != null);
	const [low, setLow] = useState(String(found?.x.optimistic ?? ""));
	const [high, setHigh] = useState(String(found?.x.pessimistic ?? ""));
	const [confidence, setConfidence] = useState<Confidence | "">(found?.x.confidence ?? "");
	const [assumptions, setAssumptions] = useState(found?.x.assumptions ?? "");
	const c = t.costing.task;
	if (!view || !sheet) return null;
	const linked = view.tickets.find((x) => x.task === taskId);
	const points = mode === "days" && three;
	const expected =
		points && low !== "" && high !== "" && effort !== ""
			? Math.round(((Number(low) + 4 * Number(effort) + Number(high)) / 6) * 8) / 8
			: null;

	const save = async () => {
		const featureId = feature === NEW ? freeFeature(sheet, newFeature) : feature;
		const id = found?.x.id ?? freeId(sheet, slugify(`${featureId}-${name}`));
		const n = Number(effort);
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
			...(assumptions.trim() ? { assumptions } : {}),
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
		if (await run(() => act.saveSheet(slug, { ...sheet, features })))
			openDetail(name, <TaskForm key={id} slug={slug} taskId={id} />);
	};

	return (
		<form
			className="flex flex-col gap-2"
			onSubmit={(ev) => {
				ev.preventDefault();
				void save();
			}}
		>
			<Select
				caption
				label={e.feature}
				value={feature}
				onValueChange={setFeature}
				items={[
					...sheet.features.map((f) => ({ value: f.id, label: f.name })),
					{ value: NEW, label: e.newFeature },
				]}
			/>
			{feature === NEW ? (
				<Input
					caption
					label={e.featureName}
					value={newFeature}
					onChange={(ev) => setNewFeature(ev.target.value)}
				/>
			) : null}
			<Input caption label={e.task} value={name} onChange={(ev) => setName(ev.target.value)} />
			<Input
				caption
				label={e.role}
				value={role}
				list="work-roles"
				onChange={(ev) => setRole(ev.target.value)}
			/>
			<datalist id="work-roles">
				{roles.map((r) => (
					<option key={r} value={r} />
				))}
			</datalist>
			<div className="flex gap-2">
				<Select
					caption
					label={e.effort}
					value={mode}
					onValueChange={(v) => setMode(v as "days" | "percent")}
					items={[
						{ value: "days", label: e.days },
						{ value: "percent", label: e.percent },
					]}
				/>
				<Input
					caption
					label={points ? c.likely : mode === "days" ? e.days : e.percent}
					type="number"
					min={0}
					step={0.25}
					value={effort}
					onChange={(ev) => setEffort(ev.target.value)}
				/>
			</div>
			{mode === "days" ? (
				<Checkbox label={c.threePoint} checked={three} onCheckedChange={setThree} />
			) : null}
			{points ? (
				<div className="flex gap-2">
					<Input
						caption
						label={c.optimistic}
						type="number"
						min={0}
						step={0.25}
						value={low}
						onChange={(ev) => setLow(ev.target.value)}
					/>
					<Input
						caption
						label={c.pessimistic}
						type="number"
						min={0}
						step={0.25}
						value={high}
						onChange={(ev) => setHigh(ev.target.value)}
					/>
				</div>
			) : null}
			{expected != null ? (
				<output className="font-mono text-12 text-n-11">
					{format(c.expected, { days: figure(expected, lang) })}
				</output>
			) : null}
			<Select
				caption
				label={c.confidence}
				value={confidence || UNSET}
				onValueChange={(v) => setConfidence(v === UNSET ? "" : (v as Confidence))}
				items={[
					{ value: UNSET, label: c.unset },
					...(["low", "medium", "high"] as const).map((v) => ({ value: v, label: c.level[v] })),
				]}
			/>
			{found && mode === "percent" ? (
				<p className="font-mono text-12 text-n-11">
					{format(t.work.estimates.computed, { days: figure(view.days[found.x.id], lang) })}
				</p>
			) : null}
			{mode === "days" ? (
				<Checkbox label={e.other} checked={other} onCheckedChange={setOther} />
			) : null}
			<Input
				caption
				label={e.ticket}
				value={ticket}
				onChange={(ev) => setTicket(ev.target.value)}
				className="font-mono"
			/>
			{linked ? (
				<dl className="flex gap-6">
					<div>
						<dt className="text-12 text-n-11">{e.taskEstimate}</dt>
						<dd className="font-mono">
							{figure(view.days[linked.task], lang)} {e.dayUnit}
						</dd>
					</div>
					<div>
						<dt className="text-12 text-n-11">{e.ticketEstimate}</dt>
						<dd className="font-mono">
							{linked.estimateMinutes == null
								? "—"
								: `${figure(linked.estimateMinutes / MINUTES_PER_DAY, lang)} ${e.dayUnit}`}
						</dd>
					</div>
				</dl>
			) : null}
			<Textarea
				caption
				label={c.assumptions}
				value={assumptions}
				onChange={(ev) => setAssumptions(ev.target.value)}
			/>
			<Textarea caption label={e.note} value={note} onChange={(ev) => setNote(ev.target.value)} />
			<Alert text={error} />
			<div className="flex items-center gap-2">
				<Button
					type="submit"
					disabled={
						name.trim() === "" ||
						effort === "" ||
						(feature === NEW && newFeature.trim() === "") ||
						(points && (low === "" || high === "")) ||
						sheet.frozen === true
					}
				>
					{t.work.save}
				</Button>
				{found ? (
					<IconButton
						label={t.work.remove}
						disabled={sheet.frozen === true}
						onClick={() =>
							void run(async () => {
								if (!(await confirmDialog(format(e.confirmRemove, { name: found.x.name })))) return;
								await act.saveSheet(slug, {
									...sheet,
									features: sheet.features.map((f) => ({
										...f,
										tasks: f.tasks.filter((x) => x.id !== found.x.id),
									})),
								});
							})
						}
					>
						<TrashIcon size={14} />
					</IconButton>
				) : null}
			</div>
		</form>
	);
}

const freeFeature = (sheet: Sheet, name: string) => {
	const base = slugify(name) || "feature";
	let id = base;
	for (let n = 2; sheet.features.some((f) => f.id === id); n++) id = `${base}-${n}`;
	return id;
};

/** The name, currency and margin of a sheet, or a new sheet. */
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
			className="flex flex-col gap-2"
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
			<Input caption label={e.sheetName} value={name} onChange={(ev) => setName(ev.target.value)} />
			{slug === null ? (
				<Input
					caption
					label={e.slug}
					value={id || slugify(name)}
					onChange={(ev) => setId(ev.target.value)}
					className="font-mono"
				/>
			) : null}
			<Input
				caption
				label={e.currency}
				value={currency}
				maxLength={3}
				onChange={(ev) => setCurrency(ev.target.value)}
			/>
			<Input
				caption
				label={e.margin}
				type="number"
				min={0}
				step={0.5}
				value={margin}
				onChange={(ev) => setMargin(ev.target.value)}
			/>
			<Alert text={error} />
			<div>
				<Button
					type="submit"
					disabled={name.trim() === "" || target === "" || view?.sheet.frozen === true}
				>
					{t.work.save}
				</Button>
			</div>
		</form>
	);
}
