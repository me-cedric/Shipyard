import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { Questions } from "./index";
import { renderSpecs } from "./test-harness";

type User = ReturnType<typeof userEvent.setup>;
const files = () => mockState().specs.files;
const QDIR = "docs/delivery/questions";
const rows = () => screen.findAllByRole("row", { name: /Q-\d+/ });
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
		await pick(user, "Status", "open");
		await waitFor(async () => expect(await rows()).toHaveLength(3));
		await pick(user, "Owner", "ada");
		await waitFor(async () => expect(await rows()).toHaveLength(2));
		await pick(user, "Kind", "question");
		await waitFor(async () => expect(await rows()).toHaveLength(1));
		expect(screen.getByRole("row", { name: /Q-035/ })).toHaveTextContent("ada");
		await pick(user, "Kind", "All kinds");
		await pick(user, "Owner", "All owners");
		await pick(user, "Status", "All statuses");
		await user.type(screen.getByRole("textbox", { name: "Search" }), "forge");
		await waitFor(async () => expect(await rows()).toHaveLength(1));
	});

	it("creates a question with the nine keys in order", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Questions />);
		await user.click(await screen.findByRole("button", { name: "New question" }));
		await fill(user, "Title", "Who signs?");
		await fill(user, "Owner", "ada");
		await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
		await waitFor(() => expect(files()[`${QDIR}/Q-036.md`]).toBeDefined());
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

	it("refuses an unknown kind, an unknown status and a duplicate id, and writes nothing", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Questions />);
		const before = Object.keys(files()).length;
		await user.click(await screen.findByRole("button", { name: "New question" }));
		const dialog = within(screen.getByRole("dialog"));
		await fill(user, "Title", "Dup");
		await fill(user, "Id", "Q-012");
		await user.click(dialog.getByRole("button", { name: "Save" }));
		expect(await dialog.findByRole("alert")).toHaveTextContent("duplicate id Q-012");
		await fill(user, "Id", "");
		await fill(user, "Kind", "bogus");
		await user.click(dialog.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(dialog.getByRole("alert")).toHaveTextContent("unknown kind: bogus"));
		await fill(user, "Kind", "risk");
		await fill(user, "Status", "nope");
		await user.click(dialog.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(dialog.getByRole("alert")).toHaveTextContent("unknown status: nope"),
		);
		expect(Object.keys(files())).toHaveLength(before);
	});

	it("saves the changed owner of a question", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Questions />);
		await user.click(await screen.findByRole("row", { name: /^Q-020/ }));
		const dialog = within(await screen.findByRole("dialog"));
		await fill(user, "Owner", "grace2");
		await user.click(dialog.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(files()[`${QDIR}/Q-020.md`]?.text).toContain("owner: grace2"));
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
		await user.click(await screen.findByRole("row", { name: /Q-035/ }));
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
