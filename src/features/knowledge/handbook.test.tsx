import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { inspector, mountKnowledge, mountView } from "./harness";
import { Handbook } from "./pages";

const PAGE = "docs/handbook/getting-started.md";
const files = () => mockState().knowledge.files;
/** The card of the open page. The inspector has an Edit of its own. */
const card = () => screen.getByRole("region", { name: "Getting started" });

describe("Knowledge / Handbook", () => {
	it("shows the pages as a tree, one group for each folder with a count", async () => {
		await mountKnowledge("handbook");
		expect(await screen.findByRole("heading", { name: "architecture" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "operations" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Getting started" })).toBeInTheDocument();
	});

	it("opens a page in the editor, with its refs as chips in the preview and its entity in the inspector", async () => {
		const user = userEvent.setup();
		await mountKnowledge("handbook");
		await user.click(await screen.findByRole("button", { name: "Getting started" }));
		// A page opens in the reading layout; Edit shows the editor.
		expect(await screen.findByRole("article", { name: "Getting started" })).toBeInTheDocument();
		// The items that cite the page are a card under the tree.
		const cited = await unwrap(commands.refsBacklinks(`doc:${PAGE}`));
		expect(screen.queryAllByRole("region", { name: "Pages that link here" })).toHaveLength(
			cited.length ? 1 : 0,
		);
		expect(screen.getByRole("link", { name: /Manual of Shipyard/ })).toBeInTheDocument();
		await user.click(within(card()).getByRole("button", { name: "Edit" }));
		expect(await screen.findByRole("textbox", { name: "Markdown" })).toHaveValue(
			files()[PAGE]?.text ?? "x",
		);
		// The preview beside the text is in the "More" menu of the card.
		await user.click(screen.getByRole("button", { name: "More Getting started" }));
		await user.click(await screen.findByRole("menuitemcheckbox", { name: "Both" }));
		const preview = screen.getByRole("article", { name: "Preview" });
		expect(within(preview).getByRole("button", { name: /^adr:0001/ })).toBeInTheDocument();
		await waitFor(async () => expect(await inspector()).toHaveTextContent(`doc:${PAGE}`));
	});

	it("opens the card of a ref in the running text of a page", async () => {
		const user = userEvent.setup();
		await mountKnowledge("handbook");
		await user.click(await screen.findByRole("button", { name: "Getting started" }));
		const page = await screen.findByRole("article", { name: "Getting started" });
		await user.click(within(page).getByRole("button", { name: /^adr:0001/ }));
		await waitFor(async () => expect(await inspector()).toHaveTextContent("adr:0001"));
	});

	it("filters the pages with the text search, and shows all again when the box is empty", async () => {
		const user = userEvent.setup();
		await mountKnowledge("handbook");
		await screen.findByRole("button", { name: "Getting started" });
		const box = screen.getByRole("searchbox", { name: "Find a page" });
		await user.type(box, "zzzz");
		await waitFor(() =>
			expect(screen.queryByRole("button", { name: "Getting started" })).not.toBeInTheDocument(),
		);
		await user.clear(box);
		expect(await screen.findByRole("button", { name: "Getting started" })).toBeInTheDocument();
		await user.type(box, "getting");
		expect(await screen.findByRole("button", { name: "Getting started" })).toBeInTheDocument();
	});

	it("saves a change to the repository file", async () => {
		const user = userEvent.setup();
		await mountKnowledge("handbook");
		await user.click(await screen.findByRole("button", { name: "Getting started" }));
		await user.click(await within(card()).findByRole("button", { name: "Edit" }));
		const text = await screen.findByRole("textbox", { name: "Markdown" });
		await user.type(text, " More.");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(files()[PAGE]?.text).toMatch(/More\.$/));
	});

	it("warns when the file changed on disk, and keeps mine only on request", async () => {
		const user = userEvent.setup();
		await mountKnowledge("handbook");
		await user.click(await screen.findByRole("button", { name: "Getting started" }));
		await user.click(await within(card()).findByRole("button", { name: "Edit" }));
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
