import { useI18n } from "@/lib/i18n";
import type { Mark, Stage } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { CheckIcon } from "../icons";
import { ATTENTION_FILL, ATTENTION_GLYPH } from "./attention-card";

const STAGES: Stage[] = ["idea", "spec", "build", "review", "ready"];
// A shape for each mark, so the colour is never the only cue. Blocked is a plain dot: the text says it.
const MARK_SHAPE: Record<Mark, string> = { needs_you: "!", blocked: "", stopped: "■" };

/** The journey of a feature: five stages on one line. Done, current and next differ by shape and by text. */
export function StageLine({ stage, mark }: { stage: Stage; mark?: Mark | null }) {
	const { t } = useI18n();
	const at = STAGES.indexOf(stage);
	return (
		<ol aria-label={t.ui.flow.label} className="flex flex-wrap items-center gap-2.5">
			{STAGES.map((s, i) => {
				const state = i < at ? "done" : i === at ? "current" : "next";
				const last = i === STAGES.length - 1;
				return (
					<li
						key={s}
						aria-current={state === "current" ? "step" : undefined}
						className={cn("flex items-center gap-2.5", !last && "flex-[1_1_auto]")}
					>
						<span
							className={cn(
								"inline-flex items-center gap-2 font-semibold",
								state === "done" && "text-n-12",
								state === "current" && (mark ? ATTENTION_GLYPH : "text-accent-text"),
								state === "next" && "text-n-11",
							)}
						>
							<span
								aria-hidden="true"
								className={cn(
									"flex size-7 shrink-0 items-center justify-center rounded-full",
									state === "done" && "bg-primary text-primary-fg",
									state === "current" &&
										(mark
											? `${ATTENTION_FILL} text-13 text-primary-fg ring-[5px] ring-current/15`
											: "bg-accent ring-[5px] ring-accent-subtle"),
									state === "next" && "border-2 border-n-8 bg-surface-2",
								)}
							>
								{state === "done" ? (
									<CheckIcon size={16} />
								) : state === "current" && mark ? (
									MARK_SHAPE[mark] || null
								) : null}
							</span>
							{t.ui.flow[s]}
							{state === "current" && mark ? `, ${t.ui.flow[mark].toLowerCase()}` : null}
							{state === "next" ? null : <span className="sr-only"> {t.ui.flow[state]}</span>}
						</span>
						{last ? null : (
							<span
								aria-hidden="true"
								className={cn("h-0.5 min-w-6 flex-[1_1_24px]", i < at ? "bg-primary" : "bg-n-8")}
							/>
						)}
					</li>
				);
			})}
		</ol>
	);
}
