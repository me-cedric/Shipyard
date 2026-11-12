import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { useShell } from "@/lib/shell";
import { mountKnowledge, mountView } from "./harness";
import { Slides } from "./slides";

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
const HTML = "docs/slides/roadmap.html";
const files = () => mockState().knowledge.files;
const open = async (user: ReturnType<typeof userEvent.setup>, name = "Kickoff") =>
	user.click(await screen.findByRole("button", { name }));
const frame = async () => (await screen.findByTitle("Roadmap")) as HTMLIFrameElement;

/** The draft that `ask` gives the assistant. */
function Draft() {
	return <output aria-label="draft">{useShell().prefill}</output>;
}

describe("Knowledge / Slides", () => {
	beforeEach(() => {
		reveal.configs.length = 0;
	});

	it("lists the HTML decks and the Markdown decks", async () => {
		await mountKnowledge("slides");
		expect(await screen.findByRole("button", { name: "Roadmap" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Kickoff" })).toBeInTheDocument();
	});

	it("shows an HTML deck in a frame that runs scripts with no origin, from the file", async () => {
		const user = userEvent.setup();
		await mountKnowledge("slides");
		await open(user, "Roadmap");
		const f = await frame();
		expect(f.getAttribute("sandbox")).toBe("allow-scripts");
		expect(f.getAttribute("sandbox")).not.toContain("allow-same-origin");
		await waitFor(() => expect(f.getAttribute("srcdoc")).toBe(files()[HTML]?.text));
	});

	it("gives the arrow keys to the frame and leaves the present mode with Escape", async () => {
		const user = userEvent.setup();
		await mountKnowledge("slides");
		await open(user, "Roadmap");
		const f = await frame();
		const post = vi.spyOn(f.contentWindow as Window, "postMessage");
		const stage = screen.getByRole("region", { name: "Slides" });
		fireEvent.keyDown(stage, { key: "ArrowRight" });
		fireEvent.keyDown(stage, { key: "a" });
		expect(post).toHaveBeenCalledTimes(1);
		expect(post).toHaveBeenCalledWith({ deckKey: "ArrowRight" }, "*");

		await user.click(screen.getByRole("button", { name: "Present" }));
		const present = await screen.findByRole("region", { name: "Present" });
		expect(present).toHaveAttribute("data-present");
		// Escape pressed inside the frame comes back as a message of that frame.
		window.dispatchEvent(
			new MessageEvent("message", { data: { deckKey: "Escape" }, source: f.contentWindow }),
		);
		await waitFor(() => expect(screen.queryByRole("region", { name: "Present" })).toBeNull());
	});

	it("exports a PDF to the path of the Save as dialog, and Cancel exports nothing", async () => {
		const user = userEvent.setup();
		await mountKnowledge("slides");
		await open(user, "Roadmap");
		const exported = () => mockState().knowledge.exported;
		mockState().nextFile = "";
		await user.click(await screen.findByRole("button", { name: "Export PDF" }));
		expect(exported()).toEqual([]);
		mockState().nextFile = "/mock/roadmap.pdf";
		await user.click(screen.getByRole("button", { name: "Export PDF" }));
		expect(await screen.findByText("Exported: /mock/roadmap.pdf")).toBeInTheDocument();
		expect(exported()).toEqual([{ kind: "pdf", path: "/mock/roadmap.pdf" }]);
	});

	it("deletes an HTML deck from the item menu", async () => {
		const user = userEvent.setup();
		await mountKnowledge("slides");
		fireEvent.contextMenu(await screen.findByRole("button", { name: "Roadmap" }));
		await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
		await waitFor(() => expect(files()[HTML]).toBeUndefined());
		await waitFor(() => expect(screen.queryByRole("button", { name: "Roadmap" })).toBeNull());
	});

	it("New deck asks an agent for an HTML deck and writes no file", async () => {
		const user = userEvent.setup();
		await mountView(
			<>
				<Slides />
				<Draft />
			</>,
		);
		const before = Object.keys(files()).length;
		await user.click(await screen.findByRole("button", { name: "New deck" }));
		await user.type(await screen.findByRole("textbox", { name: "Deck name" }), "Q3 review");
		await user.click(screen.getByRole("button", { name: "Create" }));
		expect(await screen.findByRole("status", { name: "draft" })).toHaveTextContent(
			'Follow the slide-deck skill in .agents/skills/slide-deck/SKILL.md. Write the new deck docs/slides/q3-review.html with the title "Q3 review".',
		);
		expect(Object.keys(files())).toHaveLength(before);
	});

	it("shows a Markdown deck read only, and Convert asks an agent for the HTML deck", async () => {
		const user = userEvent.setup();
		await mountView(
			<>
				<Slides />
				<Draft />
			</>,
		);
		await open(user);
		expect(await screen.findByRole("region", { name: "Slides (5)" })).toBeInTheDocument();
		expect(screen.getByRole("article", { name: "Slide 2" })).toHaveTextContent("Goals");
		expect(screen.queryByRole("tab", { name: "Edit" })).toBeNull();
		await user.click(screen.getByRole("button", { name: "Convert" }));
		expect(screen.getByRole("status", { name: "draft" })).toHaveTextContent(
			"Rewrite the Markdown deck docs/slides/kickoff.md as the HTML deck docs/slides/kickoff.html.",
		);
	});

	it("gives every Markdown deck the colours of the one project theme", async () => {
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

	it("presents a Markdown deck over the window and leaves with Escape", async () => {
		const user = userEvent.setup();
		await mountKnowledge("slides");
		await open(user);
		await user.click(await screen.findByRole("button", { name: "Present" }));
		const deck = await screen.findByRole("region", { name: "Present" });
		expect(deck).toHaveAttribute("data-present");
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("region", { name: "Present" })).toBeNull());
	});

	it("removes the transitions of a Markdown deck under reduced motion", async () => {
		const user = userEvent.setup();
		// The motion preference of the person, not the system: the deck follows the one source.
		mockState().prefs.motion = "reduce";
		await mountKnowledge("slides");
		await open(user);
		await screen.findByRole("region", { name: "Slides (5)" });
		await waitFor(() => expect(reveal.configs.at(-1)?.transition).toBe("none"));
	});
});
