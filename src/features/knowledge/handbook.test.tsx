import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { inspector, mountKnowledge, mountView } from "./harness";
import { Handbook } from "./pages";

const PAGE = "docs/handbook/getting-started.md";
const files = () => mockState().knowledge.files;

describe("Knowledge / Handbook", () => {
	it("shows the pages as a tree, one group for each folder with a count", async () => {
		await mountKnowledge("handbook");
		expect(await screen.findByRole("heading", { name: "architecture (1)" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "operations (1)" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Getting started" })).toBeInTheDocument();
	});

	it("opens a page in the editor, with its refs as chips in the preview and its entity in the inspector", async () => {
		const user = userEvent.setup();
		await mountKnowledge("handbook");
		await user.click(await screen.findByRole("button", { name: "Getting started" }));
		expect(await screen.findByRole("textbox", { name: "Markdown" })).toHaveValue(
			files()[PAGE]?.text ?? "x",
		);
		const preview = screen.getByRole("article", { name: "Preview" });
		expect(within(preview).getByRole("button", { name: /^adr:0001/ })).toBeInTheDocument();
		await waitFor(async () => expect(await inspector()).toHaveTextContent(`doc:${PAGE}`));
	});

	it("saves a change to the repository file", async () => {
		const user = userEvent.setup();
		await mountKnowledge("handbook");
		await user.click(await screen.findByRole("button", { name: "Getting started" }));
		const text = await screen.findByRole("textbox", { name: "Markdown" });
		await user.type(text, " More.");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(files()[PAGE]?.text).toMatch(/More\.$/));
	});

	it("warns when the file changed on disk, and keeps mine only on request", async () => {
		const user = userEvent.setup();
		await mountKnowledge("handbook");
		await user.click(await screen.findByRole("button", { name: "Getting started" }));
		const text = await screen.findByRole("textbox", { name: "Markdown" });
		await user.type(text, " Mine.");
		files()[PAGE] = { text: "# Theirs\n", stamp: "9" };
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("The file changed on disk");
		expect(files()[PAGE]?.text).toBe("# Theirs\n");
		await user.click(screen.getByRole("button", { name: "Keep mine" }));
		await waitFor(() => expect(files()[PAGE]?.text).toMatch(/Mine\.$/));
	});

	it("creates a page with the one primary action, and the tree shows four pages", async () => {
		const user = userEvent.setup();
		await mountView(<Handbook />);
		await user.click(await screen.findByRole("button", { name: "New page" }));
		await user.type(await screen.findByRole("textbox", { name: "Page name" }), "Glossary");
		await user.click(screen.getByRole("button", { name: "Create" }));
		await waitFor(() => expect(files()["docs/handbook/glossary.md"]?.text).toBe("# Glossary\n"));
		expect(await screen.findByRole("button", { name: "Glossary" })).toBeInTheDocument();
		expect(
			screen.getAllByRole("button", { name: /.+/ }).filter((b) => b.hasAttribute("data-nav")),
		).toHaveLength(4);
	});
});
