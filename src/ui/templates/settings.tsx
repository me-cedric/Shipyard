import type { ReactNode } from "react";
import { format, useI18n } from "@/lib/i18n";
import { SettingsRow } from "../molecules/settings-row";

export type SettingsSection = {
	id: string;
	title: string;
	rows: { id: string; icon?: ReactNode; label: string; control: ReactNode }[];
};

export function Settings({ sections }: { sections: SettingsSection[] }) {
	const { t } = useI18n();
	return (
		<div className="flex max-w-2xl flex-col gap-6">
			{sections.map((s) => (
				<section key={s.id} aria-labelledby={`settings-${s.id}`}>
					<h2 id={`settings-${s.id}`} className="px-3 py-1 text-12 font-medium text-n-11">
						{format(t.count, { name: s.title, count: s.rows.length })}
					</h2>
					{s.rows.map((r) => (
						<SettingsRow key={r.id} icon={r.icon} label={r.label}>
							{r.control}
						</SettingsRow>
					))}
				</section>
			))}
		</div>
	);
}
