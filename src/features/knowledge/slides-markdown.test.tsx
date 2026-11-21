import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import { mockState } from "@/lib/ipc/mock";
import { mountKnowledge } from "./harness";

vi.mock("reveal.js", () => ({
	default: class {
		initialize() {}
		destroy() {}
	},
}));

const DECK = "docs/slides/kickoff.md";
const k = en.knowledge.slides;
const f = en.library.fn.slides;
const files = () => mockState().knowledge.files;

async function openKickoff(user: ReturnType<typeof userEvent.setup>) {
	await mountKnowledge("slides");
	await user.click(await screen.findByRole("button", { name: /^Kickoff/ }));
	return screen.findByRole("region", { name: /^Slides \(/ });
}

// spec:library-functions#REQ-004
describe("Slides of a Markdown deck", () => {
	it("shows the Note: block of the slide under Speaker notes, and not on the stage", async () => {
		const user = userEvent.setup();
		const stage = await openKickoff(user);
		await user.click(screen.getByRole("button", { name: "Slide 4" }));
		expect(within(stage).getByRole("article", { name: "Slide 4" })).not.toHaveTextContent("Note");
		await user.click(screen.getByRole("button", { name: f.notes }));
		const notes = await screen.findByRole("region", { name: f.notes });
		expect(notes).toHaveTextContent("Name the three waves.");
		// A slide with no note shows no text of another slide.
		await user.click(screen.getByRole("button", { name: "Slide 2" }));
		expect(screen.getByRole("region", { name: f.notes })).not.toHaveTextContent("waves");
	});

	it("exports a PDF of the Markdown deck", async () => {
		const user = userEvent.setup();
		await openKickoff(user);
		mockState().nextFile = "/mock/kickoff.pdf";
		await user.click(screen.getByRole("button", { name: k.exportPdf }));
		expect(await screen.findByText("Exported: /mock/kickoff.pdf")).toBeVisible();
		expect(mockState().knowledge.exported).toEqual([{ kind: "pdf", path: "/mock/kickoff.pdf" }]);
	});

	it("edits the deck text and goes back to the slides", async () => {
		const user = userEvent.setup();
		await openKickoff(user);
		await user.click(screen.getByRole("button", { name: f.edit }));
		const text = await screen.findByRole("textbox", { name: "Markdown" });
		await user.type(text, "\n\n---\n\n## Last");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(files()[DECK]?.text).toMatch(/## Last$/));
		await user.click(screen.getByRole("button", { name: f.done }));
		expect(await screen.findByRole("region", { name: "Slides (6)" })).toBeVisible();
	});

	it("adds a costing slide and a planning slide to the Markdown deck", async () => {
		const user = userEvent.setup();
		await openKickoff(user);
		await user.click(screen.getByRole("button", { name: k.costing }));
		await waitFor(() => expect(files()[DECK]?.text).toContain("\n\n---\n\n## Costing\n\n| Sheet"));
		expect(await screen.findByRole("region", { name: "Slides (6)" })).toBeVisible();
		await user.click(screen.getByRole("button", { name: k.planning }));
		await waitFor(() => expect(files()[DECK]?.text).toContain("## Planning"));
	});
});
