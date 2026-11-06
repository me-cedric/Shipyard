import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import {
	commands,
	type JoinSent,
	type Member,
	type Overrides_Serialize,
	type Right,
	unwrap,
} from "@/lib/ipc";
import { copyText, openUrl } from "@/lib/menus";
import { TEAM_ROLES } from "@/lib/prefs";
import { useActiveProject } from "@/lib/projects";
import { RightButton, rightsKey, useRights } from "@/lib/rights";
import { useTeam, useWorkActions } from "@/lib/work";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { CheckIcon, XMarkIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Panel } from "@/ui/molecules/panel";
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

/** Each role against each right, with a check or a cross. */
export function RightsMatrix() {
	const { t } = useI18n();
	const roles = useRights().view?.roles ?? [];
	if (roles.length === 0) return null;
	return (
		// biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll area needs a keyboard stop (axe scrollable-region-focusable)
		<div tabIndex={0} className="overflow-auto px-4 pb-4">
			<table
				aria-label={t.rights.team.matrix}
				className="w-full border-separate border-spacing-0 rounded-lg border bg-surface-1 text-12"
			>
				<thead>
					<tr className="text-left text-n-11 [&>th]:border-b [&>th]:px-2 [&>th]:py-1 [&>th]:font-medium">
						<th scope="col">{t.work.team.role}</th>
						{ALL.map((r) => (
							<th key={r} scope="col" className="font-mono">
								{r}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{roles.map((x) => (
						<tr
							key={x.role}
							className="[&>td]:border-b [&>td]:px-2 [&>td]:py-1 last:[&>td]:border-b-0"
						>
							<th scope="row" className="px-2 py-1 text-left font-medium">
								{t.rights.role[x.role]}
							</th>
							{ALL.map((r) => (
								<td key={r} className="text-center">
									{x.rights.includes(r) ? (
										<span
											role="img"
											aria-label={`${r} ${t.rights.yes}`}
											className="text-success-text"
										>
											<CheckIcon size={12} />
										</span>
									) : (
										<span role="img" aria-label={`${r} ${t.rights.no}`} className="text-n-10">
											<XMarkIcon size={12} />
										</span>
									)}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

const ALL: Right[] = [
	"work.edit",
	"specs.edit",
	"design.edit",
	"knowledge.edit",
	"code.write",
	"code.merge",
	"runs.start",
	"runs.approve",
	"project.settings",
	"costs.view",
];

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
		// biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll area needs a keyboard stop (axe scrollable-region-focusable)
		<div tabIndex={0} className="overflow-auto px-4 pb-4">
			<table
				aria-label={r.audit}
				className="w-full border-separate border-spacing-0 rounded-lg border bg-surface-1 text-12"
			>
				<thead>
					<tr className="text-left text-n-11 [&>th]:border-b [&>th]:px-2 [&>th]:py-1 [&>th]:font-medium">
						{[r.auditWhen, r.auditWho, r.auditRight, r.auditWhat, r.auditTarget, r.auditResult].map(
							(h) => (
								<th key={h} scope="col">
									{h}
								</th>
							),
						)}
					</tr>
				</thead>
				<tbody>
					{[...lines].reverse().map((l) => (
						<tr
							key={`${l.time}:${l.what}:${l.target}:${l.result}`}
							className="[&>td]:px-2 [&>td]:py-0.5"
						>
							<td>{time.format(l.time * 1000)}</td>
							<td>{l.member ?? t.rights.found[l.found]}</td>
							<td className="font-mono">{l.right}</td>
							<td className="font-mono">{l.what}</td>
							<td className="font-mono">{l.target}</td>
							<td>{l.result}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
