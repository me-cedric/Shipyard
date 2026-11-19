import { Link, useNavigate } from "@tanstack/react-router";
import { MachineUsage } from "@/features/factory/usage/machine-usage";
import { RequestTree } from "@/features/factory/usage/request-tree";
import { useSessions, useUsage } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { buttonVariants } from "@/ui/atoms/button";
import { ChevronRightIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { PageHeader } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";
import { BackToSpend, toSpend, usePrices } from "./spend-parts";
import { UsageCard, useSuccess } from "./spend-usage";

const BLOCKS = 10;

/**
 * How agents do (picture 078, `page=how` of Spend): the success rate, the requests of one run (key
 * `run`) and the use of this machine. The tiles and the usage table of the older page sit under them.
 */
export function SpendHow({ run }: { run: string | null }) {
	const { t } = useI18n();
	const s = t.factory.spendPage;
	const navigate = useNavigate();
	const { prices, price, switcher } = usePrices();
	const runs = useUsage().data?.runs ?? [];
	const { ended, won, wonState } = useSuccess();
	const last = ended.slice(-BLOCKS);
	const sessions = useSessions().data?.length ?? 0;
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageHeader title={s.howTitle} back={<BackToSpend />} action={switcher} />
			<div className="flex flex-col gap-5 px-4 pb-4">
				<div className="flex flex-wrap items-start gap-5">
					<Card pad className="flex flex-[1_1_18rem] flex-col gap-3.5">
						<h2 className="text-13 font-semibold text-n-11">{t.factory.successRate}</h2>
						<span className="text-[56px] leading-none font-semibold tracking-tight text-n-12">
							{ended.length ? `${Math.round((won / ended.length) * 100)} %` : "-"}
						</span>
						<div
							role="img"
							aria-label={format(s.outcome, { count: last.length })}
							className="flex h-9 items-end gap-1"
						>
							{last.map((r) => (
								<i
									key={r.id}
									style={{ height: wonState(r.state) ? "100%" : "55%" }}
									className={cn(
										"flex-1 rounded-sm",
										wonState(r.state) ? "bg-success-text" : "bg-attention-strong",
									)}
								/>
							))}
						</div>
						<div className="flex flex-wrap gap-2">
							<Badge variant="success">{s.merged}</Badge>
							<Badge variant="you">{s.notMerged}</Badge>
						</div>
						<Link to="/flow/done" className={cn(buttonVariants(), "self-start")}>
							{s.theRuns}
						</Link>
					</Card>
					<RequestTree
						runs={runs}
						run={run}
						onRun={(id) => void navigate({ ...toSpend("how", id), replace: true })}
					/>
					<div className="flex flex-[1_1_18rem] flex-col gap-3">
						<h2 className="text-13 font-semibold text-n-11">{s.machine}</h2>
						<MachineUsage prices={prices} withBudget={false} />
						<Card>
							<Row render={(props) => <Link to="/crew/sessions" {...props} />}>
								<span className="flex-1 font-semibold">
									{format(sessions === 1 ? s.sessionRun : s.sessionsRun, { count: sessions })}
								</span>
								<ChevronRightIcon size={20} />
							</Row>
						</Card>
					</div>
				</div>
				<UsageCard
					prices={prices}
					price={price}
					onBudget={() => void navigate(toSpend("budgets"))}
				/>
			</div>
		</div>
	);
}
