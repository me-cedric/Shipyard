import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useActiveProject } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { useWorkItems, type WorkItem } from "@/lib/sync";
import { memberName, useTeam, useWorkActions } from "@/lib/work";
import { BoardColumn } from "@/ui/molecules/board-column";
import { EmptyState } from "@/ui/molecules/empty-state";
import { TicketCard } from "@/ui/molecules/ticket-card";
import type { WorkCategory } from "@/ui/molecules/ticket-row";
import { Board as BoardTemplate } from "@/ui/templates/board";
import { statusesOf } from "./backlog";
import { applyFilters, type Filters, ItemFilters, NO_FILTER } from "./filters";
import { useGuard } from "./guard";
import { NoProject } from "./no-project";
import { TicketDetail } from "./ticket-detail";

/** Work / Board: one column for each tracker status. A move sends the transition (REQ-002). */
export function Board() {
	const { t } = useI18n();
	const active = useActiveProject().data;
	const { openDetail } = useShell();
	const members = useTeam().data?.team.members ?? [];
	const act = useWorkActions();
	const navigate = useNavigate();
	const { error, run } = useGuard();
	const [filters, setFilters] = useState<Filters>(NO_FILTER);
	const [selected, setSelected] = useState<string | null>(null);
	// The column that a card shows while its move is on the way. A refusal removes it.
	const [moving, setMoving] = useState<Record<string, string>>({});
	const everything = useWorkItems({});
	const all = everything.data ?? [];
	const items = useMemo(
		() => applyFilters(all, filters).map((i) => ({ ...i, status: moving[i.key] ?? i.status })),
		[all, filters, moving],
	);
	const columns = useMemo(() => statusesOf(all), [all]);

	if (active === undefined || everything.isLoading) return null;
	if (active === null) return <NoProject title={t.tabs.work.board} />;
	if (all.length === 0)
		return (
			<BoardTemplate title={t.tabs.work.board}>
				<EmptyState
					action={{
						label: t.tabs.work.backlog,
						onClick: () => void navigate({ to: "/work/backlog" }),
					}}
				/>
			</BoardTemplate>
		);

	const move = (key: string, to: string) => {
		const item = all.find((i) => i.key === key);
		if (!item || (moving[key] ?? item.status) === to) return;
		setMoving((m) => ({ ...m, [key]: to }));
		void run(() => act.transition(key, to)).finally(() =>
			setMoving(({ [key]: _, ...rest }) => rest),
		);
	};
	const step = (item: WorkItem, by: -1 | 1) => {
		const at = columns.findIndex((c) => c.status === (moving[item.key] ?? item.status));
		const to = columns[at + by];
		if (to) move(item.key, to.status);
	};

	return (
		<BoardTemplate
			title={t.tabs.work.board}
			toolbar={
				<>
					<ItemFilters
						items={all}
						value={filters}
						onChange={setFilters}
						fields={["assignee", "label"]}
					/>
					{error ? (
						<p role="alert" className="text-ui text-danger-text">
							{error}
						</p>
					) : null}
				</>
			}
		>
			{columns.map(({ status, category }) => {
				const cards = items.filter((i) => i.status === status);
				return (
					<BoardColumn
						key={status}
						title={status}
						category={category as WorkCategory}
						count={cards.length}
						onDropKey={(key) => move(key, status)}
					>
						{cards.map((item) => (
							<TicketCard
								key={item.key}
								itemKey={item.key}
								title={item.title}
								assignee={
									item.assignee ? memberName(members, item.member ?? item.assignee) : undefined
								}
								unknown={item.assignee && !item.member ? t.work.unknownMember : undefined}
								claimed={item.claimed ? t.sync.runState.Claimed : undefined}
								selected={selected === item.key}
								onOpen={() => {
									setSelected(item.key);
									openDetail(item.key, <TicketDetail key={item.key} itemKey={item.key} />);
								}}
								onMove={(by) => step(item, by)}
							/>
						))}
					</BoardColumn>
				);
			})}
		</BoardTemplate>
	);
}
