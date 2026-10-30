import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import {
	type AssistantDefaults_Deserialize,
	commands,
	type Overrides_Serialize,
	type Permission,
	unwrap,
} from "@/lib/ipc";
import { ROLES } from "@/lib/prefs";
import { useActiveProject } from "@/lib/projects";
import { Select } from "@/ui/atoms/select";
import { Switch } from "@/ui/atoms/switch";
import { SettingsRow } from "@/ui/molecules/settings-row";

const NONE = "none";
const SPACES = ["design", "specs", "work", "factory", "code", "knowledge"] as const;

/**
 * What a project sets for this machine: the assistant defaults of its new threads, the remote
 * watch, the notices and the profile (role, spaces, read only). It all stays in the app data
 * folder and never reaches the repository. Legacy source: `components/project-overrides.tsx`,
 * `components/project-profiles.tsx` and `lib/profiles.ts`.
 */
export function ProjectOverrides() {
	const { t } = useI18n();
	const w = t.workspace.override;
	const p = t.workspace.profile;
	const qc = useQueryClient();
	const active = useActiveProject().data;
	const defaults = useQuery({
		queryKey: ["assistant", "defaults"],
		queryFn: () => unwrap(commands.assistantDefaultsGet()),
		enabled: Boolean(active),
	}).data;
	const runners =
		useQuery({
			queryKey: ["assistant", "options"],
			queryFn: () => unwrap(commands.assistantOptions()),
			enabled: Boolean(active),
		}).data ?? [];
	if (!active) return null;
	const o = active.overrides;
	const setOverride = async (patch: Partial<Overrides_Serialize>) => {
		await unwrap(commands.projectOverridesSave({ ...o, ...patch }));
		await qc.invalidateQueries();
	};
	const setDefaults = async (patch: AssistantDefaults_Deserialize) => {
		await unwrap(commands.assistantDefaultsSet({ ...defaults, ...patch }));
		await qc.invalidateQueries({ queryKey: ["assistant"] });
	};
	const pick = (v: string) => (v === NONE ? null : v);
	const items = (values: string[]) => [
		{ value: NONE, label: w.default },
		...values.map((v) => ({ value: v, label: v })),
	];
	const runner = runners.find((r) => r.runner === defaults?.runner);
	const tabs = o.profileTabs ?? [];
	return (
		<section aria-label={w.title} className="flex flex-col">
			<h2 className="pb-1 text-12 font-medium text-n-11">{w.title}</h2>
			<SettingsRow label={w.remoteWatch}>
				<Switch
					iconOnly
					label={w.remoteWatch}
					checked={o.remoteWatch !== false}
					onCheckedChange={(v) => void setOverride({ remoteWatch: v ? null : false })}
				/>
			</SettingsRow>
			<SettingsRow label={w.notifications}>
				<Switch
					iconOnly
					label={w.notifications}
					checked={o.notifications !== false}
					onCheckedChange={(v) => void setOverride({ notifications: v ? null : false })}
				/>
			</SettingsRow>
			<SettingsRow label={`${w.assistant} ${w.runner}`}>
				<Select
					label={`${w.assistant} ${w.runner}`}
					value={defaults?.runner ?? NONE}
					onValueChange={(v) => void setDefaults({ runner: pick(v), model: null, effort: null })}
					items={items(runners.map((r) => r.runner))}
				/>
			</SettingsRow>
			<SettingsRow label={`${w.assistant} ${w.model}`}>
				<Select
					label={`${w.assistant} ${w.model}`}
					value={defaults?.model ?? NONE}
					onValueChange={(v) => void setDefaults({ model: pick(v) })}
					items={items(runner?.models ?? [])}
				/>
			</SettingsRow>
			<SettingsRow label={`${w.assistant} ${w.effort}`}>
				<Select
					label={`${w.assistant} ${w.effort}`}
					value={defaults?.effort ?? NONE}
					onValueChange={(v) => void setDefaults({ effort: pick(v) })}
					items={items(runner?.efforts ?? [])}
				/>
			</SettingsRow>
			<SettingsRow label={`${w.assistant} ${w.permission}`}>
				<Select
					label={`${w.assistant} ${w.permission}`}
					value={defaults?.permission ?? NONE}
					onValueChange={(v) => void setDefaults({ permission: pick(v) as Permission | null })}
					items={[
						{ value: NONE, label: w.default },
						{ value: "approve", label: w.permissions.approve },
						{ value: "auto", label: w.permissions.auto },
					]}
				/>
			</SettingsRow>
			<h2 className="pt-3 pb-1 text-12 font-medium text-n-11">{p.title}</h2>
			<SettingsRow label={p.role}>
				<Select
					label={p.role}
					value={o.profileRole ?? NONE}
					onValueChange={(v) => void setOverride({ profileRole: pick(v) })}
					items={[
						{ value: NONE, label: w.default },
						...ROLES.map((r) => ({ value: r, label: t.role[r] })),
					]}
				/>
			</SettingsRow>
			{SPACES.map((s) => (
				<SettingsRow key={s} label={`${p.tabs} ${t.space[s]}`}>
					<Switch
						iconOnly
						label={`${p.tabs} ${t.space[s]}`}
						checked={tabs.length === 0 || tabs.includes(s)}
						onCheckedChange={(v) => {
							const all: string[] = tabs.length === 0 ? [...SPACES] : tabs;
							const next = v ? [...new Set([...all, s])] : all.filter((x) => x !== s);
							// Every space on is the same as no list.
							void setOverride({ profileTabs: next.length === SPACES.length ? null : next });
						}}
					/>
				</SettingsRow>
			))}
			<SettingsRow label={p.readOnly}>
				<Switch
					iconOnly
					label={p.readOnly}
					checked={o.readOnly === true}
					onCheckedChange={(v) => void setOverride({ readOnly: v ? true : null })}
				/>
			</SettingsRow>
		</section>
	);
}
