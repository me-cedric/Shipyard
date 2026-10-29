import { screen, within } from "@testing-library/react";
import { EditorFrame } from "../organisms/editor-frame";
import { renderApp } from "../test-utils";
import { Board } from "./board";
import { ListDetail } from "./list-detail";
import { Settings } from "./settings";
import { Shell } from "./shell";

describe("templates (REQ-006)", () => {
	it("Shell shows a sidebar, a main area and an inspector slot", () => {
		renderApp(
			<Shell sidebar={<a href="/">Home</a>} main={<p>Main</p>} inspector={<aside>Slot</aside>} />,
		);
		expect(screen.getByRole("navigation", { name: "Sidebar" })).toBeInTheDocument();
		expect(screen.getByRole("main")).toHaveTextContent("Main");
		expect(screen.getByText("Slot")).toBeInTheDocument();
	});

	it("Shell shows the context bar on top as the banner", () => {
		renderApp(<Shell contextbar={<button type="button">Sync</button>} sidebar="s" main="m" />);
		expect(screen.getByRole("banner")).toContainElement(
			screen.getByRole("button", { name: "Sync" }),
		);
	});

	it("Shell uses a 56 px rail or a 220 px sidebar", () => {
		const { unmount } = renderApp(<Shell sidebar="s" main="m" sidebarOpen />);
		const nav = screen.getByRole("navigation", { name: "Sidebar" });
		expect(nav.className).toContain("data-[open=true]:w-55");
		expect(nav.className).toContain("data-[open=false]:w-14");
		expect(nav).toHaveAttribute("data-open", "true");
		unmount();
		renderApp(<Shell sidebar="s" main="m" sidebarOpen={false} />);
		expect(screen.getByRole("navigation", { name: "Sidebar" })).toHaveAttribute(
			"data-open",
			"false",
		);
	});

	it("ListDetail names the view and shows the toolbar above the list", () => {
		renderApp(
			<ListDetail title="Backlog" toolbar={<button type="button">Filter</button>}>
				<p>rows</p>
			</ListDetail>,
		);
		expect(screen.getByRole("heading", { name: "Backlog" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
	});

	it("Board lays out its columns inside the list frame", () => {
		renderApp(
			<Board title="Board">
				<p>col 1</p>
				<p>col 2</p>
			</Board>,
		);
		expect(screen.getByRole("heading", { name: "Board" })).toBeInTheDocument();
		expect(screen.getByText("col 2").parentElement?.className).toContain("overflow-x-auto");
	});

	it("Settings shows each section heading with its count", () => {
		renderApp(
			<Settings
				sections={[
					{
						id: "me",
						title: "Me",
						rows: [
							{ id: "a", label: "Theme", control: <button type="button">A</button> },
							{ id: "b", label: "Density", control: <button type="button">B</button> },
						],
					},
				]}
			/>,
		);
		expect(screen.getByRole("heading", { name: "Me (2)" })).toBeInTheDocument();
		expect(
			within(screen.getByRole("region", { name: "Me (2)" })).getAllByRole("button"),
		).toHaveLength(2);
	});

	// The fifth template is the Editor: EditorFrame holds the one frame of every artifact (Q-094).
	it("Editor frames a title, a ref and a body", () => {
		renderApp(
			<EditorFrame
				title="Checkout"
				refId="spec:checkout"
				labels={{
					copy: "Copy ref",
					dirty: "Unsaved",
					conflict: "File changed on disk",
					reload: "Reload",
					keepMine: "Keep mine",
					line: "Line",
				}}
			>
				<p>body</p>
			</EditorFrame>,
		);
		expect(screen.getByText("spec:checkout")).toBeInTheDocument();
		expect(screen.getByText("body")).toBeInTheDocument();
	});
});
