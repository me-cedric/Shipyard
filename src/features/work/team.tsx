import { useState } from "react";
import { NoProject } from "@/features/shell/no-project";
import { format, useI18n } from "@/lib/i18n";
import { confirmDialog } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { RightButton } from "@/lib/rights";
import { useFormIntent, useFormIntentFor, useShell } from "@/lib/shell";
import { addDays, type Member, usePlan, useSealState, useTeam, useWorkActions } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { Switch } from "@/ui/atoms/switch";
import { LockClosedIcon, PlusIcon, TrashIcon, UsersIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Loading } from "@/ui/molecules/loading";
import { DataTable } from "@/ui/organisms/data-table";
import { ListDetail } from "@/ui/templates/list-detail";
import { useGuard } from "./guard";
import { SealBar } from "./seal";
import {
	AuditTail,
	JoinRequest,
	Migration,
	RoleRights,
	RoleSelect,
	TeamBanners,
	TeamRights,
} from "./team-rights";
import { parseMemberWeek } from "./week-focus";

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
 * The form of one member, in the inspector. It writes the whole team file (REQ-004). `week` is the
 * week of a capacity warning in the plan: the form lists the load of that member on each day of it.
 */
function MemberForm({
	handle,
	week,
}: {
	handle: string | null;
	week?: { from: string; slug: string };
}) {
	const { t } = useI18n();
	const m = t.work.team;
	const view = useTeam().data;
	const act = useWorkActions();
	const { openDetail } = useShell();
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
		if (saved) openDetail(next.name, <MemberForm key={next.handle} handle={next.handle} />);
	};

	return (
		<form
			className="flex flex-col gap-2"
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

/** Work / Team: the members of `.shipyard/team.yaml`. The one place that edits the team. */
export function Team() {
	const { t } = useI18n();
	const m = t.work.team;
	const active = useActiveProject().data;
	const view = useTeam();
	const seal = useSealState().data;
	const { openDetail } = useShell();
	const [selected, setSelected] = useState<string | null>(null);
	const members = view.data?.team.members ?? [];
	const locked = view.data?.locked ?? false;
	useFormIntent("member", () =>
		openDetail(t.work.team.add, <MemberForm key="new" handle={null} />),
	);
	// A capacity warning of the plan opens the member that it names, on the week of the warning.
	useFormIntentFor(
		"member:",
		(rest) => {
			const { handle, week, slug } = parseMemberWeek(rest);
			const x = members.find((o) => o.handle === handle);
			if (!x) return;
			setSelected(x.handle);
			const focus = week && slug ? { from: week, slug } : undefined;
			openDetail(x.name, <MemberForm key={x.handle} handle={x.handle} week={focus} />);
		},
		!!view.data,
	);

	if (active === undefined || view.isLoading)
		return <Loading title={t.tabs.work.team} icon={<UsersIcon size={16} />} />;
	if (active === null) return <NoProject title={t.tabs.work.team} icon={<UsersIcon size={16} />} />;
	const add = () => {
		setSelected(null);
		openDetail(t.work.team.add, <MemberForm key="new" handle={null} />);
	};
	const empty = members.length === 0;
	return (
		<ListDetail
			title={t.tabs.work.team}
			icon={<UsersIcon size={16} />}
			count={members.length}
			action={
				empty ? null : (
					<RightButton id="add-member" right="project.settings" variant="primary" onClick={add}>
						<PlusIcon size={14} />
						{t.work.team.add}
					</RightButton>
				)
			}
			toolbar={
				locked && seal ? (
					<>
						<LockClosedIcon size={14} />
						<span className="text-ui text-n-11">{t.work.team.lockedRate}</span>
						<SealBar state={seal} />
					</>
				) : undefined
			}
		>
			<TeamBanners />
			<JoinRequest />
			<Migration />
			{view.data?.error ? (
				<p role="alert" className="px-3 py-1 text-ui text-danger-text">
					{view.data.error}
				</p>
			) : null}
			{empty ? (
				<div className="p-4">
					<EmptyState
						title={t.empty.team}
						action={{
							id: "add-member",
							label: t.work.team.add,
							icon: <PlusIcon size={14} />,
							onClick: add,
						}}
					/>
				</div>
			) : (
				<div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
					<div className="flex w-max min-w-full flex-col rounded-lg border bg-surface-1 text-ui shadow-1">
						<DataTable
							flow
							label={t.tabs.work.team}
							data={members}
							rowId={(x) => x.handle}
							rowLabel={(x) => x.handle}
							selected={selected}
							columns={[
								{
									id: "name",
									header: m.name,
									meta: { width: "minmax(12rem, 2fr)", wrap: true },
									cell: ({ row }) => {
										const x = row.original;
										return (
											<button
												type="button"
												data-nav=""
												onClick={() => {
													setSelected(x.handle);
													openDetail(x.name, <MemberForm key={x.handle} handle={x.handle} />);
												}}
												className="flex items-center gap-2 text-left"
											>
												<Avatar name={x.name} className="size-6 text-11" />
												<span className="font-medium text-n-12">{x.name}</span>
												<span className="font-mono text-11 text-n-11">{x.handle}</span>
											</button>
										);
									},
								},
								{
									id: "role",
									header: m.role,
									meta: { wrap: true },
									cell: ({ row: { original: x } }) =>
										t.rights.role[x.role as keyof typeof t.rights.role] ?? x.role,
								},
								{
									id: "capacity",
									header: m.capacity,
									meta: { width: "6rem", numeric: true },
									cell: ({ row }) => row.original.capacity ?? 0,
								},
								{
									id: "dayRate",
									header: m.dayRate,
									meta: { width: "6rem", numeric: true },
									cell: ({ row: { original: x } }) =>
										x.dayRate != null ? (
											format(m.perDay, { rate: x.dayRate })
										) : locked ? (
											<span role="img" aria-label={m.lockedRate} className="text-n-10">
												<LockClosedIcon size={12} />
											</span>
										) : null,
								},
								{
									id: "skills",
									header: m.skills,
									meta: { width: "minmax(8rem, 2fr)", wrap: true },
									cell: ({ row: { original: x } }) => (
										<span className="flex flex-wrap gap-1">
											{x.skills.map((k) => (
												<Badge key={k} className="rounded-full">
													{k}
												</Badge>
											))}
										</span>
									),
								},
							]}
						/>
					</div>
				</div>
			)}
			<TeamRights />
			<AuditTail />
		</ListDetail>
	);
}
