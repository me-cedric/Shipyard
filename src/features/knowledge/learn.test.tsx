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

	it("opens a step from its title, not only from its chip", async () => {
		const user = userEvent.setup();
		await mountKnowledge("learn");
		const { path } = await unwrap(commands.learnGet());
		const step = path[0];
		if (!step) throw new Error("no step");
		const list = await screen.findByRole("list", { name: "Path" });
		await user.click(await within(list).findByRole("button", { name: step.title }));
		await waitFor(async () => expect(await inspector()).toHaveTextContent(step.ref));
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

describe("Knowledge / Learn: paths and feeds", () => {
	it("ticks a step for the picked person and shows the progress of the team", async () => {
		const user = userEvent.setup();
		await mountKnowledge("learn");
		const path = await screen.findByRole("region", { name: "Onboarding" });
		const steps = within(path).getByRole("list", { name: "Steps" });
		const exam = within(steps).getByRole("checkbox", { name: "Done: Cloud certification" });
		expect(exam).not.toBeChecked();
		await user.click(exam);
		await waitFor(() =>
			expect(
				within(steps).getByRole("checkbox", { name: "Done: Cloud certification" }),
			).toBeChecked(),
		);
		const { progress } = await unwrap(commands.learningGet());
		expect(progress.ada).toContain("onboarding/cloud-certification");
		const table = await screen.findByRole("table");
		const ada = within(table).getByRole("row", { name: /Ada Lovelace/ });
		expect(ada).toHaveTextContent("3/3");
		expect(within(path).getByRole("list", { name: "Experts" })).toHaveTextContent("Ada Lovelace");
	});

	it("creates a path with a course from the form", async () => {
		const user = userEvent.setup();
		await mountKnowledge("learn");
		await user.click(await screen.findByRole("button", { name: "New path" }));
		const form = await screen.findByRole("form", { name: "New path" });
		await user.type(within(form).getByRole("textbox", { name: "Path name" }), "Rust basics");
		await user.type(within(form).getByRole("textbox", { name: "Step name" }), "The book");
		await user.click(within(form).getByRole("checkbox", { name: "Expert Grace Hopper" }));
		await user.click(within(form).getByRole("button", { name: "Save path" }));
		const path = await screen.findByRole("region", { name: "Rust basics" });
		expect(within(path).getByText("The book")).toBeInTheDocument();
		const saved = (await unwrap(commands.learningGet())).paths.find((p) => p.id === "rust-basics");
		expect(saved?.experts).toEqual(["grace"]);
		expect(saved?.steps[0]?.id).toBe("the-book");
	});

	it("subscribes to a feed and shows its items as text; a page that is no feed shows its error", async () => {
		const user = userEvent.setup();
		await mountKnowledge("learn");
		const feeds = await screen.findByRole("heading", { name: /^Feeds/ });
		expect(feeds).toBeInTheDocument();
		expect(
			await screen.findByRole("region", { name: "News of blog.example.com" }),
		).toHaveTextContent("Release notes 2.0");
		await user.type(
			screen.getByRole("textbox", { name: "Feed address" }),
			"https://broken.example.com/x",
		);
		await user.click(screen.getByRole("button", { name: "Subscribe" }));
		const bad = await screen.findByRole("region", { name: "https://broken.example.com/x" });
		expect(await within(bad).findByRole("alert")).toHaveTextContent(
			"This address does not give a news feed",
		);
		await user.click(
			within(bad).getByRole("button", { name: "Unsubscribe from https://broken.example.com/x" }),
		);
		await waitFor(() =>
			expect(screen.queryByRole("region", { name: "https://broken.example.com/x" })).toBeNull(),
		);
	});
});
