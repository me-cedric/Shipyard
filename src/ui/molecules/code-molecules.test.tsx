import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test-utils";
import { CommitRow } from "./commit-row";
import { ConflictBlock } from "./conflict-block";
import { DiffView, parseDiff } from "./diff-view";
import { FileRow } from "./file-row";

const DIFF = "diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n";

describe("DiffView", () => {
	it("drops the file headers and marks each changed line with a sign", () => {
		expect(parseDiff(DIFF).map((l) => l.kind)).toEqual(["hunk", "ctx", "del", "add", "ctx"]);
		renderApp(
			<DiffView text={DIFF} label="Diff of a" binaryLabel="Binary file" truncatedLabel="Cut" />,
		);
		const region = screen.getByRole("region", { name: "Diff of a" });
		expect(region.querySelector("[data-kind=add]")).toHaveTextContent("+B");
		expect(region.querySelector("[data-kind=del]")).toHaveTextContent("−b");
		expect(region).not.toHaveTextContent("diff --git");
	});

	it("says when a file is binary or the diff was cut", () => {
		renderApp(
			<DiffView
				text=""
				binary
				truncated
				label="x"
				binaryLabel="Binary file"
				truncatedLabel="Cut"
			/>,
		);
		expect(screen.getByText("Binary file")).toBeInTheDocument();
		expect(screen.getByText("Cut")).toBeInTheDocument();
	});
});

describe("FileRow", () => {
	it("shows a lettered mark with a name, selects on click and checks apart", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();
		const onChange = vi.fn();
		renderApp(
			<FileRow
				name="app.ts"
				state="modified"
				stateLabel="Modified"
				onSelect={onSelect}
				check={{ checked: false, label: "Select app.ts", onChange }}
			/>,
		);
		expect(screen.getByRole("img", { name: "Modified" })).toHaveTextContent("M");
		await user.click(screen.getByRole("button", { name: "app.ts" }));
		expect(onSelect).toHaveBeenCalledOnce();
		await user.click(screen.getByRole("checkbox", { name: "Select app.ts" }));
		expect(onChange).toHaveBeenCalledWith(true);
		expect(onSelect).toHaveBeenCalledOnce();
	});

	it("shows a folder with no mark", () => {
		renderApp(<FileRow name="src" />);
		expect(screen.queryByRole("img")).toBeNull();
	});
});

describe("CommitRow", () => {
	it("shows the summary, the labels, the author and selects on click", async () => {
		const onSelect = vi.fn();
		renderApp(
			<CommitRow
				short="1a2b3c4"
				summary="fix: x"
				author="Ada"
				date="today"
				labels={[{ name: "main", kind: "branch" }]}
				onSelect={onSelect}
			/>,
		);
		const row = screen.getByRole("button");
		expect(row).toHaveTextContent("1a2b3c4");
		expect(row).toHaveTextContent("main");
		await userEvent.click(row);
		expect(onSelect).toHaveBeenCalledOnce();
	});
});

describe("ConflictBlock", () => {
	it("offers four choices and marks the chosen one", async () => {
		const onChoose = vi.fn();
		const labels = { ours: "Ours", theirs: "Theirs", both: "Both", neither: "None" };
		renderApp(
			<ConflictBlock
				title="Block 1"
				ours="a"
				theirs="b"
				choice="both"
				onChoose={onChoose}
				labels={labels}
			/>,
		);
		expect(screen.getAllByRole("button")).toHaveLength(4);
		expect(screen.getByRole("button", { name: "Both" })).toHaveAttribute("aria-pressed", "true");
		await userEvent.click(screen.getByRole("button", { name: "None" }));
		expect(onChoose).toHaveBeenCalledWith("neither");
	});
});
