import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { dataFolderAfterRestart } from "@/lib/ipc/mock-extras";

import { mountApp } from "@/test/mount";

const folderNow = () => dataFolderAfterRestart(mockState().extras);

const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));
const OLD = "/Users/ada/Library/Application Support/dev.shipyard.app";

// spec:shell-setup-rights#REQ-008: Change beside the data folder, and the Portable mode switch.
describe("Setup / Me / Look and layout: the data folder", () => {
	it("moves the data to the picked folder after a confirmation", async () => {
		const user = userEvent.setup();
		const router = mountApp("/setup/me?page=look");
		mockState().nextFolder = "/Users/ada/Shipyard data";
		await user.click(await screen.findByRole("button", { name: "Change the data folder" }));
		await waitFor(() => expect(folderNow()).toBe("/Users/ada/Shipyard data"));
		expect(mockState().asked).toEqual([
			"Move the data to /Users/ada/Shipyard data and restart Shipyard?",
		]);
		await idle(router);
	});

	it("keeps the data when the person cancels", async () => {
		const user = userEvent.setup();
		mockState().confirm = false;
		const router = mountApp("/setup/me?page=look");
		mockState().nextFolder = "/Users/ada/Shipyard data";
		await user.click(await screen.findByRole("button", { name: "Change the data folder" }));
		await waitFor(() => expect(mockState().asked).toHaveLength(1));
		expect(folderNow()).toBe(OLD);
		await idle(router);
	});

	it("refuses a folder inside the data folder and a call that is not a click", async () => {
		await expect(unwrap(commands.appDataFolderMove(`${OLD}/sub`, true))).rejects.toBeDefined();
		await expect(unwrap(commands.appDataFolderMove("/Users/ada/x", false))).rejects.toBeDefined();
		await expect(unwrap(commands.appDataFolderMove("relative", true))).rejects.toBeDefined();
		expect(folderNow()).toBe(OLD);
	});

	it("writes and removes the portable marker with the switch", async () => {
		const user = userEvent.setup();
		const router = mountApp("/setup/me?page=look");
		const portable = await screen.findByRole("switch", { name: "Portable mode" });
		expect(portable).not.toBeChecked();
		await user.click(portable);
		await waitFor(async () => expect((await unwrap(commands.appDataFolder())).marker).toBe(true));
		await waitFor(() =>
			expect(screen.getByRole("switch", { name: "Portable mode" })).toBeChecked(),
		);
		// With the marker on, a Change is refused: the marker wins.
		await expect(unwrap(commands.appDataFolderMove("/Users/ada/y", true))).rejects.toBeDefined();
		await user.click(screen.getByRole("switch", { name: "Portable mode" }));
		await waitFor(async () => expect((await unwrap(commands.appDataFolder())).marker).toBe(false));
		await idle(router);
	});
});
