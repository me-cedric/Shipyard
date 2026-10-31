import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SPACES, type SpaceId, tabLabel } from "@/features/shell/spaces";
import { format, useI18n } from "@/lib/i18n";
import { commands, type Overrides_Serialize, unwrap } from "@/lib/ipc";
import { ROLES } from "@/lib/prefs";
import { useActiveProject } from "@/lib/projects";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { XMarkIcon } from "@/ui/icons";
import { Panel } from "@/ui/molecules/panel";

const PAGE_SPACES: SpaceId[] = ["home", "design", "specs", "work", "factory", "code", "knowledge"];
const MODES = ["editable", "read-only", "hidden"] as const;

/**
 * The profiles of the project. A profile is a role. For each page it is editable, read only or
 * hidden. A person gets a profile by git e-mail. Both live with the project profile in the app data folder.
 */
export function ProfilesCard() {
	const { t } = useI18n();
	const p = t.workspace.profile;
	const qc = useQueryClient();
	const active = useActiveProject().data;
	const [role, setRole] = useState<(typeof ROLES)[number]>(ROLES[0]);
	const [email, setEmail] = useState("");
	const [assignRole, setAssignRole] = useState<(typeof ROLES)[number]>(ROLES[0]);
	if (!active) return null;
	const o = active.overrides;
	const save = async (patch: Partial<Overrides_Serialize>) => {
		await unwrap(commands.projectOverridesSave({ ...o, ...patch }));
		await qc.invalidateQueries();
	};
	const roles = ROLES.map((r) => ({ value: r, label: t.role[r] }));
	const modes = o.pageModes ?? {};
	const setMode = (page: string, mode: (typeof MODES)[number]) => {
		const mine = { ...(modes[role] ?? {}) };
		if (mode === "editable") delete mine[page];
		else mine[page] = mode;
		void save({ pageModes: { ...modes, [role]: mine } });
	};
	const people = Object.entries(o.assignments ?? {});
	const valid = /^\S+@\S+$/.test(email.trim());
	return (
		<Panel title={p.profiles} flush>
			<div className="flex flex-col gap-3 px-3 py-2">
				<Select
					label={p.profile}
					value={role}
					onValueChange={(v) => setRole(v as typeof role)}
					items={roles}
				/>
				<ul aria-label={p.pages} className="flex flex-col divide-y">
					{PAGE_SPACES.flatMap((s) =>
						SPACES[s].map((tab) => {
							const page = `${s}/${tab}`;
							const name = `${t.space[s]} / ${tabLabel(t, s, tab)}`;
							return (
								<li key={page} className="flex h-row items-center gap-2">
									<span className="flex-1 text-ui text-n-12">{name}</span>
									<Select
										label={name}
										value={modes[role]?.[page] ?? "editable"}
										onValueChange={(v) => setMode(page, v as (typeof MODES)[number])}
										items={MODES.map((m) => ({ value: m, label: p.mode[m] }))}
									/>
								</li>
							);
						}),
					)}
				</ul>
				<h3 className="text-12 font-medium text-n-11">{p.people}</h3>
				<ul aria-label={p.people} className="flex flex-col divide-y">
					{people.map(([mail, r]) => (
						<li key={mail} className="flex h-row items-center gap-2 text-ui">
							<span className="flex-1 text-n-12">{mail}</span>
							<span className="text-n-11">{t.role[r as (typeof ROLES)[number]] ?? r}</span>
							<Button
								variant="ghost"
								aria-label={format(p.unassign, { email: mail })}
								onClick={() => {
									const { [mail]: _gone, ...rest } = o.assignments ?? {};
									void save({ assignments: Object.keys(rest).length ? rest : null });
								}}
							>
								<XMarkIcon size={14} />
							</Button>
						</li>
					))}
				</ul>
				<form
					className="flex items-center gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						if (!valid) return;
						void save({
							assignments: { ...(o.assignments ?? {}), [email.trim().toLowerCase()]: assignRole },
						}).then(() => setEmail(""));
					}}
				>
					<Input
						label={p.email}
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
					<Select
						label={`${p.assign} ${p.profile}`}
						value={assignRole}
						onValueChange={(v) => setAssignRole(v as typeof assignRole)}
						items={roles}
					/>
					<Button type="submit" disabled={!valid}>
						{p.assign}
					</Button>
				</form>
			</div>
		</Panel>
	);
}
