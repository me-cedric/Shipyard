import { useQueryClient } from "@tanstack/react-query";
import { PinnedTiles } from "@/features/knowledge";
import { NoProject } from "@/features/work/no-project";
import { TicketDetail } from "@/features/work/ticket-detail";
import { useRuns } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { useActiveProject } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { useWorkItems } from "@/lib/sync";
import { memberName, useTeam, useWorkContext } from "@/lib/work";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ArrowPathIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { GroupSection } from "@/ui/molecules/group-section";
import { RefChip } from "@/ui/molecules/ref-chip";
import { RUN_STATUS } from "@/ui/molecules/run-card";
import { TicketRow, type WorkCategory } from "@/ui/molecules/ticket-row";
import { ListDetail } from "@/ui/templates/list-detail";

/** Home / My work: the mirrored items assigned to the person, and the runs on those items (shell REQ-003). */
export function MyWork() {
	const { t } = useI18n();
	const qc = useQueryClient();
	const active = useActiveProject().data;
	const { openDetail, openRef } = useShell();
	const me = useWorkContext().data?.me ?? null;
	const members = useTeam().data?.team.members ?? [];
	const items = (useWorkItems({}).data ?? []).filter((i) => me !== null && i.member === me);
	const keys = new Set(items.map((i) => i.key));
	const runs = (useRuns().data ?? []).filter((r) => keys.has(r.key));
	if (active === undefined) return null;
	if (active === null) return <NoProject title={t.tabs.home["my-work"]} />;
	return (
		<ListDetail title={t.tabs.home["my-work"]}>
			<PinnedTiles />
			{items.length === 0 && runs.length === 0 ? (
				<div className="p-4">
					<EmptyState
						action={{
							label: t.home.refresh,
							icon: <ArrowPathIcon size={14} />,
							onClick: () => void qc.invalidateQueries(),
						}}
					/>
				</div>
			) : (
				<>
					<GroupSection name={t.home.items} count={items.length}>
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
							/>
						))}
					</GroupSection>
					<GroupSection name={t.factory.runs} count={runs.length}>
						{runs.map((r) => (
							<div key={r.id} className="flex h-row items-center gap-2 border-b px-3">
								<StatusDot status={RUN_STATUS[r.state]} label={t.factory.state[r.state]} />
								<RefChip refId={`run:${r.id}`} state="resolved" onOpen={openRef} />
								<span className="font-mono text-12 text-n-11">{r.key}</span>
								<span className="truncate text-ui">{r.title}</span>
							</div>
						))}
					</GroupSection>
				</>
			)}
		</ListDetail>
	);
}
