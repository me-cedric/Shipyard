import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountKnowledge } from "./harness";

const f = en.library.fn.learn;

// spec:library-functions#REQ-005
describe("Learn: Experts, Add a word and the second pill", () => {
	it("writes the word into docs/glossary.md and shows it in the glossary", async () => {
		const user = userEvent.setup();
		await mountKnowledge("learn");
		await user.click(await screen.findByRole("button", { name: f.addWord }));
		await user.type(await screen.findByRole("textbox", { name: f.word }), "Recipe");
		await user.type(screen.getByRole("textbox", { name: f.meaning }), "the steps of an agent");
		await user.click(screen.getByRole("button", { name: f.add }));
		await waitFor(() =>
			expect(mockState().knowledge.files["docs/glossary.md"]?.text).toContain(
				"- Recipe: the steps of an agent",
			),
		);
		const list = await screen.findByRole("list", { name: "Glossary" });
		expect(await within(list).findByRole("button", { name: "Recipe" })).toBeVisible();
		expect(within(list).getByText("the steps of an agent")).toBeVisible();
		const { glossary } = await unwrap(commands.learnGet());
		expect(glossary.find((g) => g.term === "Recipe")?.spec).toBe("doc:docs/glossary.md");
	});

	it("refuses a word that a spec defines and keeps the form open with the reason", async () => {
		const user = userEvent.setup();
		await mountKnowledge("learn");
		const { glossary } = await unwrap(commands.learnGet());
		const known = glossary[0]?.term ?? "";
		await user.click(await screen.findByRole("button", { name: f.addWord }));
		await user.type(await screen.findByRole("textbox", { name: f.word }), known);
		await user.type(screen.getByRole("textbox", { name: f.meaning }), "another meaning");
		await user.click(screen.getByRole("button", { name: f.add }));
		expect(await screen.findByRole("alert")).toBeVisible();
		expect(mockState().knowledge.files["docs/glossary.md"]).toBeUndefined();
		expect(screen.getByRole("textbox", { name: f.word })).toHaveValue(known);
	});

	it("shows an expert of the team file with the topic", async () => {
		await mountKnowledge("learn");
		const team = await unwrap(commands.workTeam());
		expect(team.team.members.find((m) => m.handle === "grace")?.topics).toContain("Billing");
		const experts = await screen.findByRole("list", { name: "Experts" });
		const row = within(experts)
			.getAllByRole("listitem")
			.find((li) => li.textContent?.includes("Grace Hopper"));
		expect(row).toHaveTextContent("Billing");
	});

	it("gives a second pill to the step that a learning step is about", async () => {
		await mountKnowledge("learn");
		const path = await screen.findByRole("list", { name: "Path" });
		const items = await within(path).findAllByRole("listitem");
		const row = items.find((li) => li.textContent?.includes("auth"));
		expect(row).toHaveTextContent(en.knowledge.learn.kind.certification);
		const other = items.find((li) => li.textContent?.includes("billing"));
		expect(other).not.toHaveTextContent(en.knowledge.learn.kind.certification);
	});
});
