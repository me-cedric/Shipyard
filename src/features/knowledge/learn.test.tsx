import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { inspector, mountKnowledge } from "./harness";

const RANK = ["model", "adr", "spec"];

describe("Knowledge / Learn", () => {
	it("lists the path in order: the architecture, the ADRs, then the specs", async () => {
		await mountKnowledge("learn");
		const learn = await unwrap(commands.learnGet());
		expect(learn.path.length).toBeGreaterThan(0);
		const list = await screen.findByRole("list", { name: "Path" });
		expect(
			await screen.findByRole("heading", { name: `Path (${learn.path.length})` }),
		).toBeInTheDocument();
		const shown = within(list)
			.getAllByRole("listitem")
			.map((li) => li.querySelector("button")?.getAttribute("aria-label")?.split(",")[0]);
		expect(shown).toEqual(learn.path.map((s) => s.ref));
		const ranks = learn.path.map((s) => RANK.indexOf(s.kind));
		expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
	});

	it("shows the glossary with a count, and a term opens the spec that defines it", async () => {
		const user = userEvent.setup();
		await mountKnowledge("learn");
		const { glossary } = await unwrap(commands.learnGet());
		const term = glossary[0];
		if (!term) throw new Error("no term");
		expect(
			await screen.findByRole("heading", { name: `Glossary (${glossary.length})` }),
		).toBeInTheDocument();
		await user.click(await screen.findByRole("button", { name: term.term }));
		await waitFor(async () => expect(await inspector()).toHaveTextContent(term.spec));
	});
});
