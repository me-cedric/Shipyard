import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Columns, SetupCard, SetupRow, Stepper, Toggle } from "@/features/settings/parts";
import { ButtonLink, Fold } from "@/features/settings/project/fold";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap, type WriteKind } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { RightButton, useRights } from "@/lib/rights";
import { type AutomationView, syncKeys, useAutomation } from "@/lib/sync";
import { Badge } from "@/ui/atoms/badge";
import { Input } from "@/ui/atoms/input";
import { Segmented } from "@/ui/atoms/segmented";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { type Draft, fromDraft, RUN_STATES, STEPS, toDraft } from "./automation-draft";

const WRITES = ["push", "pull_request", "tracker_transition", "tracker_comment"] as const;
const WRITE_KEY = {
	push: "push",
	pull_request: "pullRequest",
	tracker_transition: "trackerTransition",
	tracker_comment: "trackerComment",
} as const;
/** The label that the engine looks for when the file names none (`pickup::Filter::default`). */
const MARK = "shipyard";
const PICKUP = ["statuses", "label", "assignee", "component", "priority"] as const;

/** A row label in regular weight, as the design draws the Automation page. */
const plain = (label: ReactNode) => <span className="font-normal">{label}</span>;

/** `name=2, other=1` as pairs, or null when a part is not `name=number`. */
const pairs = (text: string): [string, number][] | null => {
	const out: [string, number][] = [];
	for (const part of text.split(",").filter((p) => p.trim())) {
		const [name, count] = part.split("=").map((v) => v.trim());
		if (!name || !/^\d+$/.test(count ?? "")) return null;
		out.push([name, Number(count)]);
	}
	return out;
};

function Form({ view }: { view: AutomationView }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const a = t.sync.automation;
	const k = t.doctor.auto;
	const saved = toDraft(view.automation);
	const [draft, setDraft] = useState<Draft>(saved);
	const [error, setError] = useState<unknown>(null);
	const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
	const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

	const save = async () => {
		const parsed = fromDraft(draft, t);
		if ("error" in parsed) return setError(parsed.error);
		try {
			setError(null);
			await unwrap(commands.syncAutomationSave(parsed.automation));
			await qc.invalidateQueries({ queryKey: syncKeys.all });
		} catch (e) {
			setError(e);
		}
	};
	// Remove narrows the draft: Save sends it with the rest, and the save only narrows these
	// permissions. A recipe with no kind left goes out.
	const recipes = Object.entries(draft.kept.recipe_writes ?? {});
	const remove = (recipe: string, kind: WriteKind) =>
		set({
			kept: {
				...draft.kept,
				recipe_writes: Object.fromEntries(
					recipes
						.map(
							([r, kinds]) => [r, r === recipe ? kinds.filter((x) => x !== kind) : kinds] as const,
						)
						.filter(([, kinds]) => kinds.length),
				),
			},
		});

	const text = (id: (typeof PICKUP)[number] | "interval" | "perStatus", type?: "number") => (
		<Input
			label={a[id]}
			type={type}
			min={type ? 0 : undefined}
			value={draft[id]}
			onChange={(e) => set({ [id]: e.target.value })}
		/>
	);
	const global = Number(draft.global) || 0;
	const perStatus = pairs(draft.perStatus) ?? [];
	const mapRow = (name: string, states: readonly string[]) => {
		// A step shows a value when each of its states holds the same one. A change writes each state.
		const same = (field: "status" | "labels") => {
			const first = draft.map[states[0] ?? ""]?.[field] ?? "";
			return states.every((s) => (draft.map[s]?.[field] ?? "") === first) ? first : "";
		};
		const put = (field: "status" | "labels", value: string) =>
			set({
				map: {
					...draft.map,
					...Object.fromEntries(
						states.map((s) => [
							s,
							{ ...(draft.map[s] ?? { status: "", labels: "" }), [field]: value },
						]),
					),
				},
			});
		return (
			<SetupRow key={name} label={plain(name)}>
				<Input
					label={`${name}, ${a.mapStatus}`}
					placeholder={a.mapStatus}
					value={same("status")}
					onChange={(e) => put("status", e.target.value)}
					className="w-36"
				/>
				<Input
					label={`${name}, ${a.mapLabels}`}
					placeholder={a.mapLabels}
					value={same("labels")}
					onChange={(e) => put("labels", e.target.value)}
					className="w-36"
				/>
			</SetupRow>
		);
	};

	return (
		<Columns>
			<div className="flex min-w-0 flex-[3_1_480px] flex-col gap-4">
				<SetupCard>
					<SetupRow label={<span className="text-20 font-normal">{k.pick}</span>}>
						<Toggle
							label={k.pick}
							checked={global > 0}
							// Off is a limit of zero on this computer: the engine starts no run.
							onCheckedChange={(on) =>
								set({ global: on ? String(Math.max(1, Number(saved.global) || 0)) : "0" })
							}
						/>
					</SetupRow>
					{PICKUP.map((id) => (
						<Fold
							key={id}
							id={id === "label" ? "pickup-label" : id}
							label={plain(k.pickup[id])}
							value={draft[id].trim() || k.any}
						>
							{text(id)}
						</Fold>
					))}
					<SetupRow label={plain(k.marked)}>
						<Toggle
							label={k.marked}
							checked={draft.label.trim() !== ""}
							onCheckedChange={(on) => set({ label: on ? saved.label || MARK : "" })}
						/>
					</SetupRow>
					<Fold
						id="interval"
						label={plain(k.look)}
						value={format(k.each, { count: draft.interval })}
					>
						{text("interval", "number")}
					</Fold>
				</SetupCard>
				<SetupCard title={k.atOnce}>
					<SetupRow label={plain(k.computer)}>
						<Stepper
							label={k.computer}
							value={global}
							onValueChange={(v) => set({ global: String(v) })}
						/>
					</SetupRow>
					<SetupRow label={plain(k.project)}>
						<Stepper
							label={k.project}
							// No limit of the project: the limit of this computer holds.
							value={draft.perProject.trim() ? Number(draft.perProject) || 0 : global}
							onValueChange={(v) => set({ perProject: String(v) })}
						/>
					</SetupRow>
					{perStatus.map(([name, count]) => (
						<SetupRow key={name} label={plain(name)}>
							<Stepper
								label={name}
								value={count}
								onValueChange={(v) =>
									set({
										perStatus: perStatus.map(([n, c]) => `${n}=${n === name ? v : c}`).join(", "),
									})
								}
							/>
						</SetupRow>
					))}
					<Fold id="perStatus" label={plain(k.byStatus)} value={t.doctor.project.edit}>
						{text("perStatus")}
					</Fold>
				</SetupCard>
				<SetupCard id="status-map" title={k.shows}>
					{STEPS.map(([step, states]) => mapRow(k.step[step], states))}
					<Fold label={plain(k.states)} value={t.doctor.project.edit}>
						{RUN_STATES.map((state) => {
							const name = format(k.state, { name: t.sync.runState[state] });
							const row = draft.map[state] ?? { status: "", labels: "" };
							const put = (patch: Partial<typeof row>) =>
								set({ map: { ...draft.map, [state]: { ...row, ...patch } } });
							return (
								<span key={state} className="flex w-full flex-wrap gap-2">
									<Input
										label={`${name}, ${a.mapStatus}`}
										value={row.status}
										onChange={(e) => put({ status: e.target.value })}
										className="min-w-0 flex-1"
									/>
									<Input
										label={`${name}, ${a.mapLabels}`}
										value={row.labels}
										onChange={(e) => put({ labels: e.target.value })}
										className="min-w-0 flex-1"
									/>
								</span>
							);
						})}
					</Fold>
				</SetupCard>
				{view.file === "invalid" ? (
					<ul role="alert" className="text-ui text-danger-text">
						{view.issues.map((i) => (
							<li key={i}>{i}</li>
						))}
					</ul>
				) : null}
				{error ? <ErrorNotice error={error} className="text-ui text-danger-text" /> : null}
				{dirty ? (
					<div>
						<RightButton right="project.settings" variant="primary" onClick={() => void save()}>
							{a.save}
						</RightButton>
					</div>
				) : null}
			</div>
			<div className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
				<SetupCard id="writes" title={k.write}>
					{WRITES.map((w) => (
						<SetupRow key={w} label={plain(a.write[WRITE_KEY[w]])}>
							<Toggle
								label={a.write[WRITE_KEY[w]]}
								checked={draft.writes[w]}
								onCheckedChange={(on) => set({ writes: { ...draft.writes, [w]: on } })}
							/>
						</SetupRow>
					))}
				</SetupCard>
				{recipes.length ? (
					<SetupCard id="recipe-writes" title={a.recipes}>
						{recipes.map(([recipe, kinds]) => (
							<SetupRow key={recipe} label={plain(recipe)}>
								{kinds.map((kind) => (
									<span key={kind} className="flex items-center gap-2">
										{a.kind[kind]}
										<RightButton
											right="project.settings"
											variant="ghost"
											aria-label={format(a.removeKind, { kind: a.kind[kind], recipe })}
											onClick={() => remove(recipe, kind)}
										>
											{a.remove}
										</RightButton>
									</span>
								))}
							</SetupRow>
						))}
					</SetupCard>
				) : null}
				<div className="flex flex-col items-start gap-2 rounded-lg bg-surface-2 px-6 py-5.5 shadow-2">
					<Badge>{k.off}</Badge>
					<ButtonLink
						href="/today/today"
						className="h-(--control-h) border-0 bg-transparent px-0 text-accent-text shadow-none hover:bg-transparent"
					>
						{k.today}
					</ButtonLink>
				</div>
				<SetupCard>
					<SetupRow label={plain(k.mark)} href="/flow/list" />
					<SetupRow label={plain(k.spend)} href="/crew/spend" />
				</SetupCard>
			</div>
		</Columns>
	);
}

/**
 * Setup / This project / Automation: the pickup filter, the limits, the status mapping and the
 * write switches of `.shipyard/automation.yaml` (`add-sync` REQ-002, REQ-006, REQ-007).
 */
export function Automation() {
	const active = useActiveProject().data;
	const view = useAutomation().data;
	if (!active || !view) return null;
	// A saved file resets the draft.
	return <Form key={JSON.stringify(view)} view={view} />;
}

/**
 * Setup / This project, "What agents may do alone": the four write switches of the automation file
 * as one choice each. A change saves at once.
 */
export function AgentsAlone() {
	const { t } = useI18n();
	const a = t.sync.automation;
	const p = t.doctor.project;
	const qc = useQueryClient();
	const { error, run } = useGuard();
	const off = useRights().gate("project.settings");
	const view = useAutomation().data;
	if (!view) return null;
	const { automation } = view;
	return (
		<SetupCard id="alone" title={p.alone}>
			{WRITES.map((w) => (
				<SetupRow key={w} label={a.write[WRITE_KEY[w]]}>
					{/* A person with no right sees the choice and cannot change it. */}
					<fieldset disabled={off.disabled} title={off.reason} className="w-44 min-w-0">
						<Segmented
							label={a.write[WRITE_KEY[w]]}
							value={automation.writes[w] ? "alone" : "asks"}
							onValueChange={(v) =>
								void run(async () => {
									await unwrap(
										commands.syncAutomationSave({
											...automation,
											writes: { ...automation.writes, [w]: v === "alone" },
										}),
									);
									await qc.invalidateQueries({ queryKey: syncKeys.all });
								})
							}
							items={[
								{ value: "asks", label: p.asks },
								{ value: "alone", label: p.aloneOn },
							]}
						/>
					</fieldset>
				</SetupRow>
			))}
			{error ? (
				<p role="alert" className="px-6 pb-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</SetupCard>
	);
}
