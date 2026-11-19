import { Link } from "@tanstack/react-router";
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
import { PageHeader } from "@/ui/molecules/page-header";

/**
 * The team file, a page of Crew / Rights (`page=team`): who the person is, the join requests, the
 * move of the roles of this machine, the changes of rights and the rights of each person.
 */
export function TeamPage() {
	const { t } = useI18n();
	const r = t.rights.team;
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageHeader
				title={r.teamTitle}
				back={<BackLink label={r.back} render={(props) => <Link to="/crew/rights" {...props} />} />}
			/>
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
