import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

describe("Settings / Connections: browser sign-in", () => {
	it("signs in with the browser and keeps the token in the keychain", async () => {
		const user = userEvent.setup();
		mountApp("/settings/connections");
		await user.click(await screen.findByRole("button", { name: "Connection" }));
		await user.click(screen.getByRole("combobox", { name: "Type" }));
		await user.click(await screen.findByRole("option", { name: "Code host" }));
		await user.type(screen.getByRole("textbox", { name: "Name" }), "Acme forge");
		await user.type(screen.getByRole("textbox", { name: "Address" }), "https://github.com");
		await user.click(screen.getByRole("button", { name: "Sign in with the browser" }));
		expect(await screen.findByText("Code AB-12", {}, { timeout: 3000 })).toBeInTheDocument();
		expect(mockState().openedPages).toEqual(["https://github.com/login/device"]);
		await waitFor(() => expect(mockState().secrets["acme-forge"]).toBe("device-token"), {
			timeout: 5000,
		});
		expect(
			await screen.findByRole("group", { name: "Acme forge" }, { timeout: 5000 }),
		).toBeVisible();
		expect(within(document.body).queryByText("device-token")).toBeNull();
	}, 20_000);

	it("offers no browser sign-in for a product that has none", async () => {
		const user = userEvent.setup();
		mountApp("/settings/connections");
		await user.click(await screen.findByRole("button", { name: "Connection" }));
		await user.click(screen.getByRole("combobox", { name: "Product" }));
		await user.click(await screen.findByRole("option", { name: "Linear" }));
		expect(screen.queryByRole("button", { name: "Sign in with the browser" })).toBeNull();
	});
});
