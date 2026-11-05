// The vite config aliases node:fs to a browser stub, so the test takes the real module from process.
const { readdirSync, readFileSync } = (
	globalThis as unknown as {
		process: {
			getBuiltinModule: (id: string) => {
				readdirSync: (path: string) => string[];
				readFileSync: (path: string, encoding: "utf8") => string;
			};
		};
	}
).process.getBuiltinModule("node:fs");

// The checks of the slide-deck skill (`docs/agent-compass/skills/slide-deck/SKILL.md`) on each deck
// of the repository. The web job of CI has no submodule, so the template of the skill is not read.
const NETWORK =
	/(src|href)=["']?(https?:)?\/\/|url\(["']?(https?:)?\/\/|@import|<link[^>]+stylesheet/;
const BLOCKED =
	/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie|alert|confirm|prompt|window\.open)\b/;
const NEEDED = [
	"<title>",
	"prefers-reduced-motion: reduce",
	"@media print",
	"@page",
	'class="slide active"',
	"deckKey",
];

const decks = readdirSync("docs/slides")
	.filter((f) => f.endsWith(".html"))
	.map((f) => `docs/slides/${f}`);

describe("the slide-deck checks", () => {
	it("the repository has a sample deck", () => {
		expect(decks.length).toBeGreaterThan(0);
	});

	it.each(decks)("%s fetches nothing, stores nothing and keeps motion, print and keys", (path) => {
		const text = readFileSync(path, "utf8");
		expect(text).not.toMatch(NETWORK);
		expect(text).not.toMatch(BLOCKED);
		for (const needed of NEEDED) expect(text).toContain(needed);
	});
});
