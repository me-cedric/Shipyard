import { NoProject } from "@/features/shell/no-project";
import { tabIcon } from "@/features/shell/spaces";
import {
	AuditTail,
	JoinRequest,
	Migration,
	TeamBanners,
	TeamRights,
} from "@/features/work/team-rights";
import { useI18n } from "@/lib/i18n";
import { useActiveProject } from "@/lib/projects";
import { useTeam } from "@/lib/work";
import { Loading } from "@/ui/molecules/loading";
import { PageHeader } from "@/ui/molecules/page-header";

/**
 * Crew / Rights (`spec:app-redesign#REQ-016`): the rights of each role and of each member, and the
 * team file: who the person is, the join request, the move of the roles of this machine and the
 * changes of rights.
 */
export function Rights() {
	const { t } = useI18n();
	const active = useActiveProject().data;
	const team = useTeam();
	const Icon = tabIcon("crew", "rights");
	const icon = Icon && <Icon size={16} />;
	if (active === undefined || team.isLoading)
		return <Loading title={t.ui.place.crew} icon={icon} />;
	if (active === null) return <NoProject title={t.ui.place.crew} icon={icon} />;
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageHeader icon={icon} title={t.ui.place.crew} />
			<TeamBanners />
			<JoinRequest />
			<Migration />
			{team.data?.error ? (
				<p role="alert" className="px-4 pb-2 text-ui text-danger-text">
					{team.data.error}
				</p>
			) : null}
			<TeamRights />
			<AuditTail />
		</div>
	);
}
