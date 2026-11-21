import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountKnowledge, mountView } from "./harness";
import { Handbook } from "./pages";

const PAGE = "docs/handbook/getting-started.md";
const RULES = "docs/openspec/constitution.md";
const h = en.library.fn.history;

// spec:library-functions#REQ-002
describe("Earlier versions and History", () => {
	it("says who changed a handbook page last", async () => {
		const user = userEvent.setup();
		await mountKnowledge("handbook");
		await user.click(await screen.findByRole("button", { name: "Getting started" }));
		expect(await screen.findByText("Grace Hopper changed this page")).toBeVisible();
	});

	it("reads an earlier version of a page and restores it with no commit", async () => {
		const user = userEvent.setup();
		await mountView(<Handbook />);
		await user.click(await screen.findByRole("button", { name: "Getting started" }));
		await user.click(await screen.findByRole("button", { name: h.open }));
		const dialog = await screen.findByRole("dialog", { name: h.title });
		const log = await unwrap(commands.codeLog(0, 50));
		await user.click(await within(dialog).findByRole("button", { name: "Read docs: change 2" }));
		expect(await within(dialog).findByLabelText(h.text)).toHaveTextContent(
			"Read the architecture overview.",
		);
		await user.click(within(dialog).getByRole("button", { name: "Restore docs: change 2" }));
		await user.click(
			within(dialog).getByRole("button", { name: "Replace the page with docs: change 2" }),
		);
		await waitFor(() =>
			expect(mockState().knowledge.files[PAGE]?.text).toBe(
				"# Getting started\n\nRead the architecture overview.\n",
			),
		);
		expect(await within(dialog).findByText(h.restored)).toBeVisible();
		// Nothing is committed: the log of the branch is the same.
		expect((await unwrap(commands.codeLog(0, 50))).commits).toHaveLength(log.commits.length);
	});

	it("asks before a restore and keeps the page on Cancel", async () => {
		const user = userEvent.setup();
		await mountView(<Handbook />);
		await user.click(await screen.findByRole("button", { name: "Getting started" }));
		await user.click(await screen.findByRole("button", { name: h.open }));
		const dialog = await screen.findByRole("dialog", { name: h.title });
		const before = mockState().knowledge.files[PAGE]?.text;
		await user.click(await within(dialog).findByRole("button", { name: "Restore docs: change 2" }));
		await user.click(within(dialog).getByRole("button", { name: h.cancel }));
		expect(mockState().knowledge.files[PAGE]?.text).toBe(before);
		expect(within(dialog).getByRole("button", { name: "Restore docs: change 2" })).toBeVisible();
	});

	it("refuses a restore of a page with edits that no commit holds", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const [, old] = await unwrap(commands.pageHistory(PAGE));
		const k = mockState().knowledge;
		const page = k.files[PAGE];
		if (page) page.text = "unsaved\n";
		await expect(unwrap(commands.pageRestore(PAGE, old?.sha ?? "", true))).rejects.toMatchObject({
			message: expect.stringMatching(/not saved/),
		});
		expect(k.files[PAGE]?.text).toBe("unsaved\n");
	});

	it("refuses a restore with no click of a person", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const [, old] = await unwrap(commands.pageHistory(RULES));
		const before = mockState().specs.files[RULES]?.text;
		await expect(unwrap(commands.pageRestore(RULES, old?.sha ?? "", false))).rejects.toBeDefined();
		expect(mockState().specs.files[RULES]?.text).toBe(before);
	});

	it("lists the earlier versions of the project rules and restores the older one", async () => {
		const user = userEvent.setup();
		await mountKnowledge("handbook", "/library/constitution");
		await user.click(await screen.findByRole("button", { name: h.title }));
		const dialog = await screen.findByRole("dialog", { name: h.title });
		await user.click(await within(dialog).findByRole("button", { name: "Restore docs: change 4" }));
		await user.click(
			await within(dialog).findByRole("button", { name: "Replace the page with docs: change 4" }),
		);
		await waitFor(() =>
			expect(mockState().specs.files[RULES]?.text).toContain("Nothing ships with no test."),
		);
		expect(await within(dialog).findByText(h.restored)).toBeVisible();
	});
});
