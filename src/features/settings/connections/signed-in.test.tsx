import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

/** One signed-in code host. */
async function host() {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	const c = await unwrap(
		commands.connectionsAdd({
			name: "Code",
			group: "forge",
			kind: "github",
			url: "https://github.com",
			user: null,
		}),
	);
	await unwrap(commands.connectionsSetSecret(c.id, "tok-device"));
	return c.id;
}

describe("Settings / Computer: Device sign-in of a signed-in code host", () => {
	it("shows Signed in, and offers Sign out and Use another account instead of Sign in", async () => {
		const user = userEvent.setup();
		const id = await host();
		mountApp("/setup/computer");
		expect(await screen.findByText("Signed in")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Sign in: Code" })).toBeNull();
		expect(screen.getByRole("button", { name: "Use another account: Code" })).toBeEnabled();

		mockState().confirm = false;
		await user.click(screen.getByRole("button", { name: "Sign out: Code" }));
		await waitFor(() => expect(mockState().asked).toEqual(["Remove the sign-in of Code?"]));
		expect(mockState().secrets[id]).toBe("tok-device");

		mockState().confirm = true;
		await user.click(screen.getByRole("button", { name: "Sign out: Code" }));
		await waitFor(() => expect(mockState().secrets[id]).toBeUndefined());
		expect(await screen.findByRole("button", { name: "Sign in: Code" })).toBeInTheDocument();
		expect(screen.queryByText("Signed in")).toBeNull();
	});

	it("starts the same sign-in again with Use another account", async () => {
		const user = userEvent.setup();
		await host();
		mountApp("/setup/computer");
		await user.click(await screen.findByRole("button", { name: "Use another account: Code" }));
		expect(await screen.findByText("Code AB-12", {}, { timeout: 3000 })).toBeInTheDocument();
		expect(mockState().openedPages).toEqual(["https://github.com/login/device"]);
	}, 20_000);
});
