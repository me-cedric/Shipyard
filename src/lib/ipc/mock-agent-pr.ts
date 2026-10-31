// The mock of the agent pull request actions (`crates/shipyard-app/src/pr_agent.rs`). A review
// runs once for each head commit, an edited draft posts once, a read-only project refuses the
// three actions, and the agent never opens the pull request it writes the text of.
import type {
	PrText,
	ReviewDraft_Serialize,
	ReviewPost,
	ReviewWait,
	SessionView_Serialize,
} from "./bindings";
import { type MockPrs, pullComment, pullVerdict } from "./mock-code-prs";

const CLICK = "this change needs the click of a person";
const READ_ONLY = "the profile of this project is read only";

export type MockAgentPr = {
	/** The drafts, by `<number>-<head commit>`. */
	reviews: Record<string, ReviewDraft_Serialize>;
	/** How many times the agent ran: one for each head commit. */
	runs: number;
	/** The pull requests that an agent reviews now. The mock ends a review at once: a test sets one. */
	running: number[];
	/** The agents are stopped (the kill switch). */
	stopped: boolean;
};

export const seedAgentPr = (): MockAgentPr => ({
	reviews: {},
	runs: 0,
	running: [],
	stopped: false,
});

const key = (number: number, sha: string) => `${number}-${sha}`;

function guard(click: boolean, readOnly: boolean) {
	if (!click) throw CLICK;
	if (readOnly) throw READ_ONLY;
}

const find = (p: MockPrs, number: number) => {
	const d = p.pulls.find((x) => x.number === number);
	if (!d) throw `no pull request #${number}`;
	return d;
};

export function reviewGet(
	a: MockAgentPr,
	number: number,
	sha: string,
): ReviewDraft_Serialize | null {
	return a.reviews[key(number, sha)] ?? null;
}

/** The drafts that wait for a person: Home / Needs you (REQ-007). */
export function reviewWaiting(a: MockAgentPr, p: MockPrs): ReviewWait[] {
	return Object.values(a.reviews)
		.filter((d) => !d.posted)
		.map((d) => ({
			number: d.number,
			headSha: d.headSha,
			title: d.title,
			reference: find(p, d.number).reference,
		}));
}

/** The running reviews as sessions of Factory / Sessions (REQ-008). */
export function reviewSessions(a: MockAgentPr): SessionView_Serialize[] {
	return a.running.map((number) => ({
		run: `review${number}`,
		key: `#${number}`,
		step: "review",
		runner: "claude",
		model: "opus",
		state: "running",
		tokens: 0,
		costUsd: 0,
		pull: number,
	}));
}

/** Stops the running review of a pull request. Nothing runs: nothing happens. */
export function reviewStop(a: MockAgentPr, number: number): null {
	a.running = a.running.filter((n) => n !== number);
	return null;
}

export function reviewStart(
	a: MockAgentPr,
	p: MockPrs,
	number: number,
	click: boolean,
	readOnly: boolean,
): ReviewDraft_Serialize {
	guard(click, readOnly);
	const d = find(p, number);
	if (d.state !== "open") throw "the pull request is not open";
	const old = a.reviews[key(number, d.headSha)];
	if (old) return old;
	if (a.stopped) throw "the agents are stopped: switch them on first";
	a.runs += 1;
	const file = d.files[0];
	const draft: ReviewDraft_Serialize = {
		number,
		title: d.title,
		headSha: d.headSha,
		summary: `The change in ${d.title} is small. One line needs a second look.`,
		verdict: "comment",
		findings: file
			? [
					{ severity: "P1", path: file.path, line: 3, text: "This line has no test." },
					{ severity: "P2", path: file.path, line: 1, text: "Rename this variable." },
				]
			: [],
		dropped: 0,
		posted: false,
		auto: false,
	};
	a.reviews[key(number, d.headSha)] = draft;
	return draft;
}

export function reviewPost(
	a: MockAgentPr,
	p: MockPrs,
	post: ReviewPost,
	click: boolean,
	readOnly: boolean,
): null {
	guard(click, readOnly);
	const draft = a.reviews[key(post.number, post.headSha)];
	if (!draft) throw "no draft review";
	if (draft.posted) throw "the review is posted already";
	const lines = post.findings.map((f) => `- ${f.severity} \`${f.path}:${f.line}\` ${f.text}`);
	const body = [post.summary.trim(), lines.join("\n")].filter(Boolean).join("\n\n");
	if (!body) throw "the review is empty";
	if (post.verdict === "comment") pullComment(p, post.number, body, true);
	else
		pullVerdict(
			p,
			post.number,
			post.verdict === "approve" ? "approve" : "request-changes",
			body,
			true,
		);
	Object.assign(draft, {
		summary: post.summary,
		verdict: post.verdict,
		findings: post.findings,
		posted: true,
	});
	return null;
}

export function prWrite(click: boolean, readOnly: boolean, base: string | null): PrText {
	guard(click, readOnly);
	return {
		title: "feat(code): list the pull requests",
		body: `Shows the pull requests of the project.\n\nBase: ${base ?? "main"}\n\nRefs: wi:SHIP-43`,
	};
}
