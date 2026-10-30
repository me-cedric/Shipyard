import { useQueryClient } from "@tanstack/react-query";
import { SPACES, type SpaceId, tabLabel } from "@/features/shell/spaces";
import { useI18n } from "@/lib/i18n";
import { commands, type Overrides_Serialize, unwrap } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { Checkbox } from "@/ui/atoms/checkbox";
import { Switch } from "@/ui/atoms/switch";
import { Panel } from "@/ui/molecules/panel";

/** The spaces that a profile can hide. Home and Settings always stay. */
const HIDEABLE = ["design", "specs", "work", "factory", "code", "knowledge"] as const;
const LISTED: SpaceId[] = ["home", ...HIDEABLE];

/**
 * The screens of this project on this machine: each space and each of its tabs on or off. It lives
 * with the project profile in the app data folder. Settings is never hidden, and a space keeps one
 * tab at least.
 */
export function ScreensCard() {
	const { t } = useI18n();
	const p = t.workspace.profile;
	const qc = useQueryClient();
	const active = useActiveProject().data;
	if (!active) return null;
	const o = active.overrides;
	const save = async (patch: Partial<Overrides_Serialize>) => {
		await unwrap(commands.projectOverridesSave({ ...o, ...patch }));
		await qc.invalidateQueries();
	};
	const spaces = o.profileTabs ?? [];
	const hidden = o.hiddenTabs ?? [];
	const spaceOn = (s: SpaceId) => s === "home" || spaces.length === 0 || spaces.includes(s);
	const setSpace = (s: SpaceId, on: boolean) => {
		const all: string[] = spaces.length === 0 ? [...HIDEABLE] : spaces;
		const next = on ? [...new Set([...all, s])] : all.filter((x) => x !== s);
		// Every space on is the same as no list.
		void save({ profileTabs: next.length === HIDEABLE.length ? null : next });
	};
	const setTab = (key: string, on: boolean) => {
		const next = on ? hidden.filter((x) => x !== key) : [...hidden, key];
		void save({ hiddenTabs: next.length ? next : null });
	};
	return (
		<Panel title={p.screens} flush>
			<ul className="flex flex-col divide-y">
				{LISTED.map((s) => {
					const on = spaceOn(s);
					const kept = SPACES[s].filter((tab) => !hidden.includes(`${s}/${tab}`));
					return (
						<li key={s} className="flex flex-col gap-1 px-3 py-2">
							<div className="flex h-row items-center gap-2">
								<span className="flex-1 text-ui font-medium text-n-12">{t.space[s]}</span>
								{s === "home" ? null : (
									<Switch
										iconOnly
										label={`${p.tabs} ${t.space[s]}`}
										checked={on}
										onCheckedChange={(v) => setSpace(s, v)}
									/>
								)}
							</div>
							<fieldset
								aria-label={t.space[s]}
								disabled={!on}
								className="flex flex-wrap gap-x-4 disabled:opacity-50"
							>
								{SPACES[s].map((tab) => {
									const key = `${s}/${tab}`;
									const shown = !hidden.includes(key);
									return (
										<Checkbox
											key={tab}
											label={tabLabel(t, s, tab)}
											checked={shown}
											// The last tab of a space stays: hide the space instead.
											disabled={!on || (shown && kept.length === 1)}
											onCheckedChange={(v) => setTab(key, v)}
										/>
									);
								})}
							</fieldset>
						</li>
					);
				})}
			</ul>
		</Panel>
	);
}
