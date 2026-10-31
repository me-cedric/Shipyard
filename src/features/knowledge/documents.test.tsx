import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { Documents } from "./documents";
import { inspector, mountKnowledge, mountView } from "./harness";

describe("Knowledge / Documents", () => {
	it("lists the documents and opens one in the same editor, with its entity in the inspector", async () => {
		const user = userEvent.setup();
		await mountKnowledge("documents");
		await user.click(await screen.findByRole("button", { name: "Client brief" }));
		expect(await screen.findByRole("textbox", { name: "Markdown" })).toHaveValue(
			"# Client brief\n\nThe scope follows spec:billing and adr:0004.\n",
		);
		await waitFor(async () =>
			expect(await inspector()).toHaveTextContent("doc:docs/documents/client-brief.md"),
		);
	});

	it("exports the dossier, the functional documentation and the sheet on demand", async () => {
		const user = userEvent.setup();
		await mountKnowledge("documents");
		const exported = () => mockState().knowledge.exported.map((e) => e.kind);
		await user.click(await screen.findByRole("button", { name: "Export Architecture dossier" }));
		await waitFor(() => expect(exported()).toEqual(["dossier"]));
		await user.click(screen.getByRole("button", { name: "Export Functional documentation" }));
		await waitFor(() => expect(exported()).toEqual(["dossier", "functional"]));
		await user.click(screen.getByRole("button", { name: "Export Quality sheet" }));
		await waitFor(() => expect(exported()).toEqual(["dossier", "functional", "sheet"]));
		expect(await screen.findByText("Exported: /mock/costing.xlsx")).toBeInTheDocument();
	});

	it("shows a refused export as an error", async () => {
		const user = userEvent.setup();
		await mountKnowledge("documents");
		mockState().nextFile = "/mock/quality.txt";
		await user.click(await screen.findByRole("button", { name: "Export Quality sheet" }));
		expect(await screen.findByRole("alert")).toHaveTextContent(".xlsx");
		expect(mockState().knowledge.exported).toHaveLength(0);
	});

	it("creates a document with the one primary action", async () => {
		const user = userEvent.setup();
		await mountView(<Documents />);
		await user.click(await screen.findByRole("button", { name: "New document" }));
		await user.type(await screen.findByRole("textbox", { name: "Document name" }), "Scope");
		await user.click(screen.getByRole("button", { name: "Create" }));
		await waitFor(() =>
			expect(mockState().knowledge.files["docs/documents/scope.md"]?.text).toBe("# Scope\n"),
		);
	});

	it("searches the text of the documents and opens the hit", async () => {
		const user = userEvent.setup();
		await mountKnowledge("documents");
		await user.type(await screen.findByRole("searchbox", { name: "Search in the text" }), "scope");
		const hits = await screen.findByRole("list", { name: "Results" });
		await user.click(within(hits).getByRole("button", { name: /Client brief/ }));
		expect(await screen.findByRole("textbox", { name: "Markdown" })).toHaveValue(
			"# Client brief\n\nThe scope follows spec:billing and adr:0004.\n",
		);
		await user.clear(screen.getByRole("searchbox", { name: "Search in the text" }));
		await user.type(screen.getByRole("searchbox", { name: "Search in the text" }), "zzz");
		expect(await screen.findByText("No result")).toBeInTheDocument();
	});

	it("renames a document and keeps it open under its new name", async () => {
		const user = userEvent.setup();
		await mountKnowledge("documents");
		await user.click(await screen.findByRole("button", { name: "Client brief" }));
		await user.click(await screen.findByRole("button", { name: "Rename Client brief" }));
		const dialog = within(await screen.findByRole("dialog"));
		const name = dialog.getByRole("textbox", { name: "Name" });
		await user.clear(name);
		await user.type(name, "brief.md");
		await user.click(dialog.getByRole("button", { name: "Save" }));
		const files = () => mockState().knowledge.files;
		await waitFor(() => expect(files()["docs/documents/brief.md"]).toBeDefined());
		expect(files()["docs/documents/client-brief.md"]).toBeUndefined();
		expect(await screen.findByRole("textbox", { name: "Markdown" })).toHaveValue(
			"# Client brief\n\nThe scope follows spec:billing and adr:0004.\n",
		);
	});

	it("deletes a document to the trash only after a confirmation", async () => {
		const user = userEvent.setup();
		await mountKnowledge("documents");
		await user.click(await screen.findByRole("button", { name: "Client brief" }));
		await user.click(await screen.findByRole("button", { name: "Delete Client brief" }));
		const dialog = within(
			await screen.findByRole("dialog", {
				name: /Move docs\/documents\/client-brief\.md to the trash/,
			}),
		);
		expect(mockState().knowledge.files["docs/documents/client-brief.md"]).toBeDefined();
		await user.click(dialog.getByRole("button", { name: "Move to trash" }));
		await waitFor(() =>
			expect(mockState().knowledge.files["docs/documents/client-brief.md"]).toBeUndefined(),
		);
		await waitFor(() => expect(screen.queryByRole("button", { name: "Client brief" })).toBeNull());
	});

	it("shows a Word file as text, read only", async () => {
		const user = userEvent.setup();
		await mountKnowledge("documents");
		await user.click(await screen.findByRole("button", { name: "kickoff-notes" }));
		const doc = await screen.findByRole("article", { name: "kickoff-notes" });
		expect(await within(doc).findByRole("heading", { name: "Kickoff notes" })).toBeInTheDocument();
		expect(within(doc).getByText("The client agreed the scope.")).toBeInTheDocument();
		expect(screen.queryByRole("textbox", { name: "Markdown" })).toBeNull();
	});
});
