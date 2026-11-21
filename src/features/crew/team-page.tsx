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
import { ChevronRightIcon } from "@/ui/icons";
import { BackLink } from "@/ui/molecules/back-link";
import { Card } from "@/ui/molecules/card";
import { PageHeader } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";

/**
 * The team file, a page of Crew / Rights (`page=team`): who the person is, the join requests, the
 * move of the roles of this machine and the changes of rights. The rights of each person are one
 * step further (`page=levels`).
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
						<Card className="py-2">
							<Row
								render={(props) => (
									<Link to="/crew/rights" search={{ page: "levels" } as never} {...props} />
								)}
							>
								<span className="font-semibold">{r.each}</span>
								<ChevronRightIcon size={20} className="ml-auto text-n-10" />
							</Row>
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
}

/** The rights of each person, one step from the team file (`page=levels`). Read only. */
export function LevelsPage() {
	const { t } = useI18n();
	const r = t.rights.team;
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageHeader
				title={r.each}
				back={
					<BackLink
						label={r.teamTitle}
						render={(props) => (
							<Link to="/crew/rights" search={{ page: "team" } as never} {...props} />
						)}
					/>
				}
			/>
			<div className="flex flex-col gap-5 px-4 pb-4">
				<MemberLevels />
			</div>
		</div>
	);
}
