import { NoProject } from "@/features/shell/no-project";
import { useI18n } from "@/lib/i18n";
import { useActiveProject } from "@/lib/projects";
import { useTeam } from "@/lib/work";
import { UsersIcon } from "@/ui/icons";
import { Loading } from "@/ui/molecules/loading";
import { ListDetail } from "@/ui/templates/list-detail";
import { AuditTail, JoinRequest, Migration, TeamBanners, TeamRights } from "./team-rights";

/**
 * The rights part of `.shipyard/team.yaml`: who the person is, the join request, the move of the
 * roles of this machine, the rights of each role and of each member, and the audit tail. The
 * members and their form are on Crew (`src/features/crew/crew-page.tsx`).
 */
export function TeamFile() {
	const { t } = useI18n();
	const active = useActiveProject().data;
	const view = useTeam();
	const title = t.ui.place.crew;
	if (active === undefined || view.isLoading)
		return <Loading title={title} icon={<UsersIcon size={16} />} />;
	if (active === null) return <NoProject title={title} icon={<UsersIcon size={16} />} />;
	return (
		<ListDetail title={title} icon={<UsersIcon size={16} />}>
			<TeamBanners />
			<JoinRequest />
			<Migration />
			{view.data?.error ? (
				<p role="alert" className="px-3 py-1 text-ui text-danger-text">
					{view.data.error}
				</p>
			) : null}
			<TeamRights />
			<AuditTail />
		</ListDetail>
	);
}

/** The name of before: `src/features/work/index.ts` and the stub of Crew / Rights import it. */
export const Team = TeamFile;
