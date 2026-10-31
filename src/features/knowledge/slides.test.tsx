import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { mountKnowledge } from "./harness";

// reveal.js measures the window: the test keeps its config and its calls.
const reveal = vi.hoisted(() => ({ configs: [] as Record<string, unknown>[], destroyed: 0 }));
vi.mock("reveal.js", () => ({
	default: class {
		constructor(_el: HTMLElement, config: Record<string, unknown>) {
			reveal.configs.push(config);
		}
		initialize() {}
		destroy() {
			reveal.destroyed += 1;
		}
	},
}));

const THEME = { color: "rgb(26, 26, 26)", backgroundColor: "rgb(255, 255, 255)" };
const files = () => mockState().knowledge.files;
const open = async (user: ReturnType<typeof userEvent.setup>, name = "Kickoff") =>
	user.click(await screen.findByRole("button", { name }));

describe("Knowledge / Slides", () => {
	beforeEach(() => {
		reveal.configs.length = 0;
	});

	it("lists the decks and previews the slides of a deck", async () => {
		const user = userEvent.setup();
		await mountKnowledge("slides");
		await open(user);
		expect(await screen.findByRole("region", { name: "Slides (5)" })).toBeInTheDocument();
		expect(screen.getByRole("article", { name: "Slide 2" })).toHaveTextContent("Goals");
	});

	it("opens a deck to read, with the slides alone, and Edit adds the text", async () => {
		const user = userEvent.setup();
		await mountKnowledge("slides");
		await open(user);
		await screen.findByRole("region", { name: "Slides (5)" });
		expect(screen.queryByRole("textbox", { name: "Markdown" })).toBeNull();
		await user.click(screen.getByRole("tab", { name: "Edit" }));
		expect(await screen.findByRole("textbox", { name: "Markdown" })).toBeVisible();
	});

	it("shows six slides when a person adds a slide in the text", async () => {
		const user = userEvent.setup();
		await mountKnowledge("slides");
		await open(user);
		await user.click(await screen.findByRole("tab", { name: "Edit" }));
		const text = await screen.findByRole("textbox", { name: "Markdown" });
		await user.click(text);
		await user.type(text, "\n---\n\n## Six\n");
		await screen.findByRole("region", { name: "Slides (6)" });
	});

	it("gives every deck the colours of the one project theme", async () => {
		const user = userEvent.setup();
		files()["docs/slides/second.md"] = { text: "# Second\n", stamp: "1" };
		await mountKnowledge("slides");
		await open(user);
		const first = await screen.findByRole("region", { name: /^Slides/ });
		await waitFor(() => expect(first).toHaveStyle(THEME));
		await open(user, "Second");
		const second = await screen.findByRole("region", { name: "Slides (1)" });
		expect(second).toHaveStyle(THEME);
	});

	it("presents a deck over the window and leaves with Escape", async () => {
		const user = userEvent.setup();
		await mountKnowledge("slides");
		await open(user);
		await user.click(await screen.findByRole("button", { name: "Present" }));
		const deck = await screen.findByRole("region", { name: "Present" });
		expect(deck).toHaveAttribute("data-present");
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("region", { name: "Present" })).toBeNull());
	});

	it("removes the transitions under reduced motion", async () => {
		const user = userEvent.setup();
		window.matchMedia = ((query: string) => ({
			matches: query.includes("reduced-motion"),
			media: query,
		})) as typeof window.matchMedia;
		await mountKnowledge("slides");
		// mountKnowledge sets a plain matchMedia: set it again after the mount.
		window.matchMedia = ((query: string) => ({
			matches: query.includes("reduced-motion"),
			media: query,
		})) as typeof window.matchMedia;
		await open(user);
		await screen.findByRole("region", { name: "Slides (5)" });
		await waitFor(() => expect(reveal.configs.at(-1)?.transition).toBe("none"));
	});
});
