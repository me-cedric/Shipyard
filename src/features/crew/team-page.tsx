import { Link } from "@tanstack/react-router";
import { useContext, useMemo } from "react";
import {
	AuditTail,
	JoinAsked,
	JoinRequest,
	MemberLevels,
	TeamBanners,
	TeamFileCard,
} from "@/features/work/team-rights";
import { useI18n } from "@/lib/i18n";
import { BackLink } from "@/ui/molecules/back-link";
import { PageHeader, PageSwitchContext } from "@/ui/molecules/page-header";

/**
 * The team file, a page of Crew / Rights (`page=team`): who the person is, the join requests, the
 * move of the roles of this machine, the changes of rights and the rights of each person.
 */
export function TeamPage() {
	const { t } = useI18n();
	const r = t.rights.team;
	const slot = useContext(PageSwitchContext);
	// A sub-page claims the section switch and draws none: its way back is the link "Rights".
	const bare = useMemo(() => slot && { ...slot, node: null }, [slot]);
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageSwitchContext.Provider value={bare}>
				<PageHeader
					title={r.teamTitle}
					back={
						<BackLink label={r.back} render={(props) => <Link to="/crew/rights" {...props} />} />
					}
				/>
			</PageSwitchContext.Provider>
			<div className="flex flex-col gap-5 px-4 pb-4">
				<TeamBanners />
				<div className="flex flex-wrap items-start gap-5">
					<div className="flex flex-[1_1_25rem] flex-col gap-5">
						<JoinAsked />
						<JoinRequest />
						<TeamFileCard />
					</div>
					<div className="flex flex-[1_1_25rem] flex-col gap-5">
						<AuditTail />
					</div>
				</div>
				<MemberLevels />
			</div>
		</div>
	);
}
