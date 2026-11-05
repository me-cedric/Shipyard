import { payloadOf } from "@/features/home/event-sentence";
import { useI18n } from "@/lib/i18n";
import type { RunLogEvent_Serialize } from "@/lib/ipc";
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

/** The plan block of a run that waits for a person. */
export function PlanBlock({ plan }: { plan: Plan }) {
	const { t } = useI18n();
	return (
		<section
			id="plan"
			aria-label={t.factory.plan}
			className="flex flex-col gap-3 rounded-lg border bg-surface-1 p-3"
		>
			<MarkdownView source={plan.summary} label={t.factory.plan} refs={false} />
			{plan.tasks.length ? (
				<ul className="flex list-disc flex-col gap-1 pl-5 text-ui text-n-12">
					{plan.tasks.map((x, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: the tasks never reorder
						<li key={i}>
							<span className="font-medium">{x.title}</span>
							{x.text ? <span className="text-n-11">{` ${x.text}`}</span> : null}
						</li>
					))}
				</ul>
			) : null}
		</section>
	);
}
