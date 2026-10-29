import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { Decisions } from "./decisions";
import { Diagrams } from "./diagrams";
import { mountDesign } from "./harness";

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
		await user.click(await screen.findByRole("button", { name: "Copy ref" }));
		expect(writeText).toHaveBeenCalledWith("diagram:context");
	});

	it("puts the ref in the inspector and groups the backlinks by kind with a count", async () => {
		const user = userEvent.setup();
		await mountDesign(<Diagrams />);
		await user.click((await list("Diagrams")).getByRole("button", { name: /context/ }));
		const panel = await inspector();
		expect(await panel.findByRole("button", { name: /^diagram:context/ })).toBeInTheDocument();
		// The design doc and the home screen cite the diagram.
		expect(await panel.findByRole("heading", { name: "Document (1)" })).toBeInTheDocument();
		expect(panel.getByRole("heading", { name: "Screen (1)" })).toBeInTheDocument();
		expect(panel.getByRole("button", { name: /^screen:home/ })).toBeInTheDocument();
	});

	it("shows the citation of an ADR in its backlinks", async () => {
		const user = userEvent.setup();
		await mountDesign(<Decisions />);
		await user.click((await list("Decisions")).getByRole("button", { name: /0004/ }));
		const panel = await inspector();
		expect(await panel.findByRole("heading", { name: /^Document \(\d+\)$/ })).toBeInTheDocument();
	});

	it("shows ghost rows for an artifact that nothing cites", async () => {
		const user = userEvent.setup();
		await mountDesign(<Decisions />);
		await user.click((await list("Decisions")).getByRole("button", { name: /0003/ }));
		const panel = await inspector();
		await panel.findByRole("button", { name: /^adr:0003/ });
		await waitFor(() => expect(panel.queryAllByRole("heading", { level: 3 })).toHaveLength(0));
	});
});
