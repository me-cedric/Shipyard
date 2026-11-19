import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RequestTree } from "@/features/factory/usage/request-tree";
import { useMachineSpend, useRuns, useSessions, useUsage } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { runnerName } from "@/ui/atoms/brand-icon";
import { buttonVariants } from "@/ui/atoms/button";
import { Progress } from "@/ui/atoms/progress";
import { ChevronRightIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { PageHeader } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";
import { BackToSpend, toSpend, usePrices } from "./spend-parts";
import { useSuccess } from "./spend-usage";

const BLOCKS = 10;

/** The spend of this computer this month, one bar for each AI tool. */
function ToolBars({ price }: { price: (text: string) => ReactNode }) {
	const spend = useMachineSpend(90);
	const month = new Date().toISOString().slice(0, 7);
	const sum = new Map<string, number>();
	for (const r of (spend.data ?? spend.partial)?.rows ?? [])
		if (r.day.startsWith(month)) sum.set(r.runner, (sum.get(r.runner) ?? 0) + (r.costUsd ?? 0));
	const top = Math.max(...sum.values(), 0.01);
	return [...sum]
		.sort((a, b) => b[1] - a[1])
		.map(([runner, usd]) => (
			<div key={runner} className="flex flex-col gap-1.5">
				<span className="font-semibold">
					{runnerName(runner)}, {price(`$${usd.toFixed(2)}`)}
				</span>
				<Progress value={usd} max={top} label={runnerName(runner)} />
			</div>
		));
}

/**
 * How agents do (picture 078, `page=how` of Spend): the success rate, the requests of one run (key
 * `run`) and the use of this machine. The tiles and the usage tables are on `page=usage`, from More.
 */
export function SpendHow({ run }: { run: string | null }) {
	const { t } = useI18n();
	const s = t.factory.spendPage;
	const navigate = useNavigate();
	const { price, menu } = usePrices();
	const titles = new Map((useRuns().data ?? []).map((r) => [r.id, r.title]));
	const runs = (useUsage().data?.runs ?? []).map((r) => ({ ...r, title: titles.get(r.run) }));
	// The first run that has spend shows its requests until a person picks another.
	const first = runs.find((r) => r.tokens > 0)?.run ?? runs[0]?.run ?? null;
	const { ended, won, wonState } = useSuccess();
	const last = ended.slice(-BLOCKS);
	const sessions = useSessions().data?.length ?? 0;
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageHeader
				title={s.howTitle}
				back={<BackToSpend />}
				menu={[...menu, { label: t.factory.usage, onClick: () => void navigate(toSpend("usage")) }]}
			/>
			<div className="flex flex-wrap items-start gap-5 px-4 pb-4">
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
					<Link to="/flow/done" className={cn(buttonVariants(), "w-full")}>
						{s.theRuns}
					</Link>
				</Card>
				<RequestTree
					runs={runs}
					run={run ?? first}
					onRun={(id) => void navigate({ ...toSpend("how", id), replace: true })}
				/>
				<Card pad className="flex flex-[1_1_18rem] flex-col gap-3.5">
					<h2 className="text-13 font-semibold text-n-11">{s.machine}</h2>
					<ToolBars price={price} />
					<Row className="px-0" render={(props) => <Link to="/crew/sessions" {...props} />}>
						<span className="flex-1 font-semibold">
							{format(sessions === 1 ? s.sessionRun : s.sessionsRun, { count: sessions })}
						</span>
						<ChevronRightIcon size={20} />
					</Row>
				</Card>
			</div>
		</div>
	);
}
