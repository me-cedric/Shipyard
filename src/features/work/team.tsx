import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { confirmDialog } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { useFormIntent, useShell } from "@/lib/shell";
import { type Member, useSealState, useTeam, useWorkActions } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { LockClosedIcon, PlusIcon, TrashIcon, UsersIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ListDetail } from "@/ui/templates/list-detail";
import { useGuard } from "./guard";
import { NoProject } from "./no-project";
import { SealBar } from "./seal";

const list = (s: string) =>
	s
		.split(",")
		.map((x) => x.trim())
		.filter(Boolean);
const blank = (): Member => ({
	name: "",
	handle: "",
	trackers: [],
	role: "",
	capacity: 5,
	skills: [],
	dayRate: null,
	availability: { absences: [] },
});

/** The form of one member, in the inspector. It writes the whole team file (REQ-004). */
function MemberForm({ handle }: { handle: string | null }) {
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
	const locked = view?.locked ?? false;
	const set = (patch: Partial<Member>) => setDraft((d) => ({ ...d, ...patch }));
	const av = draft.availability;

	const save = async () => {
		const next = { ...draft, trackers: list(accounts), skills: list(skills) };
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
				label={m.role}
				value={draft.role}
				onChange={(e) => set({ role: e.target.value })}
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
				<Button type="submit" disabled={draft.handle.trim() === "" || draft.name.trim() === ""}>
					{t.work.save}
				</Button>
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

	if (active === undefined || view.isLoading) return null;
	if (active === null) return <NoProject title={t.tabs.work.team} />;
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
					<Button variant="primary" onClick={add}>
						<PlusIcon size={14} />
						{t.work.team.add}
					</Button>
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
			{view.data?.error ? (
				<p role="alert" className="px-3 py-1 text-ui text-danger-text">
					{view.data.error}
				</p>
			) : null}
			{empty ? (
				<div className="p-4">
					<EmptyState
						action={{ label: t.work.team.add, icon: <PlusIcon size={14} />, onClick: add }}
					/>
				</div>
			) : (
				<div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
					<table
						aria-label={t.tabs.work.team}
						className="w-full border-separate border-spacing-0 overflow-hidden rounded-lg border bg-surface-1 text-ui shadow-1"
					>
						<thead>
							<tr className="text-left text-12 text-n-11 [&>th]:h-row [&>th]:border-b [&>th]:px-3 [&>th]:font-medium">
								<th scope="col">{m.name}</th>
								<th scope="col">{m.role}</th>
								<th scope="col" className="text-right">
									{m.capacity}
								</th>
								<th scope="col" className="text-right">
									{m.dayRate}
								</th>
								<th scope="col">{m.skills}</th>
							</tr>
						</thead>
						<tbody>
							{members.map((x) => (
								<tr
									key={x.handle}
									aria-label={x.handle}
									aria-current={selected === x.handle ? "true" : undefined}
									className="hover:bg-n-3 aria-[current=true]:bg-accent-soft [&>td]:border-b [&>td]:px-3 [&>td]:py-1.5 last:[&>td]:border-b-0"
								>
									<td>
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
									</td>
									<td>{x.role}</td>
									<td className="text-right font-mono">{x.capacity ?? 0}</td>
									<td className="text-right font-mono">
										{x.dayRate != null ? (
											format(m.perDay, { rate: x.dayRate })
										) : locked ? (
											<span role="img" aria-label={m.lockedRate} className="text-n-10">
												<LockClosedIcon size={12} />
											</span>
										) : null}
									</td>
									<td>
										<span className="flex flex-wrap gap-1">
											{x.skills.map((k) => (
												<Badge key={k} className="rounded-full">
													{k}
												</Badge>
											))}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</ListDetail>
	);
}
