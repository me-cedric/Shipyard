import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

const f = en.library.fn.flows;
const FLOWS = "docs/flows/network.yaml";

const open = async () => {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	const router = mountApp("/library/flows/matrix");
	await screen.findByRole("table");
	await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(21));
	return router;
};
/** The row of a flow by its source and its destination. */
const rowOf = (from: string, to: string) =>
	screen.getAllByRole("row").find((r) => r.textContent?.includes(from + to)) as HTMLElement;
const USERS = "10.10.0.0/24";

// spec:library-functions#REQ-011
describe("Check against the code of the flow matrix", () => {
	it("shows an alert card with Show it and Ask for the change when a denied flow is used", async () => {
		const user = userEvent.setup();
		const router = await open();
		expect(screen.queryByRole("heading", { name: f.usedOne })).toBeNull();
		await user.click(screen.getByRole("button", { name: f.check }));
		const heading = await screen.findByRole("heading", { name: f.usedOne });
		const card = within(heading.closest("article") as HTMLElement);
		expect(card.getByRole("button", { name: f.show })).toBeVisible();
		expect(card.getByRole("button", { name: f.ask })).toBeVisible();
		// The result stays: it is stored for the table.
		expect((await unwrap(commands.designFlowsChecked(FLOWS)))?.rows).toHaveLength(20);
		await user.click(card.getByRole("button", { name: f.show }));
		expect(rowOf(USERS, "10.20.0.20/32")).toHaveAttribute("aria-current", "true");
		await user.click(card.getByRole("button", { name: f.ask }));
		expect(await screen.findByDisplayValue(/10\.10\.0\.0\/24 to 10\.20\.0\.20/)).toBeVisible();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("shows the chip Not in the code on an allowed flow that no code calls", async () => {
		const user = userEvent.setup();
		const router = await open();
		expect(within(rowOf(USERS, "10.20.0.10/32")).queryByText(f.notInCode)).toBeNull();
		await user.click(screen.getByRole("button", { name: f.check }));
		expect(await within(rowOf(USERS, "10.20.0.10/32")).findByText(f.notInCode)).toBeVisible();
		// A flow that the code calls shows no chip.
		expect(within(rowOf(USERS, "10.20.0.53/32")).queryByText(f.notInCode)).toBeNull();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("keeps only the flows that no code calls when the chip is on", async () => {
		const user = userEvent.setup();
		await open();
		await user.click(screen.getByRole("button", { name: f.check }));
		await user.click(await screen.findByRole("button", { name: f.notInCode }));
		// Only a flow with a host that the code does not call stays: the networks have no host.
		const rows = (await screen.findAllByRole("row")).slice(1);
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.length).toBeLessThan(20);
		for (const r of rows) expect(within(r).getByText(f.notInCode)).toBeVisible();
	});
});
