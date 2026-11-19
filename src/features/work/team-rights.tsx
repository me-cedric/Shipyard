import { Menu } from "@base-ui/react/menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { type ReactNode, useState } from "react";
import { usePlainDay } from "@/features/plan/capacity";
import { format, useI18n } from "@/lib/i18n";
import {
	type Access,
	commands,
	type JoinSent,
	type Level,
	type MemberRoles,
	type Overrides_Serialize,
	type Right,
	type RoleAccess,
	type TeamRole,
	unwrap,
} from "@/lib/ipc";
import { copyText, openUrl } from "@/lib/menus";
import { TEAM_ROLES } from "@/lib/prefs";
import { useActiveProject } from "@/lib/projects";
import { RightButton, rightsKey, useRights } from "@/lib/rights";
import { type Member, useTeam, useWorkActions } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button, buttonVariants } from "@/ui/atoms/button";
import { Chip } from "@/ui/atoms/chip";
import { Input } from "@/ui/atoms/input";
import { LinkButton } from "@/ui/atoms/link-button";
import { Segmented } from "@/ui/atoms/segmented";
import { Select } from "@/ui/atoms/select";
import {
	BookOpenIcon,
	CheckIcon,
	ChevronRightIcon,
	LockClosedIcon,
	PencilIcon,
	XMarkIcon,
} from "@/ui/icons";
import { AttentionCard } from "@/ui/molecules/attention-card";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { MenuList } from "@/ui/molecules/menu-button";
import { Row } from "@/ui/molecules/row";
import { DataTable } from "@/ui/organisms/data-table";
import { useGuard } from "./guard";

/** The team file of a project, as `TEAM_FILE` of `crates/shipyard-core/src/rights.rs`. */
const TEAM_FILE = ".shipyard/team.yaml";

/** The roles of a member as a select. A role that is not one of the nine stays selectable, as it is. */
export function RoleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
	const { t } = useI18n();
	const known = (TEAM_ROLES as string[]).includes(value);
	return (
		<Select
			caption
			label={t.work.team.role}
			value={value}
			onValueChange={onChange}
			placeholder={t.rights.team.pickRole}
			className="min-h-control"
			items={[
				...(value && !known ? [{ value, label: value }] : []),
				...TEAM_ROLES.map((r) => ({ value: r, label: t.rights.role[r] })),
			]}
		/>
	);
}

/** The rights of one role, before the save. */
export function RoleRights({ role }: { role: string }) {
	const { t } = useI18n();
	const rights = useRights().view?.roles.find((r) => r.role === role)?.rights ?? [];
	return (
		<ul aria-label={t.rights.team.rights} className="flex flex-wrap gap-1">
			{rights.map((r) => (
				<li key={r}>
					<Badge className="rounded-full font-mono">{r}</Badge>
				</li>
			))}
		</ul>
	);
}

type Area = Exclude<keyof Access, "merge" | "approve">;
const AREAS: Area[] = ["work", "specs", "design", "knowledge", "code", "runs", "settings", "costs"];
const LEVELS: Level[] = ["none", "read", "write"];
const RANK: Record<Level, number> = { none: 0, read: 1, write: 2 };

/** Levels from a text of eight letters: `W` write, `R` read, else none. */
const levels = (l: string, merge = false, approve = false): Access => {
	const at = (i: number): Level => (l[i] === "W" ? "write" : l[i] === "R" ? "read" : "none");
	return {
		work: at(0),
		specs: at(1),
		design: at(2),
		knowledge: at(3),
		code: at(4),
		runs: at(5),
		settings: at(6),
		costs: at(7),
		merge,
		approve,
	};
};
const ADMIN = levels("WWWWWWWW", true, true);
/** The default levels of each role, as `Role::defaults` of `crates/shipyard-core/src/rights.rs`. Reset needs them. */
const DEFAULTS: Record<TeamRole, Access> = {
	po: levels("WWRWRRRR"),
	pm: levels("WRRWRRRR"),
	architect: levels("WWWWWWRR", true, true),
	techlead: ADMIN,
	ba: levels("WWRWRWRN"),
	developer: levels("WRWWWWRN", false, true),
	qa: levels("WWRWWWRN"),
	designer: levels("WRWWRRRN"),
	viewer: levels("RRRRNRRN"),
};

/** Where a right sits: its area or switch, and the level that it needs. */
const RIGHT_AT: Record<Right, [keyof Access, Level]> = {
	"work.edit": ["work", "write"],
	"specs.edit": ["specs", "write"],
	"design.edit": ["design", "write"],
	"knowledge.edit": ["knowledge", "write"],
	"code.write": ["code", "write"],
	"code.merge": ["merge", "write"],
	"runs.start": ["runs", "write"],
	"runs.approve": ["approve", "write"],
	"project.settings": ["settings", "write"],
	"costs.view": ["costs", "read"],
};

const isRole = (r: string): r is TeamRole => (TEAM_ROLES as string[]).includes(r);
/** The known roles of a member, the first one first. */
const rolesOf = (m: Member) => [...new Set([m.role, ...(m.roles ?? [])])].filter(isRole);

/** The levels of a member: the highest of the roles, then the overrides. An admin has all. */
function effective(m: Member, roles: TeamRole[], table: RoleAccess[]): Access {
	if (m.admin) return ADMIN;
	const of = (r: TeamRole) => table.find((x) => x.role === r)?.access ?? DEFAULTS[r];
	let a = levels("NNNNNNNN");
	for (const r of roles.length ? roles : (["viewer"] as TeamRole[])) {
		const y = of(r);
		const next = { ...a, merge: a.merge || y.merge, approve: a.approve || y.approve };
		for (const k of AREAS) next[k] = RANK[a[k]] >= RANK[y[k]] ? a[k] : y[k];
		a = next;
	}
	for (const c of m.rights ?? []) {
		const at = RIGHT_AT[c.slice(1) as Right];
		if (!at) continue;
		const [k, need] = at;
		const on = c.startsWith("+");
		if (k === "merge" || k === "approve") {
			a = { ...a, [k]: on };
			continue;
		}
		const below: Level = need === "write" ? "read" : "none";
		const cur = a[k];
		const next = on
			? RANK[cur] >= RANK[need]
				? cur
				: need
			: RANK[cur] <= RANK[below]
				? cur
				: below;
		a = { ...a, [k]: next };
	}
	return a;
}

const LEVEL_LOOK: Record<Level, { icon: ReactNode; tone: string }> = {
	none: { icon: <LockClosedIcon size={12} />, tone: "text-danger-text" },
	read: { icon: <BookOpenIcon size={12} />, tone: "text-n-11" },
	write: { icon: <PencilIcon size={12} />, tone: "text-success-text" },
};

/** One level or switch of a cell, as an icon with its name (colour is never the only sign). */
function Mark({ label, icon, tone }: { label: string; icon: ReactNode; tone: string }) {
	return (
		<span role="img" aria-label={label} title={label} className={`inline-flex ${tone}`}>
			{icon}
		</span>
	);
}

/** One level or switch of a cell, as a mark. */
function LevelCell({ k, access }: { k: Area | "merge" | "approve"; access: Access }) {
	const { t } = useI18n();
	const r = t.rights.team;
	if (k === "merge" || k === "approve")
		return (
			<Mark
				label={`${r[k]} ${access[k] ? t.rights.yes : t.rights.no}`}
				icon={access[k] ? <CheckIcon size={12} /> : <XMarkIcon size={12} />}
				tone={access[k] ? "text-success-text" : "text-n-10"}
			/>
		);
	return <Mark label={r.level[access[k]]} {...LEVEL_LOOK[access[k]]} />;
}

/** A framed table that scrolls sideways when its columns are wider than the page; the keyboard reaches it. */
function Frame({ label, children }: { label: string; children: ReactNode }) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: a scroll region has no native element
		<div
			role="region"
			// biome-ignore lint/a11y/noNoninteractiveTabindex: the keyboard scrolls a region that is wider than the page
			tabIndex={0}
			aria-label={label}
			className="overflow-auto text-12"
		>
			<div className="flex w-max min-w-full flex-col">{children}</div>
		</div>
	);
}

const HEAD = "px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-10";
const TITLE = "text-20 font-semibold text-n-12";

/** The save of the roles table and of the roles of the members: one command, then a new read (REQ-019). */
export function useRolesSave() {
	const qc = useQueryClient();
	const { error, run } = useGuard();
	const view = useRights().view;
	const table: RoleAccess[] = (view?.roles ?? []).map(({ role, access }) => ({ role, access }));
	const save = (next: RoleAccess[], members: MemberRoles[] = []) =>
		run(async () => {
			try {
				await unwrap(commands.rightsRolesSave(next, members));
			} finally {
				await qc.invalidateQueries();
			}
		});
	return {
		error,
		table,
		setAccess: (role: TeamRole, access: Access) =>
			save(table.map((x) => (x.role === role ? { ...x, access } : x))),
		reset: (role: TeamRole) =>
			save(table.map((x) => (x.role === role ? { ...x, access: DEFAULTS[x.role] } : x))),
		setRoles: (handle: string, roles: TeamRole[]) => save(table, [{ handle, roles }]),
	};
}
type RolesSave = ReturnType<typeof useRolesSave>;

/** The rows of the role card, in the order of the design. "Code and merge" is two rights: two rows. */
const ROWS = [
	"work",
	"specs",
	"design",
	"runs",
	"approve",
	"code",
	"merge",
	"knowledge",
	"costs",
	"settings",
] as const;

/**
 * The rights of one role in plain words (REQ-005, REQ-019). A switch saves at once, with the
 * command and the right of the older Edit mode.
 */
export function RoleCard({
	role,
	onRole,
	roles,
}: {
	role: TeamRole;
	onRole: (role: TeamRole) => void;
	roles: RolesSave;
}) {
	const { t } = useI18n();
	const r = t.rights.team;
	const off = useRights().gate("project.settings");
	const mine = roles.table.find((x) => x.role === role);
	if (!mine) return null;
	const name = t.rights.role[role];
	return (
		<Card pad className="flex flex-[3_1_30rem] flex-col gap-3.5">
			{/* biome-ignore lint/a11y/useSemanticElements: a group of toggles, not a form part */}
			<div role="group" aria-label={r.roleGroup} className="flex flex-wrap gap-2">
				{roles.table.map((x) => (
					<Chip key={x.role} selected={x.role === role} onClick={() => onRole(x.role)}>
						{t.rights.role[x.role]}
					</Chip>
				))}
			</div>
			<h2 className={TITLE}>{format(r.can, { role: name })}</h2>
			<ul className="flex flex-col">
				{ROWS.map((k) => {
					const label = k === "merge" || k === "approve" ? r[k] : r.area[k];
					return (
						<li
							key={k}
							aria-label={label}
							className="flex min-h-14 flex-wrap items-center gap-3 py-1 [&+&]:border-t [&+&]:border-n-6"
						>
							<span className="flex-[1_1_12.5rem] font-medium text-n-12">{label}</span>
							{/* The fieldset turns the switch off without the right, with the reason. */}
							<fieldset
								disabled={off.disabled}
								title={off.reason}
								className="w-64 shrink-0 disabled:opacity-60"
							>
								{k === "merge" || k === "approve" ? (
									<Segmented
										label={`${name} ${label}`}
										value={mine.access[k] ? "yes" : "none"}
										onValueChange={(v) =>
											void roles.setAccess(role, { ...mine.access, [k]: v === "yes" })
										}
										items={[
											{ value: "none", label: r.pick.none },
											{ value: "yes", label: r.pick.yes },
										]}
									/>
								) : (
									<Segmented
										label={`${name} ${label}`}
										value={mine.access[k]}
										onValueChange={(v) => void roles.setAccess(role, { ...mine.access, [k]: v })}
										items={LEVELS.map((l) => ({ value: l, label: r.pick[l] }))}
									/>
								)}
							</fieldset>
						</li>
					);
				})}
			</ul>
		</Card>
	);
}

/** The people of the team with their roles. The role button gives or takes a role, and saves at once. */
export function PeopleCard({ roles }: { roles: RolesSave }) {
	const { t } = useI18n();
	const r = t.rights.team;
	const off = useRights().gate("project.settings");
	const members = useTeam().data?.team.members ?? [];
	return (
		<Card className="flex-[2_1_21rem] self-start py-2">
			<section aria-label={r.people}>
				<h2 className={HEAD}>{r.people}</h2>
				{members.map((m) => {
					const mine = rolesOf(m);
					const names = mine.map((x) => t.rights.role[x]).join(", ") || m.role || r.pickRole;
					return (
						<Row key={m.handle}>
							<Avatar name={m.name} />
							<Link
								to="/crew/crew"
								search={{ member: m.handle } as never}
								className="inline-flex min-h-control items-center font-semibold text-n-12"
							>
								{m.name}
							</Link>
							<span className="ml-auto">
								<Menu.Root>
									<Menu.Trigger
										render={
											<Button
												aria-label={`${format(r.rolesOf, { name: m.name })}: ${names}`}
												disabled={off.disabled}
												reason={off.reason}
											/>
										}
									>
										{names}
									</Menu.Trigger>
									<MenuList
										items={TEAM_ROLES.map((x) => ({
											id: x,
											label: t.rights.role[x],
											checked: mine.includes(x),
											onSelect: () =>
												void roles.setRoles(
													m.handle,
													mine.includes(x) ? mine.filter((y) => y !== x) : [...mine, x],
												),
										}))}
									/>
								</Menu.Root>
							</span>
						</Row>
					);
				})}
				<Row className="gap-2.5">
					<Link to="/crew/crew" search={{ member: "" } as never} className={buttonVariants()}>
						{r.addPerson}
					</Link>
					<Link
						to="/plan/timeline"
						search={{ page: "dates" } as never}
						className={buttonVariants()}
					>
						{r.daysOff}
					</Link>
				</Row>
				<Row
					render={(props) => (
						<Link to="/crew/rights" search={{ page: "team" } as never} {...props} />
					)}
				>
					<span className="font-semibold">{r.teamLink}</span>
					<ChevronRightIcon size={20} className="ml-auto text-n-10" />
				</Row>
			</section>
		</Card>
	);
}

/** The levels of each person: the highest of the roles, then the overrides. Read only. */
export function MemberLevels() {
	const { t } = useI18n();
	const r = t.rights.team;
	const table = useRights().view?.roles ?? [];
	const members = useTeam().data?.team.members ?? [];
	if (table.length === 0 || members.length === 0) return null;
	const columns: ColumnDef<Member>[] = [
		{
			id: "member",
			header: r.members,
			meta: { width: "minmax(12rem, 2fr)", wrap: true, rowHeader: true },
			cell: ({ row }) => (
				<span className="flex flex-wrap items-center gap-1">
					<span className="mr-1 whitespace-nowrap">{row.original.name}</span>
					{rolesOf(row.original).map((x) => (
						<Badge key={x}>{t.rights.role[x]}</Badge>
					))}
				</span>
			),
		},
		...[...AREAS, "merge", "approve"].map<ColumnDef<Member>>((k) => {
			const key = k as Area | "merge" | "approve";
			return {
				id: key,
				header: key === "merge" || key === "approve" ? r[key] : r.area[key],
				cell: ({ row: x }) => (
					<LevelCell k={key} access={effective(x.original, rolesOf(x.original), table)} />
				),
				meta: { width: "minmax(7.5rem, 1fr)", wrap: true },
			};
		}),
	];
	return (
		<Card className="py-2">
			<section aria-label={r.each}>
				<h2 className={HEAD}>{r.each}</h2>
				<Frame label={r.each}>
					<DataTable
						label={r.members}
						data={members}
						columns={columns}
						rowId={(m) => m.handle}
						rowLabel={(m) => `${m.handle} ${r.levels}`}
						flow
					/>
				</Frame>
			</section>
		</Card>
	);
}

/** Who the person is for Shipyard, and the warnings of the team file. */
export function TeamBanners() {
	const { t } = useI18n();
	const { view, person } = useRights();
	if (!view || !person) return null;
	const r = t.rights.team;
	const lines: string[] = [];
	if (person.found === "unknown") lines.push(r.unknown);
	else if (person.member)
		lines.push(format(r.you, { name: person.member, how: t.rights.found[person.found] }));
	if (view.warnings.includes("team-differs"))
		lines.push(format(r.differs, { branch: view.branch ?? "main" }));
	if (view.warnings.includes("team-invalid")) lines.push(r.invalid);
	return (
		<ul className="flex flex-col gap-2 empty:hidden">
			{lines.map((l) => (
				<li
					key={l}
					role="status"
					className="flex min-h-control items-center rounded-xl bg-warning-subtle px-4 py-1 text-ui text-warning-text"
				>
					{l}
				</li>
			))}
		</ul>
	);
}

const yamlText = (s: string) => JSON.stringify(s.trim());

/** The member entry of the join request. The role is `viewer`; the asked role stays in a comment. */
export function joinEntry(f: { name: string; email: string; account: string; role: string }) {
	const handle = f.name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return [
		`# ${f.role}`,
		`- name: ${yamlText(f.name)}`,
		`  handle: ${yamlText(handle)}`,
		`  emails: [${yamlText(f.email)}]`,
		`  trackers: [${f.account.trim() ? yamlText(f.account) : ""}]`,
		"  role: viewer",
		"  capacity: null",
		"  skills: []",
	].join("\n");
}

/**
 * An unknown person asks to join: Shipyard writes the entry on a branch and opens a pull request
 * for an admin (REQ-011). With no code host, the branch stays local and the entry is copied.
 */
export function JoinRequest() {
	const { t } = useI18n();
	const r = t.rights.team;
	const { person } = useRights();
	const [f, setF] = useState({ name: "", email: "", account: "", role: "developer" });
	const [sent, setSent] = useState<JoinSent | null>(null);
	const [error, setError] = useState<unknown>(null);
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);
	if (person?.found !== "unknown") return null;
	const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
	const line = sent?.entry ?? joinEntry(f);
	const send = async () => {
		setBusy(true);
		setError(null);
		try {
			const ask = {
				name: f.name,
				emails: [f.email],
				accounts: f.account.trim() ? [f.account] : [],
				role: f.role,
			};
			const done = await unwrap(commands.workTeamJoin(ask, true));
			setSent(done);
			if (!done.url) {
				copyText(done.entry);
				setCopied(true);
			}
		} catch (e) {
			setError(e);
		} finally {
			setBusy(false);
		}
	};
	return (
		<Card pad>
			<form
				aria-label={r.askJoin}
				className="flex flex-col gap-3.5"
				onSubmit={(e) => {
					e.preventDefault();
					void send();
				}}
			>
				<h2 className={TITLE}>{r.askJoin}</h2>
				<div className="flex flex-wrap items-end gap-2.5">
					<Input
						caption
						label={t.work.team.name}
						value={f.name}
						onChange={(e) => set({ name: e.target.value })}
					/>
					<Input
						caption
						label={r.emails}
						type="email"
						value={f.email}
						onChange={(e) => set({ email: e.target.value })}
					/>
					<Input
						caption
						label={t.work.team.accounts}
						value={f.account}
						onChange={(e) => set({ account: e.target.value })}
					/>
					<Select
						caption
						label={r.askedRole}
						value={f.role}
						onValueChange={(role) => set({ role })}
						items={TEAM_ROLES.map((x) => ({ value: x, label: t.rights.role[x] }))}
					/>
				</div>
				<pre className="overflow-x-auto rounded-md bg-n-3 p-4 font-mono text-13 whitespace-pre-wrap text-n-12">
					{line}
				</pre>
				{sent?.push ? <code className="font-mono text-13 text-n-11">{sent.push}</code> : null}
				<div className="flex flex-wrap gap-2.5">
					<Button
						onClick={() => {
							copyText(line);
							setCopied(true);
						}}
					>
						{copied ? r.copied : r.copyEntry}
					</Button>
					<Button
						variant="primary"
						type="submit"
						busy={busy}
						disabled={!f.name.trim() || !/^\S+@\S+$/.test(f.email.trim())}
					>
						{r.sendJoin}
					</Button>
					{sent?.url ? (
						<Button variant="ghost" onClick={() => openUrl(sent.url ?? "")}>
							{r.openPull}
						</Button>
					) : null}
				</div>
				{error ? <ErrorNotice error={error} /> : null}
			</form>
		</Card>
	);
}

/** The older roles of this machine, as members (Q-145). */
const FROM_OLD: Record<string, { role: string; rights?: string[] }> = {
	lead: { role: "po" },
	junior: { role: "developer", rights: ["-code.merge", "-runs.approve"] },
};

const slug = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "") || "member";

/** The members that the e-mail to role map of this machine gives, and the page modes that they drop. */
export function proposal(o: Overrides_Serialize, team: Member[]) {
	const known = new Set(team.flatMap((m) => m.emails ?? []));
	const handles = new Set(team.map((m) => m.handle));
	const members: Member[] = [];
	for (const [email, old] of Object.entries(o.assignments ?? {})) {
		if (known.has(email)) continue;
		const base = slug(email.split("@")[0] ?? "");
		let handle = base;
		for (let n = 2; handles.has(handle); n++) handle = `${base}-${n}`;
		handles.add(handle);
		const to = FROM_OLD[old] ?? { role: old };
		members.push({
			name: email.split("@")[0] ?? email,
			handle,
			trackers: [],
			emails: [email],
			role: to.role,
			admin: false,
			rights: to.rights ?? [],
			capacity: null,
			skills: [],
			availability: { absences: [] },
		});
	}
	const dropped = Object.entries(o.pageModes ?? {}).flatMap(([role, pages]) =>
		Object.entries(pages).map(([page, mode]) => `${role} ${page} ${mode}`),
	);
	return { members, dropped };
}

/** The team file: the way to open it, and the one-time move of the roles of this machine. */
export function TeamFileCard() {
	const { t } = useI18n();
	const r = t.rights.team;
	const qc = useQueryClient();
	const active = useActiveProject().data;
	const team = useTeam().data?.team.members ?? [];
	const act = useWorkActions();
	const { error, run } = useGuard();
	if (!active) return null;
	const o = active.overrides;
	const p = proposal(o, team);
	return (
		<Card pad>
			<section aria-label={r.fileTitle} className="flex flex-col gap-3.5">
				<h2 className={TITLE}>{r.fileTitle}</h2>
				{p.members.length ? (
					<ul aria-label={r.migrate} className="flex flex-col">
						{p.members.map((m) => (
							<li
								key={m.handle}
								className="flex min-h-control flex-wrap items-center gap-2 [&+&]:border-t [&+&]:border-n-6"
							>
								<span className="flex-1">{m.emails?.[0]}</span>
								<span className="text-n-11">
									{t.rights.role[m.role as keyof typeof t.rights.role]}
								</span>
								{m.rights?.length ? (
									<span className="font-mono text-12">{m.rights.join(" ")}</span>
								) : null}
							</li>
						))}
					</ul>
				) : null}
				{p.dropped.length ? (
					<p className="text-n-11">{format(r.dropped, { list: p.dropped.join(", ") })}</p>
				) : null}
				{error ? (
					<p role="alert" className="text-ui text-danger-text">
						{error}
					</p>
				) : null}
				<div className="flex flex-wrap gap-2.5">
					<Button
						onClick={() =>
							void run(() => unwrap(commands.openDefault(`${active.path}/${TEAM_FILE}`)))
						}
					>
						{r.openFile}
					</Button>
					{p.members.length || p.dropped.length ? (
						<RightButton
							right="project.settings"
							onClick={() =>
								void run(async () => {
									if (p.members.length) await act.saveTeam({ members: [...team, ...p.members] });
									await unwrap(
										commands.projectOverridesSave({ ...o, assignments: null, pageModes: null }),
									);
									await qc.invalidateQueries();
								})
							}
						>
							{r.moveRoles}
						</RightButton>
					) : null}
				</div>
			</section>
		</Card>
	);
}

/** The last lines of the audit log, for a person with `project.settings`. */
function useAudit() {
	const { can } = useRights();
	return useQuery({
		queryKey: [...rightsKey, "audit"],
		queryFn: () => unwrap(commands.rightsAuditTail()),
		enabled: can("project.settings"),
	}).data;
}

const JOIN_BRANCH = "shipyard/join-";

/**
 * A person asked to join (REQ-011): the request is a pull request on the team file, and its merge
 * on the code host accepts it. No command accepts or refuses a request from here.
 */
export function JoinAsked() {
	const { t } = useI18n();
	const lines = useAudit() ?? [];
	const members = useTeam().data?.team.members ?? [];
	const asked = [
		...new Set(
			lines
				.filter((l) => l.result === "requested" && l.target.startsWith(JOIN_BRANCH))
				.map((l) => l.target.slice(JOIN_BRANCH.length)),
		),
	].filter((h) => !members.some((m) => m.handle === h));
	return asked.map((h) => (
		<AttentionCard
			key={h}
			who={t.rights.today.you}
			title={format(t.rights.team.asks, { name: h })}
		/>
	));
}

/** How many changes show before "Older changes". */
const RECENT = 5;

/** The changes of rights, the newest first, in plain words. The command of a line is its tooltip. */
export function AuditTail() {
	const { t } = useI18n();
	const r = t.rights.team;
	const day = usePlainDay();
	const lines = useAudit();
	const members = useTeam().data?.team.members ?? [];
	const [all, setAll] = useState(false);
	if (!lines?.length) return null;
	const rows = lines.toReversed();
	return (
		<Card className="py-2">
			<section aria-label={r.audit}>
				<h2 className={HEAD}>{r.audit}</h2>
				<ul>
					{(all ? rows : rows.slice(0, RECENT)).map((l) => {
						const join = l.result === "requested" && l.target.startsWith(JOIN_BRANCH);
						const who = join
							? l.target.slice(JOIN_BRANCH.length)
							: (members.find((m) => m.handle === l.member)?.name ??
								l.member ??
								t.rights.found[l.found]);
						const [k] = RIGHT_AT[l.right] ?? [];
						const right = k === "merge" || k === "approve" ? r[k] : k ? r.area[k] : l.right;
						const result = (r.result as Record<string, string>)[l.result] ?? l.result;
						const key = `${l.time}:${l.what}:${l.target}:${l.result}`;
						return (
							<Row key={key} render={(props) => <li {...props} />}>
								<Avatar name={who} size="s" />
								<span title={l.what} className="flex-[1_1_15rem]">
									<span className="font-semibold">{who}</span>{" "}
									{join ? result : `${[right, l.target].filter(Boolean).join(", ")}: ${result}`}
								</span>
								<span className="text-n-10">
									{day(new Date(l.time * 1000).toISOString().slice(0, 10))}
								</span>
							</Row>
						);
					})}
					{rows.length > RECENT && !all ? (
						<Row render={(props) => <li {...props} />}>
							<LinkButton onClick={() => setAll(true)}>{r.older}</LinkButton>
						</Row>
					) : null}
				</ul>
			</section>
		</Card>
	);
}
