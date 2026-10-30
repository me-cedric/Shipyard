import { useQueryClient } from "@tanstack/react-query";
import { PinnedTiles } from "@/features/knowledge/pinned";
import { NoProject } from "@/features/work/no-project";
import { TicketDetail } from "@/features/work/ticket-detail";
import { useRuns } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { copyText, useMenus } from "@/lib/menus";
import { useActiveProject } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { useWorkItems } from "@/lib/sync";
import { memberName, useTeam, useWorkContext } from "@/lib/work";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ArrowPathIcon, UsersIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { PageHeader } from "@/ui/molecules/page-header";
import { Panel } from "@/ui/molecules/panel";
import { RefChip } from "@/ui/molecules/ref-chip";
import { RUN_STATUS } from "@/ui/molecules/run-card";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { TicketRow, type WorkCategory } from "@/ui/molecules/ticket-row";

/** The mirrored items assigned to the person. */
export function useMyItems() {
	const me = useWorkContext().data?.me ?? null;
	return (useWorkItems({}).data ?? []).filter((i) => me !== null && i.member === me);
}

/** Home / My work: the mirrored items assigned to the person, and the runs on those items (shell REQ-003). */
export function MyWork() {
	const { t } = useI18n();
	const menu = useMenus();
	const qc = useQueryClient();
	const active = useActiveProject().data;
	const { openDetail, openRef } = useShell();
	const members = useTeam().data?.team.members ?? [];
	const items = useMyItems();
	const keys = new Set(items.map((i) => i.key));
	const runs = (useRuns().data ?? []).filter((r) => keys.has(r.key));
	if (active === undefined) return null;
	if (active === null) return <NoProject title={t.tabs.home["my-work"]} />;
	const refresh = () => void qc.invalidateQueries();
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 pb-4">
			<PageHeader
				icon={<UsersIcon size={16} />}
				title={t.tabs.home["my-work"]}
				count={items.length}
				menu={[{ label: t.home.refresh, icon: <ArrowPathIcon size={12} />, onClick: refresh }]}
			/>
			<StatStrip
				className="px-4"
				items={[
					{ label: t.ui.myItems, value: String(items.length), tone: "accent" },
					{
						label: t.home.stat.inProgress,
						value: String(items.filter((i) => i.category === "in-progress").length),
						tone: "info",
					},
					{
						label: t.home.stat.done,
						value: String(items.filter((i) => i.category === "done").length),
						tone: "success",
					},
					{
						label: t.home.stat.live,
						value: String(
							runs.filter((r) => r.lane === "working" || r.lane === "needs_you").length,
						),
						tone: "warning",
					},
				]}
			/>
			<PinnedTiles />
			{items.length === 0 && runs.length === 0 ? (
				<EmptyState
					action={{ label: t.home.refresh, icon: <ArrowPathIcon size={14} />, onClick: refresh }}
				/>
			) : (
				<div className="grid gap-4 px-4 xl:grid-cols-2">
					<Panel title={t.home.items} count={items.length} flush>
						{items.map((i) => (
							<TicketRow
								key={i.key}
								itemKey={i.key}
								title={i.title}
								status={i.status}
								category={i.category as WorkCategory}
								assignee={memberName(members, i.member)}
								claimed={i.claimed ? t.sync.runState.Claimed : undefined}
								onOpen={() => openDetail(i.key, <TicketDetail key={i.key} itemKey={i.key} />)}
								menu={menu("ticket", {
									open: () => openDetail(i.key, <TicketDetail key={i.key} itemKey={i.key} />),
									"copy-ref": () => copyText(`wi:${i.key}`),
								})}
							/>
						))}
					</Panel>
					<Panel title={t.factory.runs} count={runs.length} flush>
						{runs.map((r) => (
							<div key={r.id} className="flex h-row items-center gap-2 border-b px-3">
								<StatusDot status={RUN_STATUS[r.state]} label={t.factory.state[r.state]} />
								<RefChip refId={`run:${r.id}`} state="resolved" onOpen={openRef} />
								<span className="font-mono text-12 text-n-11">{r.key}</span>
								<span className="truncate text-ui">{r.title}</span>
							</div>
						))}
					</Panel>
				</div>
			)}
		</div>
	);
}
