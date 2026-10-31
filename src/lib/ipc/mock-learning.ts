// The mock of Knowledge / Learn (`crates/shipyard-app/src/learning.rs`, `shipyard-store/src/learning.rs`):
// feeds, learning paths and the progress of each person. A feed address is https; an address
// with `broken` gives a feed error and an empty copy.
import { classify } from "@/lib/i18n/errors";
import type {
	FeedRead_Serialize,
	Learning_Serialize,
	LearningPath_Deserialize,
	LearningPath_Serialize,
} from "./bindings";

export type MockLearning = { data: Learning_Serialize };

export function seedLearning(): MockLearning {
	return {
		data: {
			feeds: ["https://blog.example.com/feed.xml"],
			paths: [
				{
					id: "onboarding",
					title: "Onboarding",
					experts: ["ada"],
					steps: [
						{
							id: "read-the-handbook",
							kind: "reading",
							title: "Read the handbook",
							url: null,
						},
						{
							id: "rust-course",
							kind: "course",
							title: "Rust course",
							url: "https://doc.rust-lang.org/book/",
						},
						{
							id: "cloud-certification",
							kind: "certification",
							title: "Cloud certification",
							url: "https://learn.example.com/exam",
						},
					],
				},
			],
			progress: { ada: ["onboarding/read-the-handbook", "onboarding/rust-course"] },
		},
	};
}

const click = (ok: boolean) => {
	if (!ok) throw "this change needs the click of a person";
};

export const slug = (text: string) =>
	text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

function checkAddress(url: string) {
	if (!/^https:\/\/[^/\s@?#]+/.test(url) || /\s/.test(url)) throw `bad address: ${url}`;
}

function checkTitle(title: string) {
	const t = title.trim();
	if (!slug(t) || t.length > 200)
		throw "the title needs a letter or a digit and at most 200 characters";
	return t;
}

const copy = (m: MockLearning): Learning_Serialize => structuredClone(m.data);

export const learningGet = copy;

export function feedAdd(m: MockLearning, url: string, ok: boolean) {
	click(ok);
	const u = url.trim();
	checkAddress(u);
	if (!m.data.feeds.includes(u)) m.data.feeds.push(u);
	return copy(m);
}

export function feedRemove(m: MockLearning, url: string, ok: boolean) {
	click(ok);
	m.data.feeds = m.data.feeds.filter((f) => f !== url);
	return copy(m);
}

export function feedsRead(m: MockLearning): FeedRead_Serialize[] {
	return m.data.feeds.map((url) => {
		if (url.includes("broken")) {
			const details = "this address does not hold an RSS or Atom feed";
			return {
				url,
				feed: { title: "", items: [] },
				fetched: null,
				error: { ...classify(details), details },
			};
		}
		const host = new URL(url).host;
		return {
			url,
			feed: {
				title: `News of ${host}`,
				items: [
					{
						title: "Release notes 2.0",
						link: `https://${host}/release-2`,
						published: "Thu, 29 Oct 2026 09:00:00 GMT",
						summary: "What changed in the second major version.",
					},
					{
						title: "A guide to the new API",
						link: `https://${host}/api-guide`,
						published: "Mon, 26 Oct 2026 09:00:00 GMT",
						summary: "Step by step, from the first call to production.",
					},
				],
			},
			fetched: 1_793_300_000,
			error: null,
		};
	});
}

export function pathSave(m: MockLearning, path: LearningPath_Deserialize, ok: boolean) {
	click(ok);
	const title = checkTitle(path.title);
	const id = path.id || slug(title);
	const seen = new Set<string>();
	const steps = (path.steps ?? []).map((s) => {
		const stepTitle = checkTitle(s.title);
		const stepId = s.id || slug(stepTitle);
		if (seen.has(stepId)) throw `bad or repeated step id: ${stepId}`;
		seen.add(stepId);
		const url = s.url?.trim() || null;
		if (url) checkAddress(url);
		return { id: stepId, kind: s.kind, title: stepTitle, url };
	});
	const next: LearningPath_Serialize = {
		id,
		title,
		experts: [...new Set((path.experts ?? []).filter((e) => e.trim()))],
		steps,
	};
	const at = m.data.paths.findIndex((p) => p.id === id);
	if (at >= 0) m.data.paths[at] = next;
	else m.data.paths.push(next);
	return copy(m);
}

export function pathDelete(m: MockLearning, id: string, ok: boolean) {
	click(ok);
	m.data.paths = m.data.paths.filter((p) => p.id !== id);
	for (const [who, done] of Object.entries(m.data.progress)) {
		const left = (done ?? []).filter((k) => !k.startsWith(`${id}/`));
		if (left.length) m.data.progress[who] = left;
		else delete m.data.progress[who];
	}
	return copy(m);
}

export function progressSet(
	m: MockLearning,
	person: string,
	step: string,
	done: boolean,
	ok: boolean,
) {
	click(ok);
	if (!person.trim()) throw "a person is needed";
	const known = m.data.paths.some((p) => p.steps.some((s) => `${p.id}/${s.id}` === step));
	if (!known) throw `unknown step: ${step}`;
	const list = (m.data.progress[person] ?? []).filter((k) => k !== step);
	if (done) list.push(step);
	list.sort();
	if (list.length) m.data.progress[person] = list;
	else delete m.data.progress[person];
	return copy(m);
}
