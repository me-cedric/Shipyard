import { type StopAction, stopAction } from "@/features/flow/stop-action";
import type { FlowFeature_Serialize, Mark, RunView_Serialize } from "@/lib/ipc/bindings";

/** The fields of a run that the answer reads and its action needs. */
export type AnswerRun = Pick<RunView_Serialize, "id" | "key" | "state">;

/** The match words of each mark: comma separated, from the i18n keys of the language. */
export type AnswerWords = { blocked: string; stopped: string; needs: string };

export type Answer = {
	mark: Mark;
	/**
	 * Each feature of the mark, with the ref that its one action opens. `run` and `action` are set when the
	 * run of the feature is known and stopped: the action then is the main action of that stop state.
	 */
	features: { title: string; ref: string | null; run?: AnswerRun; action?: StopAction }[];
}[];

const MARK_OF: Record<keyof AnswerWords, Mark> = {
	blocked: "blocked",
	stopped: "stopped",
	needs: "needs_you",
};

/** The ref that the open action shows: the run first, then the pull request, the change, the ticket. */
const refOf = (f: FlowFeature_Serialize) => f.run ?? f.pr ?? f.change ?? f.ticket ?? null;

/**
 * Answers a question about what blocks, what stopped or what needs the person. Returns `null` when
 * the text names none of the marks: the text then goes to the full assistant. Each marked feature
 * gets one action: the main action of its stop state when `runs` holds its run, else the one that opens it.
 * adr:0023 spec:app-redesign#REQ-005
 */
export function answerOf(
	text: string,
	features: FlowFeature_Serialize[],
	words: AnswerWords,
	runs: AnswerRun[] = [],
): Answer | null {
	// A match word is the start of a word of the text: "stop" finds "stopped", not "desktop".
	const tokens = text.toLowerCase().split(/[^\p{L}]+/u);
	const marks = (Object.keys(MARK_OF) as (keyof AnswerWords)[])
		.filter((k) =>
			words[k]
				.split(",")
				.map((w) => w.trim().toLowerCase())
				.some((w) => w !== "" && tokens.some((tok) => tok.startsWith(w))),
		)
		.map((k) => MARK_OF[k]);
	if (marks.length === 0) return null;
	return marks.map((mark) => ({
		mark,
		features: features
			.filter((f) => f.mark === mark)
			.map((f) => {
				const run = runs.find((r) => `run:${r.id}` === f.run);
				const action = run ? stopAction(f) : null;
				return { title: f.title, ref: refOf(f), ...(run && action ? { run, action } : {}) };
			}),
	}));
}
