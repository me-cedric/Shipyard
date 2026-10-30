import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

describe("Settings / Project: auto-commit", () => {
	it("is off by default and turns on with one switch", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/settings/project");
		const toggle = await screen.findByRole("switch", { name: "Auto-commit" });
		await waitFor(() => expect(toggle).not.toBeChecked());
		await user.click(toggle);
		await waitFor(() => expect(mockState().autoCommit).toBe(true));
		expect(await screen.findByRole("switch", { name: "Auto-commit" })).toBeChecked();
	});

	it("commits before a sync only when the option is on", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		expect(await unwrap(commands.autoCommitRun())).toBeNull();
		await unwrap(commands.autoCommitSet(true));
		expect(await unwrap(commands.autoCommitRun())).not.toBeNull();
	});
});
