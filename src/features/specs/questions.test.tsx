import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { errorMessages } from "@/lib/i18n/errors";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { Questions } from "./index";
import { renderSpecs } from "./test-harness";

type User = ReturnType<typeof userEvent.setup>;
const files = () => mockState().specs.files;
const QDIR = "docs/delivery/questions";
// Each question has one Edit control: a button on an open card, the title of a closed row.
const rows = () => screen.findAllByRole("button", { name: /^Edit: / });
const Q020 = "Edit: Claim stamps need an issue tracker comment write";
const Q034 = "Edit: A duplicate of Q-020";
const Q035 = "Edit: Which export formats ship first?";
const pick = async (user: User, name: string, option: string) => {
	await user.click(screen.getByRole("combobox", { name }));
	await user.click(await screen.findByRole("option", { name: option }));
};
const fill = async (user: User, name: string, value: string) => {
	const box = within(screen.getByRole("dialog")).getByLabelText(name);
	await user.clear(box);
	if (value) await user.type(box, value);
};

describe("Specs / Questions", () => {
	it("lists kind, status and owner, and filters by the three together", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Questions />);
		expect(await rows()).toHaveLength(7);
		// The status, the owner and the search sit behind More.
		await user.click(screen.getByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("menuitem", { name: "Filters" }));
		await pick(user, "Status", "Open");
		await waitFor(async () => expect(await rows()).toHaveLength(3));
		await pick(user, "Owner", "Ada Lovelace");
		await waitFor(async () => expect(await rows()).toHaveLength(2));
		const kinds = within(screen.getByRole("group", { name: "Kind" }));
		await user.click(kinds.getByRole("button", { name: "Questions" }));
		await waitFor(async () => expect(await rows()).toHaveLength(1));
		expect(screen.getByRole("button", { name: Q035 }).closest("article")).toHaveTextContent(
			"Ada Lovelace",
		);
		await user.click(kinds.getByRole("button", { name: "All" }));
		await pick(user, "Owner", "All owners");
		await pick(user, "Status", "All statuses");
		await user.type(screen.getByRole("textbox", { name: "Search" }), "code host");
		await waitFor(async () => expect(await rows()).toHaveLength(1));
	});

	it("creates a question with the nine keys in order", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Questions />);
		await user.click(await screen.findByRole("button", { name: "New question" }));
		await fill(user, "Title", "Who signs?");
		await pick(user, "Owner", "Ada Lovelace");
		await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
		await waitFor(() => expect(files()[`${QDIR}/Q-036.md`]).toBeDefined());
		// The owner is the handle of the team member.
		expect(files()[`${QDIR}/Q-036.md`]?.text).toContain("owner: ada");
		const keys = [...(files()[`${QDIR}/Q-036.md`]?.text ?? "").matchAll(/^(\w+):/gm)].map(
			(m) => m[1],
		);
		expect(keys).toEqual([
			"id",
			"kind",
			"status",
			"raisedAt",
			"raisedBy",
			"owner",
			"specRef",
			"taskRef",
			"ticket",
		]);
	});

	it("refuses a duplicate id and writes nothing", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Questions />);
		const before = Object.keys(files()).length;
		await user.click(await screen.findByRole("button", { name: "New question" }));
		const dialog = within(screen.getByRole("dialog"));
		await fill(user, "Title", "Dup");
		await fill(user, "Id", "Q-012");
		await user.click(dialog.getByRole("button", { name: "Save" }));
		expect(await dialog.findByRole("alert")).toHaveTextContent(errorMessages.en.already_exists);
		expect(Object.keys(files())).toHaveLength(before);
	});

	it("takes the status from a menu, and answered asks for the answer", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Questions />);
		await user.click(await screen.findByRole("button", { name: Q020 }));
		const dialog = within(await screen.findByRole("dialog"));
		expect(dialog.queryByLabelText("Answer")).toBeNull();
		await waitFor(() => expect(dialog.getByRole("button", { name: "Save" })).toBeEnabled());
		await pick(user, "Status", "answered");
		const answer = await dialog.findByLabelText("Answer");
		await waitFor(() => expect(answer).toHaveFocus());
		expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
		await user.type(answer, "Use labels");
		await user.click(dialog.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(files()[`${QDIR}/Q-020.md`]?.text).toContain("status: answered"));
		expect(files()[`${QDIR}/Q-020.md`]?.text.trimEnd().endsWith("Use labels")).toBe(true);
	});

	it("saves the changed owner of a question", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Questions />);
		await user.click(await screen.findByRole("button", { name: Q020 }));
		const dialog = within(await screen.findByRole("dialog"));
		await pick(user, "Owner", "Alan Turing");
		await user.click(dialog.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(files()[`${QDIR}/Q-020.md`]?.text).toContain("owner: alan"));
	});

	it("fills the form from the file that the stamp belongs to", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Questions />);
		const row = await screen.findByRole("button", { name: Q020 });
		const path = `${QDIR}/Q-020.md`;
		const f = files()[path];
		if (!f) throw new Error("no Q-020");
		// The file changed after the list was read.
		files()[path] = { ...f, text: f.text.replace("owner: grace", "owner: zed") };
		await user.click(row);
		const dialog = within(await screen.findByRole("dialog"));
		await waitFor(() => expect(dialog.getByLabelText("Owner")).toHaveTextContent("zed"));
		await fill(user, "Title", "New title");
		await user.click(dialog.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(files()[path]?.text).toContain("# New title"));
		expect(files()[path]?.text).toContain("owner: zed");
	});

	it("renames a question and edits its text, and the file keeps both", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Questions />);
		await user.click(await screen.findByRole("button", { name: Q020 }));
		const dialog = within(await screen.findByRole("dialog"));
		await waitFor(() =>
			expect(dialog.getByLabelText("Text")).toHaveValue(
				"\nClaim stamps need an issue tracker comment write\n",
			),
		);
		await fill(user, "Title", "Use labels");
		await fill(user, "Text", "Label it");
		await user.click(dialog.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(files()[`${QDIR}/Q-020.md`]?.text).toContain("# Use labels"));
		expect(files()[`${QDIR}/Q-020.md`]?.text).toContain("Label it");
	});

	it("deletes a question only after a confirmation, and the file goes to the trash", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Questions />);
		await user.click(await screen.findByRole("button", { name: Q034 }));
		await user.click(
			await within(await screen.findByRole("dialog")).findByRole("button", { name: "Delete" }),
		);
		const confirm = within(
			await screen.findByRole("dialog", {
				name: /Move docs\/delivery\/questions\/Q-034\.md to the trash/,
			}),
		);
		expect(files()[`${QDIR}/Q-034.md`]).toBeDefined();
		await user.click(confirm.getByRole("button", { name: "Move to trash" }));
		await waitFor(() => expect(files()[`${QDIR}/Q-034.md`]).toBeUndefined());
		await waitFor(async () => expect(await rows()).toHaveLength(6));
	});

	it("shows the count of open questions, the open items as cards and the closed ones in one card", async () => {
		await renderSpecs(<Questions />);
		expect(await screen.findByRole("heading", { name: "3 open questions" })).toBeVisible();
		expect(await screen.findAllByRole("article")).toHaveLength(3);
		const closed = within(screen.getByRole("region", { name: "Closed" }));
		expect(closed.getAllByRole("listitem")).toHaveLength(4);
		expect(closed.getAllByText("Answered")).toHaveLength(3);
		// No raw id on the page.
		expect(screen.queryByText("Q-012")).toBeNull();
	});

	it("answers an open question in place: the answer is the last line of its text", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Questions />);
		const name = "Answer: Claim stamps need an issue tracker comment write";
		const send = await screen.findByRole("button", { name });
		expect(send).toBeDisabled();
		await user.type(screen.getByRole("textbox", { name }), "Use labels");
		await user.click(send);
		await waitFor(() => expect(files()[`${QDIR}/Q-020.md`]?.text).toContain("status: answered"));
		expect(files()[`${QDIR}/Q-020.md`]?.text.trimEnd().endsWith("Use labels")).toBe(true);
		expect(await screen.findByRole("heading", { name: "2 open questions" })).toBeVisible();
	});

	it("offers to add the answer to the spec on an answered row that names a spec", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Questions />);
		const name = "Answer: Which export formats ship first?";
		await user.type(await screen.findByRole("textbox", { name }), "CSV first");
		await user.click(screen.getByRole("button", { name }));
		await user.click(
			await screen.findByRole("button", {
				name: "Add the answer to the spec: Which export formats ship first?",
			}),
		);
		const dialog = within(await screen.findByRole("dialog"));
		expect(await dialog.findByRole("region", { name: "Preview" })).toHaveTextContent("+ CSV first");
	});

	it("keeps the items of the person with Mine", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Questions />);
		expect(await rows()).toHaveLength(7);
		await user.click(screen.getByRole("button", { name: "Mine" }));
		await waitFor(async () => expect(await rows()).toHaveLength(3));
		// A row with no spec has no "Add the answer to the spec".
		expect(screen.queryByRole("button", { name: /^Add the answer to the spec/ })).toBeNull();
	});

	it("folds an answer after a preview and one click, with no new section", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const entry = (await unwrap(commands.specsQuestions())).find((e) => e.question.id === "Q-035");
		if (!entry) throw new Error("no Q-035");
		await unwrap(
			commands.specsQuestionSave(
				entry.path,
				{
					...entry.question,
					status: "answered",
					body: "\nWhich export formats ship first?\nCSV first\n",
				},
				null,
			),
		);
		const spec = "docs/openspec/changes/add-export/specs/export/spec.md";
		const before = files()[spec]?.text ?? "";
		await renderSpecs(<Questions />);
		await user.click(await screen.findByRole("button", { name: Q035 }));
		await user.click(await screen.findByRole("button", { name: "Fold" }));
		const dialog = within(await screen.findByRole("dialog"));
		const preview = await dialog.findByRole("region", { name: "Preview" });
		await waitFor(() => expect(preview).toHaveTextContent("NEEDS CLARIFICATION"));
		expect(preview).toHaveTextContent("+ CSV first");
		// The preview writes nothing.
		expect(files()[spec]?.text).toBe(before);
		await user.click(dialog.getByRole("button", { name: "Fold" }));
		await waitFor(() => expect(files()[spec]?.text).toContain("### Clarifications"));
		const after = files()[spec]?.text ?? "";
		expect(after).not.toContain("NEEDS CLARIFICATION");
		expect(after.match(/^## /gm)).toEqual(before.match(/^## /gm));
		expect(after).toContain("- Q-035 Which export formats ship first?: CSV first");
	});
});
