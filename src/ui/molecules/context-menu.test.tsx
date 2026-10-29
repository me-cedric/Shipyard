import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test-utils";
import { ContextMenu } from "./context-menu";

describe("ContextMenu", () => {
	it("opens on a secondary click, lists the actions with their shortcut and runs one", async () => {
		const onSelect = vi.fn();
		renderApp(
			<ContextMenu items={[{ id: "copy", label: "Copy ref", shortcut: "⌘C", onSelect }]}>
				<button type="button">Row</button>
			</ContextMenu>,
		);
		fireEvent.contextMenu(screen.getByRole("button", { name: "Row" }));
		const item = await screen.findByRole("menuitem", { name: /Copy ref/ });
		expect(item).toHaveTextContent("⌘C");
		await userEvent.click(item);
		expect(onSelect).toHaveBeenCalledOnce();
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
	});

	it("opens from the keyboard and Escape returns the focus to the row", async () => {
		renderApp(
			<ContextMenu items={[{ id: "open", label: "Open", onSelect: () => {} }]}>
				<button type="button">Row</button>
			</ContextMenu>,
		);
		const row = screen.getByRole("button", { name: "Row" });
		row.focus();
		// The context-menu key and Shift+F10 make the browser fire `contextmenu` on the focused element.
		fireEvent.contextMenu(row);
		await screen.findByRole("menu");
		await userEvent.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
		expect(row).toHaveFocus();
	});

	it("adds nothing around a row that has no action", () => {
		renderApp(
			<ContextMenu items={[]}>
				<button type="button">Row</button>
			</ContextMenu>,
		);
		fireEvent.contextMenu(screen.getByRole("button", { name: "Row" }));
		expect(screen.queryByRole("menu")).toBeNull();
	});
});
