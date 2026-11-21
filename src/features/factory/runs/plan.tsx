import { payloadOf } from "@/features/home/event-sentence";
import { format, useI18n } from "@/lib/i18n";
import type { RunLogEvent_Serialize } from "@/lib/ipc";
import { IconButton } from "@/ui/atoms/icon-button";
import { MarkdownView } from "@/ui/organisms/markdown-view";

export type Plan = { summary: string; tasks: { title: string; text: string }[] };

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** The plan of a run: the latest `report` of the log. The task fields are the agent's: title or name, then goal, description or summary. */
export function planOf(events: RunLogEvent_Serialize[]): Plan | null {
	for (const e of events.toReversed()) {
		const p = payloadOf(e.payload);
		if (e.kind !== "tool" || p.tool !== "report") continue;
		const raw = (p.output as { tasks?: unknown } | undefined)?.tasks;
		const tasks = (Array.isArray(raw) ? raw : []).map((x: unknown) => {
			if (typeof x === "string") return { title: x, text: "" };
			const o = (x ?? {}) as Record<string, unknown>;
			return {
				title: str(o.title) || str(o.name) || str(o.id),
				text: str(o.goal) || str(o.description) || str(o.summary) || str(o.text),
			};
		});
		return { summary: str(p.summary), tasks: tasks.filter((x) => x.title || x.text) };
	}
	return null;
}

/** The plain pencil of picture 024 (the shared PencilIcon has a square round it). */
const PlainPencil = () => (
	<svg
		aria-hidden="true"
		viewBox="0 0 24 24"
		className="size-4"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.75"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
	</svg>
);

/** The plan of a run that waits for a person (picture 024): what it is for, then one numbered row for each step. */
export function PlanBlock({
	plan,
	onEdit,
}: {
	plan: Plan;
	/** The plan in review: a pencil on each step asks for a change of it, and the card shows no summary line. */
	onEdit?: (n: number) => void;
}) {
	const { t } = useI18n();
	return (
		<section
			id="plan"
			tabIndex={-1}
			aria-label={t.factory.plan}
			className="flex flex-col gap-2.5 rounded-md focus-visible:shadow-glow focus-visible:outline-none"
		>
			{/* With steps, the first paragraph says what the plan is for; the rows say the rest. */}
			{plan.summary ? (
				// In review the card shows the steps only (picture 024): the summary stays for a screen reader.
				<div className={onEdit && plan.tasks.length ? "sr-only" : undefined}>
					<MarkdownView
						source={
							plan.tasks.length ? (plan.summary.trim().split(/\n\s*\n/)[0] ?? "") : plan.summary
						}
						label={t.factory.plan}
						refs={false}
					/>
				</div>
			) : null}
			{plan.tasks.length ? (
				<ol className="flex flex-col gap-2.5">
					{plan.tasks.map((x, i) => (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: the tasks never reorder
							key={i}
							className="flex items-center gap-3.5 rounded-lg bg-surface-0 px-4 py-4 text-17 text-n-12"
						>
							<span
								aria-hidden="true"
								className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-15 font-semibold"
							>
								{i + 1}
							</span>
							<span className="min-w-0 flex-1">
								<span className={onEdit ? undefined : "font-semibold"}>{x.title}</span>
								{x.text ? ` ${x.text}` : null}
							</span>
							{onEdit ? (
								<IconButton
									variant="outline"
									label={format(t.flow.look.page.plan.editStep, { n: i + 1 })}
									onClick={() => onEdit(i + 1)}
								>
									<PlainPencil />
								</IconButton>
							) : null}
						</li>
					))}
				</ol>
			) : null}
		</section>
	);
}
