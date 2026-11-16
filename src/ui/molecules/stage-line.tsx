import { useI18n } from "@/lib/i18n";
import type { Mark, Stage } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const STAGES: Stage[] = ["idea", "spec", "build", "review", "ready"];
// A shape for each mark, so the colour is never the only cue.
const MARK_SHAPE: Record<Mark, string> = { needs_you: "!", blocked: "×", stopped: "■" };

/** The five stages of a feature. Done, current and next differ by shape and by text. */
export function StageLine({ stage, mark }: { stage: Stage; mark?: Mark | null }) {
	const { t } = useI18n();
	const at = STAGES.indexOf(stage);
	return (
		<ol aria-label={t.ui.flow.label} className="flex flex-wrap items-center gap-x-4 gap-y-2">
			{STAGES.map((s, i) => {
				const state = i < at ? "done" : i === at ? "current" : "next";
				return (
					<li
						key={s}
						aria-current={state === "current" ? "step" : undefined}
						className={cn(
							"flex items-center gap-2 text-14",
							state === "next" ? "text-n-10" : "text-n-12",
							state === "current" && "font-semibold",
						)}
					>
						<span
							aria-hidden="true"
							className={cn(
								"flex size-6 items-center justify-center rounded-full text-12",
								state === "done" && "bg-n-12 text-n-1",
								state === "current" && "bg-accent text-accent-fg ring-4 ring-accent-soft",
								state === "next" && "border-2 border-n-8",
							)}
						>
							{state === "done" ? "✓" : state === "current" ? "●" : ""}
						</span>
						{t.ui.flow[s]}
						{state === "next" ? null : <span className="sr-only"> {t.ui.flow[state]}</span>}
						{state === "current" && mark ? (
							<span className="ml-1 inline-flex items-center gap-1 rounded-full border border-n-8 px-2 text-12">
								<span aria-hidden="true">{MARK_SHAPE[mark]}</span>
								{t.ui.flow[mark]}
							</span>
						) : null}
					</li>
				);
			})}
		</ol>
	);
}
