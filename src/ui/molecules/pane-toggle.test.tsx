import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test-utils";
import { EditorPreview } from "./pane-toggle";

describe("EditorPreview", () => {
	it("hides and shows each side with its button, and keeps one side visible", async () => {
		const user = userEvent.setup();
		renderApp(
			<EditorPreview
				id="test-sides"
				label="Resize"
				editor={<p>the editor</p>}
				preview={<p>the preview</p>}
			/>,
		);
		const editor = await screen.findByRole("button", { name: "Editor" });
		const preview = screen.getByRole("button", { name: "Preview" });
		expect(editor).toHaveAttribute("aria-pressed", "true");
		await user.click(editor);
		expect(screen.queryByText("the editor")).toBeNull();
		expect(screen.getByText("the preview")).toBeInTheDocument();
		// The last visible side cannot be hidden.
		await user.click(preview);
		expect(screen.getByText("the preview")).toBeInTheDocument();
		await user.click(editor);
		expect(screen.getByText("the editor")).toBeInTheDocument();
		await user.click(preview);
		expect(screen.queryByText("the preview")).toBeNull();
	});
});
