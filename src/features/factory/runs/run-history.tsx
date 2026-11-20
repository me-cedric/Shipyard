import type { ReactNode } from "react";
import type { RunItem } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import type { RunState } from "@/lib/ipc/bindings";
import { RightButton } from "@/lib/rights";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { CpuChipIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { ContextMenu, type MenuItem } from "@/ui/molecules/context-menu";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Row } from "@/ui/molecules/row";
import { nameOf } from "./run-live";
import { endOf, stepperOf } from "./run-summary";

/** The columns that a person can add to the list: off at first, as the design shows four columns. */
export const EXTRA_COLUMNS = ["workflow", "steps", "ended", "pr"] as const;
export type ExtraColumn = (typeof EXTRA_COLUMNS)[number];

/** One finished thing: an ended run, or a finished feature that has no run. */
export type HistoryRow = {
	id: string;
	title: string;
	/** The key of the ticket: said, not shown. */
	ticket?: string;
	/** How it ended. */
	end: RunState;
	who: { name: string; agent: boolean } | null;
	/** The run of the row: its cost and the extra columns. */
	run?: RunItem;
	menu?: MenuItem[];
	onOpen: () => void;
	/** Starts the ticket again: on a failed row. */
	onAgain?: () => void;
};

const END_TONE: Partial<Record<RunState, "success" | "danger">> = {
	Merged: "success",
	Done: "success",
	Failed: "danger",
};

const WIDTH: Record<ExtraColumn, string> = {
	workflow: "minmax(6rem, 9rem)",
	steps: "5rem",
	ended: "11rem",
	pr: "8rem",
};

/**
 * Flow / Done (ux-declutter REQ-036): one row for each finished thing, newest first. A row opens
 * its feature page. A failed row can start again.
 */
export function RunHistory({
	rows,
	columns,
	onBoard,
}: {
	rows: HistoryRow[];
	/** The extra columns that show. */
	columns: readonly ExtraColumn[];
	onBoard: () => void;
}) {
	const { t, lang } = useI18n();
	const f = t.factory;
	const l = f.runsList;
	const b = t.flow.look.board;
	if (rows.length === 0)
		return (
			<EmptyState
				title={t.empty.runs}
				icon={<CpuChipIcon size={28} />}
				action={{ label: l.board, onClick: onBoard }}
			/>
		);
	const when = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
	const extra = EXTRA_COLUMNS.filter((c) => columns.includes(c));
	const head: Record<ExtraColumn, string> = {
		workflow: l.workflow,
		steps: l.steps,
		ended: l.ended,
		pr: l.pullRequest,
	};
	const cell = (c: ExtraColumn, run: RunItem | undefined): ReactNode => {
		if (!run) return null;
		if (c === "workflow") return nameOf(run.workflow);
		if (c === "steps") {
			const s = stepperOf(run);
			return s.total ? format(f.nOf, { n: s.n, total: s.total }) : "";
		}
		if (c === "ended") {
			const end = endOf(run);
			return end ? <time dateTime={new Date(end).toISOString()}>{when.format(end)}</time> : "–";
		}
		return run.pr ? `#${run.pr.number} ${t.forge.state[run.pr.state as "open"]}` : null;
	};
	// The widths change with the extra columns, so the grid is a style, not a class.
	const grid = {
		gridTemplateColumns: [
			"minmax(12rem, 1fr)",
			"7.5rem",
			"8rem",
			"5rem",
			...extra.map((c) => WIDTH[c]),
			"8rem",
		].join(" "),
	};
	const ROW = "relative grid gap-4";
	return (
		<Card className="overflow-x-auto py-2">
			<div className="min-w-[51rem]">
				{/* The column names are for the eye: each row says its own facts. */}
				<Row
					className={`${ROW} min-h-control text-13 font-semibold text-n-11`}
					render={(row) => <div aria-hidden="true" style={grid} {...row} />}
				>
					<span>{b.feature}</span>
					<span>{b.end}</span>
					<span>{b.who}</span>
					<span className="text-right">{f.cost}</span>
					{extra.map((c) => (
						<span key={c}>{head[c]}</span>
					))}
					<span />
				</Row>
				<ul aria-label={l.history}>
					{rows.map((r) => {
						const who = r.who ? (r.who.agent ? nameOf(r.who.name) : r.who.name) : null;
						return (
							<li key={r.id}>
								<ContextMenu items={r.menu}>
									<Row
										className={`${ROW} border-t border-n-6 hover:bg-n-2`}
										render={(row) => <div style={grid} {...row} />}
									>
										<span className="min-w-0 truncate font-semibold">
											{/* The button covers the row: the whole row opens the feature. */}
											<button
												type="button"
												onClick={r.onOpen}
												className="min-h-control text-left after:absolute after:inset-0"
											>
												{r.title}
												{r.ticket ? <span className="sr-only"> {r.ticket}</span> : null}
											</button>
										</span>
										<span>
											<Badge variant={END_TONE[r.end]}>{f.state[r.end]}</Badge>
										</span>
										<span className="flex min-w-0 items-center gap-2">
											{who ? (
												<>
													<Avatar name={who} size="s" agent={r.who?.agent} />
													<span className="truncate">{who}</span>
												</>
											) : null}
										</span>
										<span className="text-right tabular-nums">
											{r.run?.costUsd == null ? "" : `$${r.run.costUsd.toFixed(2)}`}
										</span>
										{extra.map((c) => (
											<span key={c} className="min-w-0 truncate">
												<span className="sr-only">{head[c]}: </span>
												{cell(c, r.run)}
											</span>
										))}
										<span className="relative z-10 flex justify-end">
											{r.onAgain ? (
												<RightButton right="runs.start" onClick={r.onAgain}>
													{b.again}
													<span className="sr-only"> {r.title}</span>
												</RightButton>
											) : null}
										</span>
									</Row>
								</ContextMenu>
							</li>
						);
					})}
				</ul>
			</div>
		</Card>
	);
}
