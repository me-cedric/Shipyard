import { screen, waitFor, within } from "@testing-library/react";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { withTracker } from "@/test/tracker";

// spec:app-redesign#REQ-016: Rights holds the rights of the roles and the team file.
describe("Crew / Rights", () => {
	it("shows the rights of each role, with Edit, under the one heading Crew", async () => {
		await withTracker();
		const router = mountApp("/crew/rights");
		await waitFor(() => expect(router.state.status).toBe("idle"));
		const main = within(await screen.findByRole("main"));
		expect(await main.findByRole("table", { name: "Rights of each role" })).toBeInTheDocument();
		expect(main.getByRole("table", { name: "Members" })).toBeInTheDocument();
		expect(main.getByRole("button", { name: "Edit" })).toBeInTheDocument();
		const heads = main.getAllByRole("heading", { level: 1 });
		expect(heads).toHaveLength(1);
		expect(heads[0]).toHaveTextContent("Crew");
	});

	it("shows the changes of rights of the team file", async () => {
		await withTracker();
		mockState().audit = [
			{
				time: 1_700_000_000,
				member: null,
				found: "unknown",
				right: "work.edit",
				what: "work_transition",
				target: "ACME-1",
				result: "refused",
			},
		];
		const router = mountApp("/crew/rights");
		await waitFor(() => expect(router.state.status).toBe("idle"));
		const log = within(await screen.findByRole("table", { name: "Audit" }));
		expect(log.getByText("work_transition")).toBeInTheDocument();
	});

	it("gives a person who is not in the team file the banner and the request form", async () => {
		await withTracker();
		mockState().person = {
			member: null,
			found: "unknown",
			role: "viewer",
			admin: false,
			readOnly: false,
			rights: [],
		};
		const router = mountApp("/crew/rights");
		await waitFor(() => expect(router.state.status).toBe("idle"));
		expect(await screen.findByText("You are not in the team file")).toBeInTheDocument();
		expect(await screen.findByRole("form", { name: "Ask to join" })).toBeInTheDocument();
	});
});
