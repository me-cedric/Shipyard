import { screen, waitFor, within } from "@testing-library/react";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

describe("Flow / Health at its address, for a role with no code right (spec:app-redesign#REQ-023)", () => {
	it("opens for a tester and shows the gates with Run off", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mockState().person = {
			member: "tess",
			found: "email",
			role: "qa",
			admin: false,
			readOnly: false,
			rights: [],
			access: {
				work: "read",
				plan: "read",
				specs: "read",
				design: "read",
				knowledge: "read",
				code: "none",
				runs: "none",
				settings: "none",
				costs: "none",
				merge: false,
				approve: false,
			},
		};
		const router = mountApp("/flow/health");
		const lint = await screen.findByRole("group", { name: "Lint" });
		// The shell did not send the tester away from the page.
		expect(router.state.location.pathname).toBe("/flow/health");
		const run = within(lint).getByRole("button", { name: "Run Lint" });
		expect(run).toBeDisabled();
		expect(run).toHaveAccessibleDescription("Your role, Tester, cannot start agents.");
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});
