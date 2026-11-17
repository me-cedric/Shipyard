import { useMemo } from "react";
import { format, useI18n } from "@/lib/i18n";
import type { WorkItem } from "@/lib/sync";
import { figure, useSheet, useSheets } from "@/lib/work";
import { StatusDot } from "@/ui/atoms/status-dot";
import { PriorityGlyph, priorityOf, type WorkCategory } from "@/ui/molecules/ticket-row";

const CATEGORY_ORDER: WorkCategory[] = ["todo", "in-progress", "done"];

/**
 * The days of each ticket in the first ready estimate sheet, keyed by the ticket key.
 * shortcut: one sheet only; read every sheet when a project links tickets from several lots.
 */
export function useEstimateDays(): Map<string, number> {
	const slug = (useSheets().data ?? []).find((s) => s.state === "ready")?.slug ?? null;
	const sheet = useSheet(slug).data;
	return useMemo(() => {
		const out = new Map<string, number>();
		for (const f of sheet?.sheet.features ?? [])
			for (const task of f.tasks) {
				const days = sheet?.days[task.id];
				if (task.ticket && days != null) out.set(task.ticket.replace(/^wi:/, ""), days);
			}
		return out;
	}, [sheet]);
}

/** The statuses in board order: by category, then by name. */
export function statusesOf(items: WorkItem[]): { status: string; category: WorkCategory }[] {
	const seen = new Map<string, WorkCategory>();
	for (const i of items) seen.set(i.status, i.category as WorkCategory);
	return [...seen.entries()]
		.map(([status, category]) => ({ status, category }))
		.sort(
			(a, b) =>
				CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
				a.status.localeCompare(b.status),
		);
}

/** The facts of the ticket of a row: priority, claimed mark, a name that the team lacks, estimate. */
export function TicketFacts({ item, days }: { item: WorkItem; days: number | undefined }) {
	const { t, lang } = useI18n();
	const level = priorityOf(item.labels);
	const unknown = item.assignee && !item.member;
	return (
		<>
			{level === null ? null : <PriorityGlyph level={level} label={t.work.priority[level]} />}
			{item.claimed ? <StatusDot status="active" label={t.sync.runState.Claimed} /> : null}
			{unknown ? (
				<StatusDot status="warning" label={t.work.unknownMember} className="size-2" />
			) : null}
			{days === undefined ? null : (
				<span className="font-mono text-11 text-n-11">
					{format(t.work.daysShort, { days: figure(days, lang) })}
				</span>
			)}
		</>
	);
}
