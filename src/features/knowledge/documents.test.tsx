import { screen, waitFor } from "@testing-library/react";
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
		await user.click(await screen.findByRole("button", { name: "Architecture dossier" }));
		await waitFor(() => expect(exported()).toEqual(["dossier"]));
		await user.click(screen.getByRole("button", { name: "Functional documentation" }));
		await waitFor(() => expect(exported()).toEqual(["dossier", "functional"]));
		await user.click(screen.getByRole("button", { name: "Quality sheet" }));
		await waitFor(() => expect(exported()).toEqual(["dossier", "functional", "sheet"]));
		expect(await screen.findByText("Exported: /mock/costing.xlsx")).toBeInTheDocument();
	});

	it("shows a refused export as an error", async () => {
		const user = userEvent.setup();
		await mountKnowledge("documents");
		mockState().nextFile = "/mock/quality.txt";
		await user.click(await screen.findByRole("button", { name: "Quality sheet" }));
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
});
