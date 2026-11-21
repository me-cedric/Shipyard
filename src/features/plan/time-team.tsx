import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { formatMinutes, monthLabel, useTeam, useTimeView } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { ChevronRightIcon } from "@/ui/icons";
import { BackLink } from "@/ui/molecules/back-link";
import { Card } from "@/ui/molecules/card";
import { PageHeader } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";

/** One person: the hours of the month. The row opens the week of that person. */
function MemberRow({ handle, name, month }: { handle: string; name: string; month: string }) {
	const rows = useTimeView(handle, month).data?.rows ?? [];
	const minutes = rows.reduce((n, r) => n + (r.entry?.minutes ?? 0), 0);
	return (
		<Row
			render={(props) => <Link to="/plan/time" search={{ member: handle } as never} {...props} />}
		>
			<Avatar name={name} />
			<span className="flex-1 font-semibold">{name}</span>
			<span className="text-n-10">{formatMinutes(minutes)}</span>
			<ChevronRightIcon size={20} />
		</Row>
	);
}

/** Plan / Time, time of the team: the hours that each person wrote in one month. */
export function TimeTeam({ month }: { month: string }) {
	const { t, lang } = useI18n();
	const p = t.planPlace;
	const members = useTeam().data?.team.members ?? [];
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				title={p.time.team}
				back={
					<BackLink label={p.views.time} render={(props) => <Link to="/plan/time" {...props} />} />
				}
			/>
			<div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pt-1 pb-4">
				<Card className="shrink-0 py-2">
					<h2 className="px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-10">
						{monthLabel(month, lang)}
					</h2>
					{members.map((m) => (
						<MemberRow key={m.handle} handle={m.handle} name={m.name} month={month} />
					))}
				</Card>
			</div>
		</div>
	);
}
