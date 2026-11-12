import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { type ReactNode, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import {
	type Access,
	commands,
	type JoinSent,
	type Level,
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
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { Switch } from "@/ui/atoms/switch";
import {
	ArrowPathIcon,
	BookOpenIcon,
	CheckIcon,
	LockClosedIcon,
	PencilIcon,
	XMarkIcon,
} from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Panel } from "@/ui/molecules/panel";
import { DataTable } from "@/ui/organisms/data-table";
import { useGuard } from "./guard";

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
	viewer: levels("RRRRRRRN"),
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

type LevelRow = { access: Access; name: string; onChange?: (a: Access) => void };

/** One level or switch of a cell, as a mark or, in edit, as a control. */
function LevelCell({ k, access, name, onChange }: LevelRow & { k: Area | "merge" | "approve" }) {
	const { t } = useI18n();
	const r = t.rights.team;
	if (k === "merge" || k === "approve")
		return onChange ? (
			<Switch
				iconOnly
				label={`${name} ${r[k]}`}
				checked={access[k]}
				onCheckedChange={(on) => onChange({ ...access, [k]: on })}
			/>
		) : (
			<Mark
				label={`${r[k]} ${access[k] ? t.rights.yes : t.rights.no}`}
				icon={access[k] ? <CheckIcon size={12} /> : <XMarkIcon size={12} />}
				tone={access[k] ? "text-success-text" : "text-n-10"}
			/>
		);
	return onChange ? (
		<Select
			label={`${name} ${r.area[k]}`}
			value={access[k]}
			onValueChange={(v) => onChange({ ...access, [k]: v as Level })}
			className="w-28 min-w-0"
			items={LEVELS.map((l) => ({
				value: l,
				label: r.level[l],
				icon: <span className={LEVEL_LOOK[l].tone}>{LEVEL_LOOK[l].icon}</span>,
			}))}
		/>
	) : (
		<Mark label={r.level[access[k]]} {...LEVEL_LOOK[access[k]]} />
	);
}

/** The first column (the row header) and the ten level columns: eight areas and two switches. */
function levelColumns<T>(
	first: ColumnDef<T>,
	row: (x: T) => LevelRow,
	r: ReturnType<typeof useI18n>["t"]["rights"]["team"],
): ColumnDef<T>[] {
	const track = { width: "minmax(7.5rem, 1fr)", wrap: true };
	return [
		first,
		...[...AREAS, "merge", "approve"].map<ColumnDef<T>>((k) => {
			const key = k as Area | "merge" | "approve";
			return {
				id: key,
				header: key === "merge" || key === "approve" ? r[key] : r.area[key],
				cell: ({ row: x }) => <LevelCell k={key} {...row(x.original)} />,
				meta: track,
			};
		}),
	];
}

type Draft = { table: RoleAccess[]; roles: Record<string, TeamRole[]> };

/** A framed table that scrolls sideways when its columns are wider than the page; the keyboard reaches it. */
function Frame({ label, children }: { label: string; children: ReactNode }) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: a scroll region has no native element
		<div
			role="region"
			// biome-ignore lint/a11y/noNoninteractiveTabindex: the keyboard scrolls a region that is wider than the page
			tabIndex={0}
			aria-label={label}
			className="overflow-auto rounded-lg border bg-surface-1 text-12"
		>
			<div className="flex w-max min-w-full flex-col">{children}</div>
		</div>
	);
}

/**
 * The levels of each role and of each member (REQ-005, REQ-019). Edit turns the cells into
 * controls; Save writes the `roles:` block and the roles of the members in one command.
 */
export function TeamRights() {
	const { t } = useI18n();
	const r = t.rights.team;
	const qc = useQueryClient();
	const view = useRights().view;
	const members = useTeam().data?.team.members ?? [];
	const [draft, setDraft] = useState<Draft | null>(null);
	const { error, run, busy } = useGuard();
	const roles = view?.roles ?? [];
	if (roles.length === 0) return null;
	const table = draft?.table ?? roles;
	const rolesFor = (m: Member) => draft?.roles[m.handle] ?? rolesOf(m);
	const setRoles = (m: Member, next: TeamRole[]) =>
		draft && setDraft({ ...draft, roles: { ...draft.roles, [m.handle]: next } });
	const setAccess = (role: TeamRole, access: Access) =>
		draft &&
		setDraft({ ...draft, table: draft.table.map((y) => (y.role === role ? { ...y, access } : y)) });
	const save = () =>
		run(async () => {
			if (!draft) return;
			const changed = members
				.filter((m) => draft.roles[m.handle]?.join() !== rolesOf(m).join())
				.map((m) => ({ handle: m.handle, roles: draft.roles[m.handle] ?? [] }));
			await unwrap(commands.rightsRolesSave(draft.table, changed));
			await qc.invalidateQueries();
			setDraft(null);
		});
	const firstTrack = { width: "minmax(12rem, 2fr)", wrap: true, rowHeader: true };
	const roleColumns = levelColumns<RoleAccess>(
		{
			id: "role",
			header: t.work.team.role,
			meta: firstTrack,
			cell: ({ row }) => {
				const x = row.original;
				const name = t.rights.role[x.role];
				return (
					<span className="flex items-center gap-1">
						{name}
						{draft ? (
							<IconButton
								label={format(r.reset, { role: name })}
								onClick={() => setAccess(x.role, DEFAULTS[x.role])}
							>
								<ArrowPathIcon size={12} />
							</IconButton>
						) : null}
					</span>
				);
			},
		},
		(x) => ({
			access: x.access,
			name: t.rights.role[x.role],
			onChange: draft ? (a) => setAccess(x.role, a) : undefined,
		}),
		r,
	);
	const memberColumns = levelColumns<Member>(
		{
			id: "member",
			header: r.members,
			meta: firstTrack,
			cell: ({ row }) => {
				const m = row.original;
				const mine = rolesFor(m);
				return (
					<span className="flex flex-wrap items-center gap-1">
						<span className="mr-1 whitespace-nowrap">{m.name}</span>
						{mine.map((x) => (
							<Badge key={x} className="gap-0.5 rounded-full">
								{t.rights.role[x]}
								{draft ? (
									<IconButton
										label={format(r.removeRole, { role: t.rights.role[x], name: m.name })}
										className="size-4"
										onClick={() =>
											setRoles(
												m,
												mine.filter((y) => y !== x),
											)
										}
									>
										<XMarkIcon size={10} />
									</IconButton>
								) : null}
							</Badge>
						))}
						{draft ? (
							<Select
								label={format(r.addRole, { name: m.name })}
								placeholder={r.pickRole}
								value=""
								onValueChange={(v) => setRoles(m, [...mine, v as TeamRole])}
								className="w-32 min-w-0"
								items={TEAM_ROLES.filter((x) => !mine.includes(x)).map((x) => ({
									value: x,
									label: t.rights.role[x],
								}))}
							/>
						) : null}
					</span>
				);
			},
		},
		(m) => ({ access: effective(m, rolesFor(m), table), name: m.name }),
		r,
	);
	return (
		<section className="flex flex-col gap-2 px-4 pb-4">
			<div className="flex items-center gap-2">
				<h2 className="flex-1 text-ui font-medium">{r.matrix}</h2>
				{draft ? (
					<>
						<Button variant="primary" busy={busy} onClick={() => void save()}>
							{t.work.save}
						</Button>
						<Button variant="ghost" onClick={() => setDraft(null)}>
							{t.sync.backlog.cancel}
						</Button>
					</>
				) : (
					<RightButton
						right="project.settings"
						onClick={() =>
							setDraft({
								table: roles.map(({ role, access }) => ({ role, access })),
								roles: Object.fromEntries(members.map((m) => [m.handle, rolesOf(m)])),
							})
						}
					>
						<PencilIcon size={14} />
						{r.edit}
					</RightButton>
				)}
			</div>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<Frame label={r.matrix}>
				<DataTable label={r.matrix} data={table} columns={roleColumns} rowId={(x) => x.role} flow />
			</Frame>
			{members.length ? (
				<Frame label={r.members}>
					<DataTable
						label={r.members}
						data={members}
						columns={memberColumns}
						rowId={(m) => m.handle}
						rowLabel={(m) => `${m.handle} ${r.levels}`}
						flow
					/>
				</Frame>
			) : null}
		</section>
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
		<ul className="flex flex-col gap-1 px-4 pb-2">
			{lines.map((l) => (
				<li
					key={l}
					role="status"
					className="rounded-md bg-warning-subtle px-3 py-1 text-ui text-warning-text"
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
		<form
			aria-label={r.askJoin}
			className="mx-4 mb-3 flex flex-wrap items-end gap-2 rounded-lg border bg-surface-1 p-3"
			onSubmit={(e) => {
				e.preventDefault();
				void send();
			}}
		>
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
			{sent?.push ? <code className="font-mono text-12 text-n-11">{sent.push}</code> : null}
			{(sent && !sent.url) || error ? (
				<Button
					variant="ghost"
					onClick={() => {
						copyText(sent?.entry ?? joinEntry(f));
						setCopied(true);
					}}
				>
					{copied ? r.copied : r.copyEntry}
				</Button>
			) : null}
			{error ? <ErrorNotice error={error} className="w-full" /> : null}
		</form>
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

/** The one-time proposal to move the roles of this machine to the team file. */
export function Migration() {
	const { t } = useI18n();
	const r = t.rights.team;
	const qc = useQueryClient();
	const o = useActiveProject().data?.overrides;
	const team = useTeam().data?.team.members ?? [];
	const act = useWorkActions();
	const { error, run } = useGuard();
	if (!o) return null;
	const p = proposal(o, team);
	if (p.members.length === 0 && p.dropped.length === 0) return null;
	return (
		<Panel title={r.migrate} flush className="mx-4 mb-3">
			<ul className="flex flex-col">
				{p.members.map((m) => (
					<li key={m.handle} className="flex h-row items-center gap-2 border-b px-3 text-ui">
						<span className="flex-1">{m.emails?.[0]}</span>
						<span className="text-n-11">{t.rights.role[m.role as keyof typeof t.rights.role]}</span>
						{m.rights?.length ? (
							<span className="font-mono text-12">{m.rights.join(" ")}</span>
						) : null}
					</li>
				))}
			</ul>
			{p.dropped.length ? (
				<p className="px-3 py-2 text-ui text-n-11">
					{format(r.dropped, { list: p.dropped.join(", ") })}
				</p>
			) : null}
			{error ? (
				<p role="alert" className="px-3 pb-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<div className="px-3 pb-2">
				<RightButton
					right="project.settings"
					variant="primary"
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
			</div>
		</Panel>
	);
}

/** The last lines of the audit log, for a person with `project.settings`. */
export function AuditTail() {
	const { t, lang } = useI18n();
	const r = t.rights.team;
	const { can } = useRights();
	const lines = useQuery({
		queryKey: [...rightsKey, "audit"],
		queryFn: () => unwrap(commands.rightsAuditTail()),
		enabled: can("project.settings"),
	}).data;
	if (!can("project.settings") || !lines?.length) return null;
	const time = new Intl.DateTimeFormat(lang, { dateStyle: "short", timeStyle: "medium" });
	return (
		<div className="px-4 pb-4">
			<Frame label={r.audit}>
				<DataTable
					label={r.audit}
					data={[...lines].reverse()}
					rowId={(l) => `${l.time}:${l.what}:${l.target}:${l.result}`}
					flow
					columns={[
						{
							id: "when",
							header: r.auditWhen,
							meta: { wrap: true },
							cell: ({ row: x }) => time.format(x.original.time * 1000),
						},
						{
							id: "who",
							header: r.auditWho,
							meta: { wrap: true },
							cell: ({ row: x }) => x.original.member ?? t.rights.found[x.original.found],
						},
						{
							id: "right",
							header: r.auditRight,
							meta: { wrap: true },
							cell: ({ row: x }) => <span className="font-mono">{x.original.right}</span>,
						},
						{
							id: "what",
							header: r.auditWhat,
							meta: { wrap: true },
							cell: ({ row: x }) => <span className="font-mono">{x.original.what}</span>,
						},
						{
							id: "target",
							header: r.auditTarget,
							meta: { wrap: true },
							cell: ({ row: x }) => <span className="font-mono">{x.original.target}</span>,
						},
						{
							id: "result",
							header: r.auditResult,
							meta: { wrap: true },
							accessorFn: (l) => l.result,
						},
					]}
				/>
			</Frame>
		</div>
	);
}
