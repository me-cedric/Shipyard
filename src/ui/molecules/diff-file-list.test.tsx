import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { renderApp } from "../test-utils";
import { countsOf, DiffFileList } from "./diff-file-list";

const PATCH = "@@ -1,2 +1,2 @@\n a\n-b\n+B\n+C";
const FILES = [
	{ path: "src/a.ts", state: "modified" as const, patch: PATCH },
	{ path: "img.png", state: "added" as const, patch: null },
];

function Demo({ onViewed }: { onViewed?: (p: string, v: boolean) => void }) {
	const [open, setOpen] = useState<Set<string>>(new Set());
	return (
		<DiffFileList
			files={FILES}
			expanded={open}
			onToggle={(p) => setOpen((o) => new Set(o).add(p))}
			viewed={new Set(["img.png"])}
			onViewedChange={onViewed}
		/>
	);
}

describe("DiffFileList", () => {
	it("counts the added and removed lines of a patch", () => {
		expect(countsOf(PATCH)).toEqual({ added: 2, removed: 1 });
	});

	it("starts closed, with a state word, the counts and a Viewed box", () => {
		renderApp(<Demo onViewed={() => {}} />);
		const row = screen.getByRole("button", { name: /src\/a\.ts/ });
		expect(row).toHaveAttribute("aria-expanded", "false");
		expect(row).toHaveTextContent("2 added, 1 removed");
		expect(screen.getByRole("img", { name: "Modified" })).toBeInTheDocument();
		expect(screen.queryByRole("region")).toBeNull();
		expect(screen.getByRole("checkbox", { name: "Viewed img.png" })).toBeChecked();
	});

	it("opens a file on a click and says No preview when the forge sent no patch", async () => {
		const user = userEvent.setup();
		renderApp(<Demo />);
		await user.click(screen.getByRole("button", { name: /src\/a\.ts/ }));
		expect(screen.getByRole("region", { name: "Diff of src/a.ts" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: /img\.png/ }));
		expect(screen.getByText("No preview")).toBeInTheDocument();
	});

	it("reports a Viewed change with the path", async () => {
		const seen = vi.fn();
		renderApp(<Demo onViewed={seen} />);
		await userEvent.click(screen.getByRole("checkbox", { name: "Viewed src/a.ts" }));
		expect(seen).toHaveBeenCalledWith("src/a.ts", true);
	});

	it("shows the comment count on the closed row and a foot under the open diff", async () => {
		const user = userEvent.setup();
		renderApp(
			<DiffFileList
				files={FILES.map((f, i) => ({ ...f, comments: 2 - i }))}
				expanded={new Set(["src/a.ts"])}
				onToggle={() => {}}
				foot={(f) => <p>{`Foot of ${f.path}`}</p>}
			/>,
		);
		expect(screen.getByText("2 comments")).toBeInTheDocument();
		expect(screen.getByText("1 comment")).toBeInTheDocument();
		expect(screen.getByText("Foot of src/a.ts")).toBeInTheDocument();
		expect(screen.queryByText("Foot of img.png")).toBeNull();
		await user.click(screen.getByRole("button", { name: /src\/a\.ts/ }));
	});
});
