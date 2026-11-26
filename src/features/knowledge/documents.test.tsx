import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { errorMessages } from "@/lib/i18n/errors";
import { mockState } from "@/lib/ipc/mock";
import { Documents } from "./documents";
import { inspector, mountKnowledge, mountView } from "./harness";

/** The documents that Shipyard writes are in the "More" menu of the page. */
const exportFrom = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
	await user.click(await screen.findByRole("button", { name: "More" }));
	await user.click(await screen.findByRole("menuitem", { name }));
};
/** Rename and Delete are in the "More" menu of the page. */
const cardAction = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
	await user.click((await screen.findAllByRole("button", { name: "More" }))[0] as HTMLElement);
	await user.click(await screen.findByRole("menuitem", { name }));
};

describe("Knowledge / Documents", () => {
	it("lists the documents and opens one in the same editor, with its entity in the inspector", async () => {
		const user = userEvent.setup();
		await mountKnowledge("documents");
		await user.click(await screen.findByRole("button", { name: /^Client brief/ }));
		// A document opens as a page to read; the switch shows the text.
		expect(await screen.findByRole("article", { name: "Client brief" })).toBeInTheDocument();
		expect(screen.queryByRole("textbox", { name: "Markdown" })).toBeNull();
		// The format of the file is a pill on its card.
		expect(screen.getByRole("button", { name: /^Client brief\s*Markdown$/ })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Text" }));
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
		await exportFrom(user, "Export Architecture dossier");
		await waitFor(() => expect(exported()).toEqual(["dossier"]));
		await exportFrom(user, "Export Functional documentation");
		await waitFor(() => expect(exported()).toEqual(["dossier", "functional"]));
		await exportFrom(user, "Export Quality sheet");
		await waitFor(() => expect(exported()).toEqual(["dossier", "functional", "sheet"]));
		expect(await screen.findByText("Exported: /mock/quality.xlsx")).toBeInTheDocument();
	});

	it("exports nothing when the person cancels the Save as dialog", async () => {
		const user = userEvent.setup();
		await mountKnowledge("documents");
		mockState().nextFile = "";
		await exportFrom(user, "Export Architecture dossier");
		await waitFor(() => expect(mockState().nextFile).toBeUndefined());
		expect(mockState().knowledge.exported).toHaveLength(0);
		expect(screen.queryByText(/^Exported:/)).toBeNull();
	});

	it("writes to the chosen path and then shows and opens that file", async () => {
		const user = userEvent.setup();
		await mountKnowledge("documents");
		mockState().nextFile = "/mock/Clients/acme-dossier.docx";
		await exportFrom(user, "Export Architecture dossier");
		expect(await screen.findByText("Exported: /mock/Clients/acme-dossier.docx")).toBeVisible();
		const [sent] = mockState().knowledge.exported;
		expect(sent?.path).toBe("/mock/Clients/acme-dossier.docx");
		// A diagram that does not render in the test webview goes as its source.
		expect(sent?.views).toEqual([{ title: "Run states", source: "graph TD\n  A --> B", png: "" }]);
		// The File card of the open document has a "Show in folder" too: these are the ones of the export.
		const saved = within(
			screen.getByText("Exported: /mock/Clients/acme-dossier.docx").parentElement as HTMLElement,
		);
		await user.click(saved.getByRole("button", { name: "Show in folder" }));
		await user.click(saved.getByRole("button", { name: "Open" }));
		expect(screen.queryByRole("alert")).toBeNull();
	}, 30000);

	it("shows a refused export as an error", async () => {
		const user = userEvent.setup();
		await mountKnowledge("documents");
		mockState().nextFile = "/mock/quality.txt";
		await exportFrom(user, "Export Quality sheet");
		expect(await screen.findByRole("alert")).toHaveTextContent(errorMessages.en.file_unsupported);
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
		await user.click(await screen.findByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("menuitem", { name: "Search in the text" }));
		await user.type(await screen.findByRole("searchbox", { name: "Search in the text" }), "scope");
		const hits = await screen.findByRole("list", { name: "Results" });
		await user.click(within(hits).getByRole("button", { name: /Client brief/ }));
		await user.click(await screen.findByRole("button", { name: "Text" }));
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
		await user.click(await screen.findByRole("button", { name: /^Client brief/ }));
		await cardAction(user, "Rename");
		const dialog = within(await screen.findByRole("dialog"));
		const name = dialog.getByRole("textbox", { name: "Name" });
		// The dialog keeps the extension: the name holds the stem only.
		await user.clear(name);
		await user.type(name, "brief");
		await user.click(dialog.getByRole("button", { name: "Review" }));
		await user.click(await dialog.findByRole("button", { name: "Rename" }));
		const files = () => mockState().knowledge.files;
		await waitFor(() => expect(files()["docs/documents/brief.md"]).toBeDefined());
		expect(files()["docs/documents/client-brief.md"]).toBeUndefined();
		await user.click(await screen.findByRole("button", { name: "Text" }));
		expect(await screen.findByRole("textbox", { name: "Markdown" })).toHaveValue(
			"# Client brief\n\nThe scope follows spec:billing and adr:0004.\n",
		);
	});

	it("deletes a document to the trash only after a confirmation", async () => {
		const user = userEvent.setup();
		await mountKnowledge("documents");
		await user.click(await screen.findByRole("button", { name: /^Client brief/ }));
		expect(mockState().knowledge.files["docs/documents/client-brief.md"]).toBeDefined();
		await cardAction(user, "Delete");
		// The file stays until the person confirms; the mock confirms at once and keeps the question.
		expect(mockState().asked.join("\n")).toContain("docs/documents/client-brief.md");
		await waitFor(() =>
			expect(mockState().knowledge.files["docs/documents/client-brief.md"]).toBeUndefined(),
		);
		await waitFor(() => expect(screen.queryByRole("button", { name: /^Client brief/ })).toBeNull());
	});

	it("shows a Word file as text, read only", async () => {
		const user = userEvent.setup();
		await mountKnowledge("documents");
		await user.click(await screen.findByRole("button", { name: /^kickoff-notes/ }));
		const doc = await screen.findByRole("article", { name: "kickoff-notes" });
		expect(await within(doc).findByRole("heading", { name: "Kickoff notes" })).toBeInTheDocument();
		expect(within(doc).getByText("The client agreed the scope.")).toBeInTheDocument();
		expect(screen.queryByRole("textbox", { name: "Markdown" })).toBeNull();
	});
});
