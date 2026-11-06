import type { ReactNode } from "react";
import { Panel } from "../molecules/panel";
import { SettingsRow } from "../molecules/settings-row";

export type SettingsSection = {
	id: string;
	title: string;
	icon?: ReactNode;
	rows: { id: string; icon?: ReactNode; label: string; control: ReactNode }[];
};

/** The one content width of a settings page: the sections and the rows after them share it. */
export const SETTINGS_PAGE = "flex max-w-3xl flex-col gap-4 px-4 pt-1 pb-4";

/** Settings as grouped panels: one panel for each section, one row for each setting, the control on the right. */
export function Settings({ sections }: { sections: SettingsSection[] }) {
	return (
		<div className="flex max-w-3xl flex-col gap-4">
			{sections.map((s) => (
				<Panel
					key={s.id}
					id={`section-${s.id}`}
					title={s.title}
					count={s.rows.length}
					icon={s.icon}
					flush
				>
					{s.rows.map((r) => (
						<SettingsRow key={r.id} id={r.id} icon={r.icon} label={r.label}>
							{r.control}
						</SettingsRow>
					))}
				</Panel>
			))}
		</div>
	);
}
