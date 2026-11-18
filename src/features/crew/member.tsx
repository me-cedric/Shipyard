import { useState } from "react";
import { useGuard } from "@/features/work/guard";
import { RoleRights, RoleSelect } from "@/features/work/team-rights";
import { format, useI18n } from "@/lib/i18n";
import { confirmDialog } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { addDays, type Member, usePlan, useTeam, useWorkActions } from "@/lib/work";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { Switch } from "@/ui/atoms/switch";
import { PlusIcon, TrashIcon } from "@/ui/icons";

const list = (s: string) =>
	s
		.split(",")
		.map((x) => x.trim())
		.filter(Boolean);
const blank = (): Member => ({
	name: "",
	handle: "",
	trackers: [],
	emails: [],
	role: "",
	admin: false,
	rights: [],
	capacity: 5,
	skills: [],
	dayRate: null,
	availability: { absences: [] },
});

/**
 * The form of one member, on the member page of Crew. It writes the whole team file (REQ-004). `week`
 * is the week of a capacity warning in the plan: the form lists the load of that member on each day
 * of it. `onOpen` shows a member, or the list with `null`.
 */
export function MemberForm({
	handle,
	week,
	onOpen,
}: {
	handle: string | null;
	week?: { from: string; slug: string };
	onOpen: (handle: string | null) => void;
}) {
	const { t } = useI18n();
	const m = t.work.team;
	const view = useTeam().data;
	const act = useWorkActions();
	const { error, run } = useGuard();
	const members = view?.team.members ?? [];
	const index = members.findIndex((x) => x.handle === handle);
	const [draft, setDraft] = useState<Member>(() => members[index] ?? blank());
	const [accounts, setAccounts] = useState(draft.trackers.join(", "));
	const [skills, setSkills] = useState(draft.skills.join(", "));
	const [emails, setEmails] = useState((draft.emails ?? []).join(", "));
	const [changes, setChanges] = useState((draft.rights ?? []).join(", "));
	const locked = view?.locked ?? false;
	const set = (patch: Partial<Member>) => setDraft((d) => ({ ...d, ...patch }));
	const av = draft.availability;
	const plan = usePlan(week?.slug ?? null).data;
	const load = t.costing.plan.load;
	const days = (plan?.load.members.find((x) => x.handle === handle)?.days ?? []).filter(
		(d) => week && d.capacity != null && d.day >= week.from && d.day <= addDays(week.from, 6),
	);

	const save = async () => {
		const next = {
			...draft,
			trackers: list(accounts),
			skills: list(skills),
			emails: list(emails),
			rights: list(changes),
		};
		const saved = await run(() =>
			act.saveTeam({
				members: index < 0 ? [...members, next] : members.map((x, i) => (i === index ? next : x)),
			}),
		);
		// Open the saved member, so a second save replaces it and adds none.
		if (saved) onOpen(next.handle);
	};

	return (
		<form
			className="flex max-w-xl flex-col gap-2 rounded-xl bg-surface-2 p-4 shadow-1"
			onSubmit={(e) => {
				e.preventDefault();
				void save();
			}}
		>
			{week ? (
				<section aria-label={format(m.week, { day: week.from })}>
					<h3 className="text-12 font-medium text-n-11">{format(m.week, { day: week.from })}</h3>
					<ul className="text-ui">
						{days.map((d) => (
							<li
								key={d.day}
								className={
									(d.used ?? 0) > (d.capacity ?? 0) + 1e-6 ? "text-warning-text" : undefined
								}
							>
								{format(load, { day: d.day, used: d.used ?? 0, capacity: d.capacity ?? 0 })}
							</li>
						))}
					</ul>
				</section>
			) : null}
			<Input
				caption
				label={m.name}
				value={draft.name}
				onChange={(e) => set({ name: e.target.value })}
			/>
			<Input
				caption
				label={m.handle}
				value={draft.handle}
				onChange={(e) => set({ handle: e.target.value })}
				className="font-mono"
			/>
			<Input
				caption
				label={m.accounts}
				value={accounts}
				onChange={(e) => setAccounts(e.target.value)}
			/>
			<Input
				caption
				label={t.rights.team.emails}
				value={emails}
				onChange={(e) => setEmails(e.target.value)}
			/>
			<RoleSelect value={draft.role} onChange={(role) => set({ role })} />
			<RoleRights role={draft.role} />
			<Switch
				label={t.rights.team.admin}
				checked={draft.admin === true}
				onCheckedChange={(admin) => set({ admin })}
			/>
			<Input
				caption
				label={t.rights.team.changes}
				value={changes}
				onChange={(e) => setChanges(e.target.value)}
				className="font-mono"
			/>
			<Input
				caption
				label={m.capacity}
				type="number"
				min={0}
				max={7}
				step={0.5}
				value={draft.capacity ?? ""}
				onChange={(e) => set({ capacity: e.target.value === "" ? null : Number(e.target.value) })}
			/>
			<Input caption label={m.skills} value={skills} onChange={(e) => setSkills(e.target.value)} />
			{locked ? null : (
				<Input
					caption
					label={m.dayRate}
					type="number"
					min={0}
					value={draft.dayRate ?? ""}
					onChange={(e) => set({ dayRate: e.target.value === "" ? null : Number(e.target.value) })}
				/>
			)}
			<div className="flex gap-2">
				<Input
					caption
					label={m.from}
					type="date"
					value={av.from ?? ""}
					onChange={(e) => set({ availability: { ...av, from: e.target.value || undefined } })}
				/>
				<Input
					caption
					label={m.until}
					type="date"
					value={av.until ?? ""}
					onChange={(e) => set({ availability: { ...av, until: e.target.value || undefined } })}
				/>
			</div>
			<fieldset className="flex flex-col gap-1">
				<legend className="flex w-full items-center justify-between pb-1 text-12 font-medium text-n-11">
					{m.absences}
					<IconButton
						label={m.addAbsence}
						onClick={() =>
							set({ availability: { ...av, absences: [...av.absences, { from: "", to: "" }] } })
						}
					>
						<PlusIcon size={14} />
					</IconButton>
				</legend>
				{av.absences.map((a, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: an absence has no id and the list keeps its order
					<div key={i} className="flex items-center gap-1">
						<Input
							label={`${m.absenceFrom} ${i + 1}`}
							type="date"
							value={a.from}
							onChange={(e) =>
								set({
									availability: {
										...av,
										absences: av.absences.map((x, j) =>
											j === i ? { ...x, from: e.target.value } : x,
										),
									},
								})
							}
						/>
						<Input
							label={`${m.absenceTo} ${i + 1}`}
							type="date"
							value={a.to}
							onChange={(e) =>
								set({
									availability: {
										...av,
										absences: av.absences.map((x, j) =>
											j === i ? { ...x, to: e.target.value } : x,
										),
									},
								})
							}
						/>
						<IconButton
							label={`${t.work.remove} ${i + 1}`}
							onClick={() =>
								set({
									availability: { ...av, absences: av.absences.filter((_, j) => j !== i) },
								})
							}
						>
							<TrashIcon size={14} />
						</IconButton>
					</div>
				))}
			</fieldset>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<div className="flex items-center gap-2">
				<RightButton
					right="project.settings"
					type="submit"
					disabled={draft.handle.trim() === "" || draft.name.trim() === ""}
				>
					{t.work.save}
				</RightButton>
				{index >= 0 ? (
					<IconButton
						label={t.work.remove}
						onClick={() =>
							void run(async () => {
								if (!(await confirmDialog(format(m.confirmRemove, { name: draft.name })))) return;
								await act.saveTeam({ members: members.filter((_, i) => i !== index) });
								onOpen(null);
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
