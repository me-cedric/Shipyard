import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { setHitQuery } from "@/lib/refs";
import { renderApp } from "../test-utils";
import { blocks, MarkdownView } from "./markdown-view";

vi.mock("./mermaid-view", () => ({
	MermaidView: ({ source, label }: { source: string; label: string }) => (
		<div role="img" aria-label={label}>
			{source}
		</div>
	),
}));

const TABLE = "| Name | Size |\n| --- | :-: |\n| a | 1 |\n| b | 2 |\n\nafter";

describe("MarkdownView: tables, links and mermaid", () => {
	it("reads a table with its header, its rows and the text after it", () => {
		expect(blocks(TABLE)).toEqual([
			{
				type: "table",
				head: ["Name", "Size"],
				rows: [
					["a", "1"],
					["b", "2"],
				],
				sep: true,
			},
			{ type: "p", text: "after" },
		]);
		expect(blocks("```mermaid\ngraph TD\n```")[0]).toMatchObject({ type: "code", lang: "mermaid" });
	});

	it("renders the table, a mermaid picture and a plain code block", () => {
		renderApp(
			<MarkdownView
				label="Doc"
				source={`${TABLE}\n\n\`\`\`mermaid\ngraph TD\n\`\`\`\n\n\`\`\`ts\nlet x\n\`\`\``}
			/>,
		);
		expect(screen.getByRole("columnheader", { name: "Size" })).toBeInTheDocument();
		expect(screen.getAllByRole("row")).toHaveLength(3);
		expect(screen.getByRole("img", { name: "Diagram" })).toHaveTextContent("graph TD");
		expect(document.querySelector("pre code")).toHaveTextContent("let x");
	});

	it("opens a link outside the window and ignores an address that is not http", async () => {
		renderApp(
			<MarkdownView
				label="Doc"
				source="See [the docs](https://example.com/a?b=1) and [bad](javascript:x)."
			/>,
		);
		const link = screen.getByRole("link", { name: "the docs" });
		await userEvent.click(link);
		expect(mockState().openedPages).toEqual(["https://example.com/a?b=1"]);
		expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
	});
});

describe("MarkdownView: hits of a search", () => {
	class FakeHighlight {
		ranges: Range[];
		constructor(...ranges: Range[]) {
			this.ranges = ranges;
		}
	}
	const set = new Map<string, FakeHighlight>();
	afterEach(() => {
		setHitQuery("");
		set.clear();
		vi.unstubAllGlobals();
	});

	it("marks the words with no case and no accents, in a reading view only", () => {
		vi.stubGlobal("CSS", { highlights: set });
		vi.stubGlobal("Highlight", FakeHighlight);
		setHitQuery("DECISION");
		const { unmount } = renderApp(
			<MarkdownView label="Doc" source="La Décision est prise." reading />,
		);
		const ranges = set.get("search-hit")?.ranges ?? [];
		expect(ranges.map((r) => r.toString())).toEqual(["Décision"]);
		unmount();
		expect(set.has("search-hit")).toBe(false);
		renderApp(<MarkdownView label="Other" source="La Décision est prise." />);
		expect(set.has("search-hit")).toBe(false);
	});

	it("shows the plain text where the highlight API is missing", () => {
		setHitQuery("decision");
		renderApp(<MarkdownView label="Doc" source="La Décision" reading />);
		expect(screen.getByText("La Décision")).toBeInTheDocument();
	});
});

const ISSUE = [
	"**Gate failed:**",
	"",
	"| Tool | Severity | Rule | Path | Line |",
	"| --- | --- | --- | --- | --- |",
	"| semgrep | high | javascript.lang.security.audit.detect-child-process | crates/shipyard-app/src/qa.rs | 40 |",
	"| osv | low | GHSA-xxxx | pnpm-lock.yaml | 1 |",
	"",
	"> Fix it with `pnpm lint`.",
	"",
	"```ts",
	"const a = 1;",
	"```",
].join("\r\n");

describe("MarkdownView: readable issue bodies", () => {
	it("shows bold, inline code and quotes with no raw marks, even with CRLF lines", () => {
		renderApp(<MarkdownView label="Issue" source={ISSUE} />);
		const strong = screen.getByText("Gate failed:");
		expect(strong.tagName).toBe("STRONG");
		expect(screen.getByRole("article")).not.toHaveTextContent("*");
		expect(screen.getByText("pnpm lint").tagName).toBe("CODE");
		expect(screen.getByText(/Fix it with/).tagName).toBe("BLOCKQUOTE");
	});

	it("keeps short cells on one line and wraps long cells at words, in a scroll box", () => {
		renderApp(<MarkdownView label="Issue" source={ISSUE} />);
		expect(screen.getByRole("columnheader", { name: "Severity" })).toHaveClass("whitespace-nowrap");
		const long = screen.getByRole("cell", { name: /detect-child-process/ });
		expect(long).toHaveClass("break-words");
		expect(long).not.toHaveClass("break-all");
		expect(screen.getByRole("table").parentElement).toHaveClass("overflow-x-auto");
		expect(screen.getAllByRole("row")).toHaveLength(3);
	});

	it("colours a fenced block by its language and leaves an unknown language plain", () => {
		renderApp(<MarkdownView label="Issue" source={`${ISSUE}\n\n\`\`\`text\nconst b\n\`\`\``} />);
		expect(screen.getByText("const")).toHaveClass("text-accent-text");
		expect(screen.getByText(/^const b$/)).not.toHaveClass("text-accent-text");
	});
});
