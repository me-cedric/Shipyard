import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState, resetMock } from "@/lib/ipc/mock";
import { ShellProvider, useShell } from "@/lib/shell";
import { renderApp } from "@/ui/test-utils";
import { askKeys, askPrompt, useAsk } from "./ask";
import { MENU } from "./index";
import { useRename } from "./rename";

const OLD = "docs/handbook/old.md";

function Host({ onDone }: { onDone: (ref: string, path: string) => void }) {
	const rename = useRename();
	return (
		<>
			<button type="button" onClick={() => rename.start(OLD, onDone)}>
				open
			</button>
			{rename.dialog}
		</>
	);
}

describe("Rename with links", () => {
	beforeEach(() => {
		resetMock();
		const files = mockState().knowledge.files as Record<string, unknown>;
		files[OLD] = { text: "# Old\n" };
		files["docs/handbook/index.md"] = { text: "Intro\nSee docs/handbook/old.md here\n" };
	});

	it("locks the extension, lists the line changes, then moves the file and the links", async () => {
		const user = userEvent.setup();
		const done = vi.fn();
		renderApp(<Host onDone={done} />);
		await user.click(screen.getByRole("button", { name: "open" }));
		expect(screen.getByText(".md")).toBeInTheDocument();
		const name = screen.getByRole("textbox", { name: "Name" });
		expect(name).toHaveValue("old");
		await user.clear(name);
		await user.type(name, "fresh");
		await user.click(screen.getByRole("button", { name: "Review" }));
		const file = await screen.findByRole("region", { name: "docs/handbook/index.md" });
		expect(file).toHaveTextContent("2 - See docs/handbook/old.md here");
		expect(file).toHaveTextContent("2 + See docs/handbook/fresh.md here");
		// Nothing moved before the apply.
		expect(mockState().knowledge.files[OLD]).toBeDefined();
		await user.click(screen.getByRole("button", { name: "Rename" }));
		await waitFor(() =>
			expect(done).toHaveBeenCalledWith("doc:docs/handbook/fresh.md", "docs/handbook/fresh.md"),
		);
		const files = mockState().knowledge.files as Record<string, { text: string }>;
		expect(files[OLD]).toBeUndefined();
		expect(files["docs/handbook/fresh.md"]).toBeDefined();
		expect(files["docs/handbook/index.md"]?.text).toContain("docs/handbook/fresh.md");
	});

	it("keeps the Review button off until the name is new", async () => {
		const user = userEvent.setup();
		renderApp(<Host onDone={vi.fn()} />);
		await user.click(screen.getByRole("button", { name: "open" }));
		expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();
	});

	it("shows the refusal of the command and keeps the dialog open", async () => {
		const user = userEvent.setup();
		const done = vi.fn();
		const files = mockState().knowledge.files as Record<string, unknown>;
		files["docs/handbook/taken.md"] = { text: "x" };
		renderApp(<Host onDone={done} />);
		await user.click(screen.getByRole("button", { name: "open" }));
		const name = screen.getByRole("textbox", { name: "Name" });
		await user.clear(name);
		await user.type(name, "taken");
		await user.click(screen.getByRole("button", { name: "Review" }));
		await user.click(await screen.findByRole("button", { name: "Rename" }));
		expect(await screen.findByRole("alert")).toBeInTheDocument();
		expect(done).not.toHaveBeenCalled();
		expect(files[OLD]).toBeDefined();
	});

	it("refuses to apply when the links changed after the review", async () => {
		const user = userEvent.setup();
		const done = vi.fn();
		const files = mockState().knowledge.files as Record<string, unknown>;
		renderApp(<Host onDone={done} />);
		await user.click(screen.getByRole("button", { name: "open" }));
		const name = screen.getByRole("textbox", { name: "Name" });
		await user.clear(name);
		await user.type(name, "fresh");
		await user.click(screen.getByRole("button", { name: "Review" }));
		await screen.findByRole("region", { name: "docs/handbook/index.md" });
		files["docs/handbook/late.md"] = { text: "Also docs/handbook/old.md\n" };
		await user.click(screen.getByRole("button", { name: "Rename" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("The files changed");
		expect(
			await screen.findByRole("region", { name: "docs/handbook/late.md" }),
		).toBeInTheDocument();
		expect(done).not.toHaveBeenCalled();
		expect(files[OLD]).toBeDefined();
	});
});

describe("Item menu entries", () => {
	it("puts Rename before Delete on a file-backed item", () => {
		for (const kind of ["ref", "adr"] as const)
			expect(MENU[kind].indexOf("rename")).toBe(MENU[kind].indexOf("delete") - 1);
	});

	it("fits the prompts to the kind of item and the role", () => {
		expect(askKeys("adr:0007", "pm")[0]).toBe("summary");
		expect(askKeys("adr:0007", "developer")[0]).toBe("impact");
		expect(askKeys("spec:billing#REQ-001", "qa")[0]).toBe("tests");
		expect(askKeys("diagram:flow", "qa")).toEqual(["explain", "impact", "risks"]);
	});

	it("adds the ref, the file, the spec, the ticket and the backlinks to the prompt", () => {
		const groups = [
			{ kind: "spec", count: 1, items: [{ source: "spec:billing", title: null }] },
			{ kind: "wi", count: 1, items: [{ source: "wi:PROJ-5", title: null }] },
		];
		const text = askPrompt("en", "impact", "adr:0007", "docs/decisions/0007-x.md", groups);
		expect(text).toContain("What does a change to this decision impact?");
		expect(text).toContain("Item: adr:0007");
		expect(text).toContain("File: docs/decisions/0007-x.md");
		expect(text).toContain("Spec: spec:billing");
		expect(text).toContain("Ticket: wi:PROJ-5");
		expect(text).toContain("Linked from: spec:billing, wi:PROJ-5");
	});
});

function AskHost() {
	const items = useAsk()("adr:0007", "docs/decisions/0007-x.md");
	return (
		<>
			{items.map((i) => (
				<button key={i.id} type="button" onClick={i.onSelect}>
					{i.label}
				</button>
			))}
			<output aria-label="draft">{useShell().prefill}</output>
		</>
	);
}

describe("Ask the assistant", () => {
	it("fills the message box and does not send", async () => {
		resetMock();
		const user = userEvent.setup();
		renderApp(
			<ShellProvider>
				<AskHost />
			</ShellProvider>,
		);
		await user.click(await screen.findByRole("button", { name: "Summarise this decision" }));
		const draft = await screen.findByLabelText("draft");
		await waitFor(() => expect(draft).toHaveTextContent("Summarise this decision in plain words"));
		expect(draft).toHaveTextContent("Item: adr:0007");
	});
});
