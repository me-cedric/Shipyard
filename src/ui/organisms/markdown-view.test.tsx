import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
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
		expect(screen.getByText("let x")).toBeInTheDocument();
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
