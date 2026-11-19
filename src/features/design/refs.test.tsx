import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { mockState } from "@/lib/ipc/mock";
import { Decisions } from "./decisions";
import { Diagrams } from "./diagrams";
import { mountDesign } from "./harness";

const files = () => mockState().design.files;
const list = async (name: string) => within(await screen.findByRole("list", { name }));
const inspector = async () =>
	within(await screen.findByRole("complementary", { name: "Inspector" }));

// Excalidraw needs a browser. The ref does not.
vi.mock("@/ui/organisms/excalidraw-board", () => ({
	ExcalidrawBoard: ({ label }: { label: string }) => <div role="img" aria-label={label} />,
}));

describe("the ref of a design artifact", () => {
	it("copies the ref of a diagram", async () => {
		const user = userEvent.setup();
		const writeText = vi.fn();
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
		await mountDesign(<Diagrams />);
		await user.click((await list("Diagrams")).getByRole("button", { name: /context/ }));
		// The inspector header offers Copy ref too: any of them copies the same ref.
		// The reference sits in the "More" menu of the page.
		await user.click(await screen.findByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("menuitem", { name: "Copy ref" }));
		expect(writeText).toHaveBeenCalledWith("diagram:context");
	});

	it("puts the ref in the inspector and groups the backlinks by kind with a count", async () => {
		const user = userEvent.setup();
		await mountDesign(<Diagrams />);
		await user.click((await list("Diagrams")).getByRole("button", { name: /context/ }));
		const panel = await inspector();
		expect(await panel.findByText("diagram:context", { selector: "code" })).toBeInTheDocument();
		// The design doc and the home screen cite the diagram.
		expect(await panel.findAllByRole("button", { name: /^doc:/ })).toHaveLength(1);
		expect(panel.getAllByRole("button", { name: /^screen:/ })).toHaveLength(1);
		expect(panel.getByRole("button", { name: /^screen:home/ })).toBeInTheDocument();
	});

	it("shows the citation of an ADR in its backlinks", async () => {
		const user = userEvent.setup();
		await mountDesign(<Decisions />);
		await user.click((await list("Decisions")).getByRole("button", { name: /Polling sync/ }));
		const panel = await inspector();
		expect(await panel.findAllByRole("button", { name: /^doc:/ })).not.toHaveLength(0);
	});

	it("shows ghost rows for an artifact that nothing cites", async () => {
		const user = userEvent.setup();
		// The demo decisions are cited: this one is cited by nothing.
		files()["docs/decisions/0005-use-queues.md"] = {
			text: "---\nstatus: accepted\ndate: 2026-10-30\ndecision-makers: [ada]\n---\n# Use queues\n## Context and problem statement\n\nWhy.\n",
			stamp: "1",
		};
		await mountDesign(<Decisions />);
		await user.click((await list("Decisions")).getByRole("button", { name: /Use queues/ }));
		const panel = await inspector();
		await panel.findByText("adr:0005", { selector: "code" });
		await waitFor(() => expect(panel.queryAllByRole("heading", { level: 3 })).toHaveLength(0));
	});
});
