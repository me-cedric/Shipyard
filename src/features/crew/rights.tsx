import { useNavigate, useSearch } from "@tanstack/react-router";
import { NoProject } from "@/features/shell/no-project";
import { PeopleCard, useRolesSave } from "@/features/work/team-rights";
import { format, useI18n } from "@/lib/i18n";
import type { TeamRole } from "@/lib/ipc";
import { TEAM_ROLES } from "@/lib/prefs";
import { useActiveProject } from "@/lib/projects";
import { useRights } from "@/lib/rights";
import { useTeam } from "@/lib/work";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import { PageHeader } from "@/ui/molecules/page-header";
import { RoleCard } from "./role-card";
import { LevelsPage, TeamPage } from "./team-page";

const isRole = (r: unknown): r is TeamRole => (TEAM_ROLES as unknown[]).includes(r);

/**
 * Crew / Rights (`spec:app-redesign#REQ-016`): the people with their roles, and the rights of one
 * role in plain words. The key `role` of the address holds the role; `page=team` opens the team file.
 */
export function Rights() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const search = useSearch({ strict: false }) as { page?: string; role?: string };
	const active = useActiveProject().data;
	const team = useTeam();
	const { role: own, gate } = useRights();
	const roles = useRolesSave();
	if (active === undefined || team.isLoading) return <Loading title={t.ui.place.crew} />;
	if (active === null) return <NoProject title={t.ui.place.crew} icon={null} />;
	if (search.page === "team") return <TeamPage />;
	if (search.page === "levels") return <LevelsPage />;
	const role = isRole(search.role) ? search.role : isRole(own) ? own : "developer";
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageHeader
				title={t.ui.place.crew}
				menu={[
					{
						// The reset of the older Edit mode: it saves at once.
						label: format(t.rights.team.reset, { role: t.rights.role[role] }),
						disabled: gate("project.settings").disabled,
						onClick: () => void roles.reset(role),
					},
				]}
			/>
			<div className="flex flex-col gap-4 px-4 pb-4">
				<ErrorNotice error={team.data?.error ?? roles.failure} />
				<div className="flex flex-wrap items-start gap-5">
					<PeopleCard roles={roles} />
					<RoleCard
						role={role}
						onRole={(next) =>
							void navigate({ to: "/crew/rights", search: { role: next } as never, replace: true })
						}
					/>
				</div>
			</div>
		</div>
	);
}
