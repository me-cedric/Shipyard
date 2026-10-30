import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { colour } from "@/ui/organisms/file-viewer";
import { renderApp } from "@/ui/test-utils";
import { FileDialog } from "./viewer";

const file = vi.hoisted(() => ({
	value: {
		data: {
			path: "src/lib.rs",
			size: 30,
			binary: false,
			truncated: false,
			text: Array.from({ length: 50 }, (_, i) => `// line ${i + 1}`).join("\n"),
		},
		error: null as Error | null,
	},
}));
vi.mock("./use-file", () => ({ useFile: () => file.value }));

describe("File viewer", () => {
	it("colours a comment, a string, a number and a keyword", () => {
		expect(colour('const a = "x"; // c 4')).toEqual([
			{ text: "const", tone: "text-accent-text" },
			{ text: " a = ", tone: "" },
			{ text: '"x"', tone: "text-success-text" },
			{ text: "; ", tone: "" },
			{ text: "// c 4", tone: "text-n-10" },
		]);
	});

	it("opens at a line with line numbers and marks it", async () => {
		renderApp(<FileDialog path="src/lib.rs" line={40} onClose={() => {}} />);
		const region = await screen.findByRole("region", { name: "File src/lib.rs" });
		expect(region).toHaveTextContent("50");
		expect(region.querySelector("[data-marked]")).toHaveTextContent("// line 40");
		expect(screen.getByRole("dialog")).toHaveTextContent("Line 40");
	});

	it("shows only the size of a binary file", async () => {
		file.value = { data: { ...file.value.data, binary: true, text: "" }, error: null };
		renderApp(<FileDialog path="logo.png" onClose={() => {}} />);
		expect(await screen.findByText("Binary file, 30 bytes")).toBeInTheDocument();
		expect(screen.queryByRole("region", { name: "File logo.png" })).toBeNull();
	});

	it("shows the reason when the read fails", async () => {
		file.value = { data: undefined as never, error: new Error("not a file of the project") };
		renderApp(<FileDialog path="../x" onClose={() => {}} />);
		expect(await screen.findByRole("alert")).toHaveTextContent("not a file of the project");
	});

	it("shows the commit and the author of each line when the person asks for the blame", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await unwrap(commands.codeStatus());
		file.value = {
			data: { ...file.value.data, binary: false, text: "a\nb\n" },
			error: null,
		};
		renderApp(<FileDialog path="src/app.ts" onClose={() => {}} />);
		expect(screen.queryByRole("list", { name: "Blame" })).toBeNull();
		await userEvent.click(await screen.findByRole("button", { name: "Blame" }));
		const list = await screen.findByRole("list", { name: "Blame" });
		expect(within(list).getAllByText("Ada Lovelace").length).toBeGreaterThan(0);
	});
});
