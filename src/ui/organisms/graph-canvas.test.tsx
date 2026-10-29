import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test-utils";
import { type CanvasNode, GraphCanvas } from "./graph-canvas";

const labels = {
	table: "Table view",
	name: "Name",
	kind: "Kind",
	links: "Links",
	orphan: "Orphan",
	stale: "Stale",
};
const kinds = [
	{ id: "adr", label: "ADR" },
	{ id: "spec", label: "Spec" },
];
const nodes: CanvasNode[] = [
	{ id: "adr:1", kind: "adr", label: "adr:1", name: "ADR adr:1" },
	{ id: "spec:a", kind: "spec", label: "spec:a", name: "Spec spec:a", stale: true },
	{ id: "spec:b", kind: "spec", label: "spec:b", name: "Spec spec:b", orphan: true },
];
const links: [string, string][] = [
	["spec:a", "adr:1"],
	["spec:b", "adr:1"],
];

function mount(onOpen = () => {}, selected: string | null = null) {
	return renderApp(
		<GraphCanvas
			nodes={nodes}
			links={links}
			kinds={kinds}
			label="Graph"
			labels={labels}
			selected={selected}
			onOpen={onOpen}
		/>,
	);
}

// jsdom measures no node, so xyflow keeps each one hidden.
const node = async (id: string) =>
	within(await screen.findByTestId(`rf__node-${id}`)).getByRole("button", { hidden: true });

const matchMedia = (reduce: boolean) => {
	window.matchMedia = ((query: string) => ({
		matches: reduce && query.includes("reduced-motion"),
		media: query,
	})) as typeof window.matchMedia;
};

describe("GraphCanvas", () => {
	beforeEach(() => matchMedia(false));

	it("opens a node on click and Enter, and marks the selected one", async () => {
		const user = userEvent.setup();
		const open = vi.fn();
		mount(open, "adr:1");
		const adr = await node("adr:1");
		expect(adr).toHaveAttribute("aria-pressed", "true");
		const stale = await node("spec:a");
		expect(stale).toHaveAttribute("aria-pressed", "false");
		expect(stale).toHaveAttribute("aria-label", "Spec spec:a, Stale");
		await user.click(adr);
		adr.focus();
		await user.keyboard("{Enter}");
		expect(open).toHaveBeenCalledWith("adr:1");
		expect(open).toHaveBeenCalledTimes(2);
	});

	it("moves the focus along the links with the arrows", async () => {
		const user = userEvent.setup();
		mount();
		const a = await node("spec:a");
		a.focus();
		await user.keyboard("{ArrowRight}");
		expect(await node("adr:1")).toHaveFocus();
		await user.keyboard("{ArrowLeft}");
		expect(a).toHaveFocus();
		await user.keyboard("{ArrowDown}");
		expect(await node("spec:b")).toHaveFocus();
	});

	it("shows each kind with its own shape and the marks as text", async () => {
		mount();
		const shapes = (await screen.findAllByRole("img", { hidden: true }))
			.filter((i) => ["ADR", "Spec"].includes(i.getAttribute("aria-label") ?? ""))
			.map((i) => `${i.getAttribute("aria-label")}:${i.innerHTML}`);
		expect(new Set(shapes).size).toBe(2);
		expect(within(await node("spec:b")).getByLabelText("Orphan")).toBeInTheDocument();
	});

	it("lists every node with its links in the table view", async () => {
		const user = userEvent.setup();
		const open = vi.fn();
		mount(open);
		await user.click(await screen.findByRole("button", { name: "Table view" }));
		const table = screen.getByRole("table", { name: "Table view" });
		const rows = within(table).getAllByRole("row");
		expect(rows).toHaveLength(nodes.length + 1);
		expect(within(rows[2] as HTMLElement).getByText("adr:1")).toBeInTheDocument();
		await user.click(within(table).getByRole("button", { name: "ADR adr:1" }));
		expect(open).toHaveBeenCalledWith("adr:1");
	});

	it("removes the animation under reduced motion", async () => {
		matchMedia(true);
		mount();
		expect(await screen.findByRole("region", { name: "Graph" })).toHaveAttribute(
			"data-motion",
			"reduced",
		);
		fireEvent.keyDown(screen.getByRole("region", { name: "Graph" }), { key: "ArrowDown" });
	});
});
