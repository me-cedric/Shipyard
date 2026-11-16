import type { FlowFeature_Serialize, Mark } from "@/lib/ipc/bindings";

/** The match words of each mark: comma separated, from the i18n keys of the language. */
export type AnswerWords = { blocked: string; stopped: string; needs: string };

export type Answer = {
	mark: Mark;
	/** Each feature of the mark, with the ref that its one action opens. */
	features: { title: string; ref: string | null }[];
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
 * gets one action, which opens it. No hook of Today exists yet for the run of a stopped feature.
 * adr:0023 spec:app-redesign#REQ-005
 */
export function answerOf(
	text: string,
	features: FlowFeature_Serialize[],
	words: AnswerWords,
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
			.map((f) => ({ title: f.title, ref: refOf(f) })),
	}));
}
