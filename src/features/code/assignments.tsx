import { format, useI18n } from "@/lib/i18n";
import { copyText } from "@/lib/menus";
import { useAssignments } from "@/lib/projects";
import { Button } from "@/ui/atoms/button";
import { ClipboardIcon } from "@/ui/icons";
import { Panel } from "@/ui/molecules/panel";
import { SettingsRow } from "@/ui/molecules/settings-row";

/**
 * The work split by profile (`docs/delivery/assignments.json`, the Legacy file). One row for each
 * profile with its days and its cost. The action copies the brief that a lead shares. Nothing
 * shows when the file has no profile.
 */
export function Assignments() {
	const { t } = useI18n();
	const i18n = t.forge.impacts;
	const rows = useAssignments().data?.assignments ?? [];
	if (!rows.length) return null;
	return (
		<Panel title={i18n.assignments} count={rows.length} flush className="shrink-0">
			{rows.map((a) => (
				<SettingsRow key={a.personaId || a.personaName} label={a.personaName}>
					<span className="font-mono text-12 text-n-11">
						{format(i18n.days, { count: a.mandays ?? 0 })}
					</span>
					<Button
						variant="ghost"
						aria-label={format(i18n.copyBrief, { name: a.personaName })}
						onClick={() => copyText(a.briefText)}
					>
						<ClipboardIcon size={14} />
						{i18n.copy}
					</Button>
				</SettingsRow>
			))}
		</Panel>
	);
}
