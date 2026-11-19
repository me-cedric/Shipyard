import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { mockState } from "@/lib/ipc/mock";
import { Diagrams } from "./diagrams";
import { mountDesign } from "./harness";

// The engines need a browser. The stubs keep the page light.
vi.mock("@/ui/organisms/mermaid-view", () => ({
	MermaidView: ({ label }: { label?: string }) => <div role="img" aria-label={label} />,
}));
vi.mock("@/ui/organisms/bpmn-viewer", () => ({
	BpmnViewer: ({ label }: { label?: string }) => <div role="img" aria-label={label} />,
}));
vi.mock("@/ui/organisms/excalidraw-board", () => ({
	ExcalidrawBoard: ({ label }: { label?: string }) => <div role="img" aria-label={label} />,
}));
vi.mock("@/ui/organisms/excalidraw-canvas", () => ({ sceneSvg: async () => "" }));

const files = () => mockState().design.files;

describe("Design / Diagrams formats", () => {
	it("starts a new board on the default format and converts it into another file", async () => {
		const user = userEvent.setup();
		mockState().prefs.diagramFormat = "bpmn";
		await mountDesign(<Diagrams />);
		await user.click(await screen.findByRole("button", { name: "BPMN" }));
		const dialog = within(await screen.findByRole("dialog"));
		await user.type(dialog.getByRole("textbox", { name: "Name" }), "Flow");
		expect(dialog.getByRole("combobox", { name: "Format" })).toHaveTextContent("BPMN");
		await user.click(dialog.getByRole("button", { name: "Create" }));
		await waitFor(() => expect(files()["docs/diagrams/flow.bpmn"]?.text).toContain("<bpmn:task"));
		await user.click(
			await within(await screen.findByRole("main")).findByRole("button", { name: "Open" }),
		);
		await user.click(await screen.findByRole("button", { name: /Change the format/ }));
		await user.click(await screen.findByRole("menuitem", { name: "Mermaid" }));
		await waitFor(() => expect(files()["docs/diagrams/flow.mmd"]?.text).toContain("flowchart LR"));
		expect(files()["docs/diagrams/flow.bpmn"]).toBeDefined();
	}, 20_000);
});
