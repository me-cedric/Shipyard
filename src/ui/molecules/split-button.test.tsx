import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test-utils";
import { SplitButton } from "./split-button";

const setup = () => {
	const main = vi.fn();
	const fetch = vi.fn();
	renderApp(
		<SplitButton
			label="Sync"
			onClick={main}
			moreLabel="More ways to sync"
			items={[{ id: "fetch", label: "Fetch only", onSelect: fetch }]}
		/>,
	);
	return { main, fetch };
};

describe("SplitButton", () => {
	it("runs the main action from the main part only", async () => {
		const { main } = setup();
		await userEvent.click(screen.getByRole("button", { name: "Sync" }));
		expect(main).toHaveBeenCalledOnce();
		expect(screen.queryByRole("menu")).toBeNull();
	});

	it("opens the list from the arrow part and runs an item", async () => {
		const { main, fetch } = setup();
		await userEvent.click(screen.getByRole("button", { name: "More ways to sync" }));
		await userEvent.click(await screen.findByRole("menuitem", { name: "Fetch only" }));
		expect(fetch).toHaveBeenCalledOnce();
		expect(main).not.toHaveBeenCalled();
	});

	it("works from the keyboard: Tab to the arrow, Enter opens, Escape closes", async () => {
		const { main } = setup();
		await userEvent.tab();
		expect(screen.getByRole("button", { name: "Sync" })).toHaveFocus();
		await userEvent.tab();
		const more = screen.getByRole("button", { name: "More ways to sync" });
		expect(more).toHaveFocus();
		await userEvent.keyboard("{Enter}");
		expect(await screen.findByRole("menuitem", { name: "Fetch only" })).toBeInTheDocument();
		await userEvent.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
		expect(main).not.toHaveBeenCalled();
	});
});
