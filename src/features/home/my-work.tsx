import { useGuard } from "@/features/work/guard";
import { TicketDetail } from "@/features/work/ticket-detail";
import { useRunActions } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { copyText, useMenus } from "@/lib/menus";
import { RightButton, useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { useWorkItems } from "@/lib/sync";
import { memberName, useTeam, useWorkActions, useWorkContext } from "@/lib/work";
import { Badge } from "@/ui/atoms/badge";
import { Select } from "@/ui/atoms/select";
import { Panel } from "@/ui/molecules/panel";
import { TicketRow, type WorkCategory } from "@/ui/molecules/ticket-row";
import { useMyItems } from "./stats";

const WEEK = 7 * 24 * 3600 * 1000;

/** One ticket of the person: the row opens the ticket; the status and Start run sit in the row. */
function MyTicket({ itemKey, statuses }: { itemKey: string; statuses: string[] }) {
	const { t } = useI18n();
	const menu = useMenus();
	const { openDetail } = useShell();
	const members = useTeam().data?.team.members ?? [];
	const item = (useWorkItems({}).data ?? []).find((i) => i.key === itemKey);
	const caps = useWorkContext().data?.capabilities;
	const act = useWorkActions();
	const runs = useRunActions();
	const { error, run } = useGuard();
	const edit = useRights().gate("work.edit");
	if (!item) return null;
	const open = () => openDetail(item.key, <TicketDetail key={item.key} itemKey={item.key} />);
	return (
		<div className="border-b last:border-b-0">
			<div className="flex items-center gap-2 pr-3">
				<div className="min-w-0 flex-1">
					<TicketRow
						itemKey={item.key}
						title={item.title}
						status={item.status}
						category={item.category as WorkCategory}
						assignee={memberName(members, item.member)}
						claimed={item.claimed ? t.sync.runState.Claimed : undefined}
						onOpen={open}
						menu={menu("ticket", {
							open,
							"copy-ref": () => copyText(`wi:${item.key}`),
						})}
					/>
				</div>
				<Select
					label={`${t.sync.backlog.status} ${item.key}`}
					value={item.status}
					disabled={!caps?.transitions || edit.disabled}
					reason={
						edit.reason ??
						(caps?.transitions
							? undefined
							: caps
								? format(t.work.missing, { name: t.connections.flag.transitions })
								: t.work.noTracker)
					}
					onValueChange={(to) => void run(() => act.transition(item.key, to))}
					items={statuses.map((s) => ({ value: s, label: s }))}
				/>
				<RightButton
					right="runs.start"
					aria-label={`${t.factory.start} ${item.key}`}
					onClick={() => void run(() => runs.start(item.key))}
				>
					{t.factory.start}
				</RightButton>
			</div>
			{error ? (
				<p role="alert" className="px-3 pb-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</div>
	);
}

/** The work of the person in three groups: in progress, to do and done in 7 days (spec:app-redesign#REQ-009). A group with nothing hides. */
export function MyWork() {
	const { t } = useI18n();
	const d = t.home.today;
	const mine = useMyItems();
	const statuses = [...new Set((useWorkItems({}).data ?? []).map((i) => i.status))];
	const recent = (i: { updated: string }) => {
		const at = Date.parse(i.updated);
		return Number.isNaN(at) || Date.now() - at <= WEEK;
	};
	const groups: [string, string, typeof mine][] = [
		["in-progress", d.inProgress, mine.filter((i) => i.category === "in-progress")],
		["todo", d.todo, mine.filter((i) => i.category === "todo")],
		["done", d.done, mine.filter((i) => i.category === "done" && recent(i))],
	];
	return (
		<>
			{mine.length ? (
				<h2
					aria-label={format(t.count, { name: t.ui.myItems, count: mine.length })}
					className="flex items-center gap-2 px-4 text-14 font-medium text-n-12"
				>
					{t.ui.myItems}
					<Badge className="font-mono">{mine.length}</Badge>
				</h2>
			) : null}
			{groups.map(([id, name, rows]) =>
				rows.length ? (
					<div key={id} className="px-4">
						<Panel title={name} count={rows.length} flush>
							{rows.map((i) => (
								<MyTicket key={i.key} itemKey={i.key} statuses={statuses} />
							))}
						</Panel>
					</div>
				) : null,
			)}
		</>
	);
}
