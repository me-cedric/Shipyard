import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { CommandPalette } from "./command-palette";

describe("CommandPalette", () => {
	it("shows the group count and selects an item", async () => {
		const onSelect = vi.fn();
		const onOpenChange = vi.fn();
		renderApp(
			<CommandPalette
				open
				onOpenChange={onOpenChange}
				groups={[
					{
						id: "g",
						heading: "Go",
						items: [
							{ id: "a", label: "Alpha", onSelect },
							{ id: "b", label: "Beta", onSelect: () => {} },
						],
					},
				]}
			/>,
		);
		expect(screen.getByText("Go (2)")).toBeInTheDocument();
		await userEvent.click(screen.getByText("Alpha"));
		expect(onSelect).toHaveBeenCalledOnce();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("closes on Escape", async () => {
		const onOpenChange = vi.fn();
		renderApp(<CommandPalette open onOpenChange={onOpenChange} groups={[]} />);
		await userEvent.keyboard("{Escape}");
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
