import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { clearViewState, setViewProject } from "@/lib/shell/view-state";
import { renderApp } from "../test-utils";
import { EditorPreview } from "./pane-toggle";

const view = (needText = false) => (
	<EditorPreview
		id="test-sides"
		label="Resize"
		editor={<p>the editor</p>}
		preview={<p>the preview</p>}
		needText={needText}
	/>
);
const pick = (name: string) => screen.getByRole("button", { name });

function Host() {
	const [need, setNeed] = useState(false);
	return (
		<>
			<button type="button" onClick={() => setNeed(true)}>
				need
			</button>
			{view(need)}
		</>
	);
}

afterEach(() => {
	clearViewState();
	setViewProject("");
});

describe("EditorPreview", () => {
	it("opens on the picture alone, and one switch shows the text or both (spec:app-redesign#REQ-021)", async () => {
		const user = userEvent.setup();
		renderApp(view());
		expect(await screen.findByText("the preview")).toBeInTheDocument();
		expect(screen.queryByText("the editor")).toBeNull();
		expect(pick("Picture")).toHaveAttribute("aria-pressed", "true");
		expect(pick("Picture")).toHaveClass("min-h-control");
		await user.click(pick("Text"));
		expect(screen.getByText("the editor")).toBeInTheDocument();
		expect(screen.queryByText("the preview")).toBeNull();
		await user.click(pick("Both"));
		expect(screen.getByText("the editor")).toBeInTheDocument();
		expect(screen.getByText("the preview")).toBeInTheDocument();
		await user.click(pick("Picture"));
		expect(screen.queryByText("the editor")).toBeNull();
	});

	it("keeps the choice that a person stored", async () => {
		const user = userEvent.setup();
		setViewProject("p1");
		const first = renderApp(view());
		await user.click(await screen.findByRole("button", { name: "Text" }));
		first.unmount();
		renderApp(view());
		expect(await screen.findByText("the editor")).toBeInTheDocument();
		expect(screen.queryByText("the preview")).toBeNull();
	});

	it("reads a choice stored before the switch: both sides", async () => {
		setViewProject("p1");
		localStorage.setItem(
			"shipyard:view:p1:sides:test-sides",
			JSON.stringify({ editor: true, preview: true }),
		);
		renderApp(view());
		expect(await screen.findByText("the editor")).toBeInTheDocument();
		expect(pick("Both")).toHaveAttribute("aria-pressed", "true");
	});

	it("shows the text when an action needs it, until the person picks a side", async () => {
		const user = userEvent.setup();
		renderApp(<Host />);
		expect(screen.queryByText("the editor")).toBeNull();
		await user.click(pick("need"));
		expect(screen.getByText("the editor")).toBeInTheDocument();
		expect(screen.getByText("the preview")).toBeInTheDocument();
		await user.click(pick("Picture"));
		expect(screen.queryByText("the editor")).toBeNull();
	});
});
