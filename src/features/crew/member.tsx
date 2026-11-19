import { Link } from "@tanstack/react-router";
import { type ReactNode, useContext, useId, useLayoutEffect, useState } from "react";
import { useGuard } from "@/features/work/guard";
import { roleId } from "@/features/work/team-rights";
import { format, useI18n } from "@/lib/i18n";
import { confirmDialog } from "@/lib/ipc";
import { formatDay, TEAM_ROLES, usePrefs } from "@/lib/prefs";
import { RightButton } from "@/lib/rights";
import { cn } from "@/lib/utils";
import { addDays, type Member, usePlan, useTeam, useWorkActions } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button, buttonVariants } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { Switch } from "@/ui/atoms/switch";
import { ChevronRightIcon } from "@/ui/icons";
import { BackLink } from "@/ui/molecules/back-link";
import { PageSwitchContext } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";
import { SettingsRow } from "@/ui/molecules/settings-row";

const CARD = "min-w-0 rounded-lg bg-surface-2 py-2 shadow-2";
const H2 = "px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-11";
const COL = "flex min-w-0 flex-col gap-5";
const STEP = "size-(--control-h) text-20 text-n-12";

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

/** A list as chips. The button shows the field that edits the list, with a comma between two items. */
function Chips({
	label,
	field,
	button,
	value,
	onChange,
	form,
}: {
	label: string;
	field: string;
	button: string;
	value: string;
	onChange: (value: string) => void;
	form: string;
}) {
	const [edit, setEdit] = useState(false);
	return (
		<SettingsRow label={label}>
			{edit ? (
				<Input
					label={field}
					form={form}
					autoFocus
					value={value}
					onChange={(e) => onChange(e.target.value)}
				/>
			) : (
				<>
					{list(value).map((x, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a list can name one item two times
						<Badge key={i}>{x}</Badge>
					))}
					<Button onClick={() => setEdit(true)}>{button}</Button>
				</>
			)}
		</SettingsRow>
	);
}

/** A day as a button with the date in plain form. The date field of the system lies on it. */
function Day({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	const { lang } = useI18n();
	const { dateFormat } = usePrefs();
	const [y, m, d] = value.split("-").map(Number);
	const text = !(y && m && d)
		? label
		: dateFormat
			? formatDay(value, dateFormat, lang)
			: new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(lang, {
					day: "numeric",
					month: "short",
					// The year shows only when it is not this year.
					year: y === new Date().getFullYear() ? undefined : "numeric",
					timeZone: "UTC",
				});
	return (
		<span
			className={cn(
				buttonVariants(),
				"relative focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
			)}
		>
			{text}
			<input
				type="date"
				aria-label={label}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onClick={(e) => e.currentTarget.showPicker?.()}
				className="absolute inset-0 size-full cursor-pointer opacity-0"
			/>
		</span>
	);
}

/**
 * The member page of Crew: the way back, the head with Save and Remove, and one member in four
 * cards of rows, the label on the left and the control on the right. It writes the whole team file
 * (REQ-004). `week` is the week of a capacity warning in the plan: the page lists the load of that
 * member on each day of it. `onOpen` shows a member, or the list with `null`. `seal` is the
 * passphrase bar. It is a form of its own, so the fields name the form of the member by its id.
 */
export function MemberForm({
	handle,
	week,
	seal,
	onOpen,
}: {
	handle: string | null;
	week?: { from: string; slug: string };
	seal?: ReactNode;
	onOpen: (handle: string | null) => void;
}) {
	const { t } = useI18n();
	const m = t.work.team;
	const c = t.crewPlace;
	const id = useId();
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
	const [unlock, setUnlock] = useState(false);
	const locked = view?.locked ?? false;
	const set = (patch: Partial<Member>) => setDraft((d) => ({ ...d, ...patch }));
	// The day rate is in the team only while the seal is open. When the seal opens, the draft takes
	// the rate and keeps each edit: a save does not clear the rate, and no edit is lost.
	const [wasLocked, setWasLocked] = useState(locked);
	if (wasLocked !== locked) {
		setWasLocked(locked);
		if (!locked) set({ dayRate: members[index]?.dayRate ?? null });
	}
	const av = draft.availability;
	const setAway = (i: number, patch: { from?: string; to?: string }) =>
		set({
			availability: {
				...av,
				absences: av.absences.map((x, j) => (j === i ? { ...x, ...patch } : x)),
			},
		});
	const plan = usePlan(week?.slug ?? null).data;
	const load = t.costing.plan.load;
	const days = (plan?.load.members.find((x) => x.handle === handle)?.days ?? []).filter(
		(d) => week && d.capacity != null && d.day >= week.from && d.day <= addDays(week.from, 6),
	);
	// The member page has no section switch: it claims the switch and does not draw it.
	const claim = useContext(PageSwitchContext)?.claim;
	useLayoutEffect(() => claim?.(), [claim]);

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
	const title = members[index]?.name ?? c.addPerson;
	const capacity = draft.capacity ?? 0;

	return (
		<>
			<div data-page-header className="flex shrink-0 flex-col px-4 pb-3">
				<BackLink label={t.ui.place.crew} render={(props) => <Link to="/crew/crew" {...props} />} />
				<div className="flex flex-wrap items-center gap-4">
					<span aria-hidden="true" className="flex">
						<Avatar name={draft.name} className="size-16 text-20" />
					</span>
					<h1 className="mr-auto text-44 font-semibold text-n-12">{title}</h1>
					{index >= 0 ? (
						<RightButton
							right="project.settings"
							className="border-danger text-danger-text"
							onClick={() =>
								void run(async () => {
									if (!(await confirmDialog(format(m.confirmRemove, { name: draft.name })))) return;
									await act.saveTeam({ members: members.filter((_, i) => i !== index) });
									onOpen(null);
								})
							}
						>
							{c.removeMember}
						</RightButton>
					) : null}
					<RightButton
						right="project.settings"
						variant="primary"
						type="submit"
						form={id}
						disabled={draft.handle.trim() === "" || draft.name.trim() === ""}
					>
						{t.work.save}
					</RightButton>
				</div>
			</div>
			<div className="flex flex-col gap-3 px-4 pb-4">
				{error ? (
					<p role="alert" className="text-ui text-danger-text">
						{error}
					</p>
				) : null}
				<form
					id={id}
					onSubmit={(e) => {
						e.preventDefault();
						void save();
					}}
				/>
				<div className="grid items-start gap-5 lg:grid-cols-2">
					<div className={COL}>
						<section aria-label={c.who} className={CARD}>
							<h2 className={H2}>{c.who}</h2>
							<SettingsRow id={index < 0 ? "add-member" : undefined} label={m.name}>
								<Input
									label={m.name}
									form={id}
									value={draft.name}
									onChange={(e) => set({ name: e.target.value })}
								/>
							</SettingsRow>
							<SettingsRow label={m.handle}>
								<Input
									label={m.handle}
									form={id}
									value={draft.handle}
									onChange={(e) => set({ handle: e.target.value })}
								/>
							</SettingsRow>
							<SettingsRow label={m.role}>
								{/* The select of `RoleSelect`, with no caption: the row has the label. */}
								<Select
									label={m.role}
									value={roleId(draft.role)}
									className="w-auto!"
									onValueChange={(role) => set({ role })}
									placeholder={t.rights.team.pickRole}
									items={[
										...(draft.role && !(TEAM_ROLES as string[]).includes(roleId(draft.role))
											? [{ value: draft.role, label: draft.role }]
											: []),
										...TEAM_ROLES.map((r) => ({ value: r, label: t.rights.role[r] })),
									]}
								/>
							</SettingsRow>
							<SettingsRow label={t.rights.team.admin}>
								<Switch
									iconOnly
									label={t.rights.team.admin}
									checked={draft.admin === true}
									onCheckedChange={(admin) => set({ admin })}
								/>
							</SettingsRow>
							<SettingsRow label={t.rights.team.emails}>
								<Input
									label={t.rights.team.emails}
									form={id}
									value={emails}
									onChange={(e) => setEmails(e.target.value)}
								/>
							</SettingsRow>
							<SettingsRow label={c.accounts}>
								<Input
									label={c.accounts}
									form={id}
									value={accounts}
									onChange={(e) => setAccounts(e.target.value)}
								/>
							</SettingsRow>
						</section>
						<section aria-label={c.extraRights} className={CARD}>
							<h2 className={H2}>{c.extraRights}</h2>
							<Chips
								label={c.extra}
								field={t.rights.team.changes}
								button={c.change}
								value={changes}
								onChange={setChanges}
								form={id}
							/>
							<Row render={(props) => <Link to="/crew/rights" {...props} />}>
								<span className="flex-1 font-semibold">{t.rights.team.matrix}</span>
								<ChevronRightIcon size={20} />
							</Row>
						</section>
					</div>
					<div className={COL}>
						<section aria-label={c.workGroup} className={CARD}>
							<h2 className={H2}>{c.workGroup}</h2>
							{week ? (
								<section aria-label={format(m.week, { day: week.from })} className="px-6 pb-2">
									<h3 className="text-13 font-semibold text-n-11">
										{format(m.week, { day: week.from })}
									</h3>
									<ul>
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
							<SettingsRow label={c.daysInWeek}>
								<span className="inline-flex items-center rounded-md border border-n-7 bg-surface-1">
									<button
										type="button"
										aria-label={format(c.stepLess, { label: c.daysInWeek })}
										className={STEP}
										onClick={() => set({ capacity: Math.max(0, capacity - 0.5) })}
									>
										−
									</button>
									<output className="min-w-10 text-center font-semibold">{capacity}</output>
									<button
										type="button"
										aria-label={format(c.stepMore, { label: c.daysInWeek })}
										className={STEP}
										onClick={() => set({ capacity: Math.min(7, capacity + 0.5) })}
									>
										+
									</button>
								</span>
							</SettingsRow>
							<Chips
								label={m.skills}
								field={m.skills}
								button={c.add}
								value={skills}
								onChange={setSkills}
								form={id}
							/>
							<SettingsRow label={m.dayRate}>
								{!locked ? (
									<Input
										label={m.dayRate}
										form={id}
										type="number"
										min={0}
										value={draft.dayRate ?? ""}
										onChange={(e) =>
											set({ dayRate: e.target.value === "" ? null : Number(e.target.value) })
										}
									/>
								) : unlock ? (
									seal
								) : (
									<>
										<Badge>{c.sealed}</Badge>
										<Button onClick={() => setUnlock(true)}>{t.work.seal.unlock}</Button>
									</>
								)}
							</SettingsRow>
						</section>
						<section aria-label={c.when} className={CARD}>
							<h2 className={H2}>{c.when}</h2>
							<SettingsRow label={m.from}>
								<Day
									label={m.from}
									value={av.from ?? ""}
									onChange={(v) => set({ availability: { ...av, from: v || undefined } })}
								/>
							</SettingsRow>
							<SettingsRow label={m.until}>
								<Day
									label={m.until}
									value={av.until ?? ""}
									onChange={(v) => set({ availability: { ...av, until: v || undefined } })}
								/>
							</SettingsRow>
							{av.absences.map((a, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: an absence has no id and the list keeps its order
								<SettingsRow key={i} label={c.away}>
									<Day
										label={`${m.absenceFrom} ${i + 1}`}
										value={a.from}
										onChange={(from) => setAway(i, { from })}
									/>
									<Day
										label={`${m.absenceTo} ${i + 1}`}
										value={a.to}
										onChange={(to) => setAway(i, { to })}
									/>
									<Button
										aria-label={`${c.removeAway} ${i + 1}`}
										onClick={() =>
											set({
												availability: { ...av, absences: av.absences.filter((_, j) => j !== i) },
											})
										}
									>
										{t.work.remove}
									</Button>
								</SettingsRow>
							))}
							<Row className="justify-end">
								<Button
									onClick={() =>
										set({
											availability: { ...av, absences: [...av.absences, { from: "", to: "" }] },
										})
									}
								>
									{c.addAway}
								</Button>
							</Row>
						</section>
					</div>
				</div>
			</div>
		</>
	);
}
