import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "@/app/providers";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { DeviceCode } from "./connection-form";

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
		// The code has the Copy button and copies on a click.
		expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
		expect(mockState().openedPages).toEqual(["https://github.com/login/device"]);
		await waitFor(() => expect(mockState().secrets["acme-forge"]).toBe("device-token"), {
			timeout: 5000,
		});
		// One sign-in serves both roles: the issue tracker of the host got the same secret.
		expect(
			await screen.findAllByRole("group", { name: "Acme forge" }, { timeout: 5000 }),
		).toHaveLength(2);
		expect(
			mockState()
				.connections.map((c) => c.group)
				.sort(),
		).toEqual(["forge", "tracker"]);
		expect(mockState().secrets["acme-forge-2"]).toBe("device-token");
		expect(within(document.body).queryByText("device-token")).toBeNull();
	}, 20_000);

	it("copies the sign-in code from the button and from the code, and shows Copied for 1.5 s", async () => {
		const user = userEvent.setup();
		render(
			<Providers>
				<DeviceCode code="AB-12" />
			</Providers>,
		);
		await user.click(await screen.findByRole("button", { name: "Code AB-12" }));
		expect(await navigator.clipboard.readText()).toBe("AB-12");
		expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();
		await waitFor(() => expect(screen.getByRole("button", { name: "Copy" })).toBeVisible(), {
			timeout: 3000,
		});
		await navigator.clipboard.writeText("other");
		await user.click(screen.getByRole("button", { name: "Copy" }));
		expect(await navigator.clipboard.readText()).toBe("AB-12");
		expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();
	});

	it("offers no browser sign-in for a product that has none", async () => {
		const user = userEvent.setup();
		mountApp("/settings/connections");
		await user.click(await screen.findByRole("button", { name: "Connection" }));
		await user.click(screen.getByRole("combobox", { name: "Product" }));
		await user.click(await screen.findByRole("option", { name: "Linear" }));
		expect(screen.queryByRole("button", { name: "Sign in with the browser" })).toBeNull();
	});
});
