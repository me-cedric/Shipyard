import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import { mountKnowledge } from "./harness";

const f = en.library.fn.dashboards;

// spec:library-functions#REQ-009
describe("Pin a dashboard to Today", () => {
	it("shows one card with the three tiles of the dashboard on Today", async () => {
		const user = userEvent.setup();
		const router = await mountKnowledge("dashboards", "/library/dashboards/team-delivery/edit");
		await user.click(await screen.findByRole("button", { name: f.pinToday }));
		expect(await screen.findByRole("button", { name: f.unpinToday })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await router.navigate({ to: "/home/today" });
		const card = await screen.findByRole("region", { name: "Delivery" });
		for (const tile of ["Tickets", "Runs", "Questions"])
			expect(await within(card).findByRole("region", { name: tile })).toBeVisible();
		expect(within(card).getAllByRole("region")).toHaveLength(3);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("takes the card off Today when the person unpins the dashboard", async () => {
		const user = userEvent.setup();
		const router = await mountKnowledge("dashboards", "/library/dashboards/team-delivery/edit");
		await user.click(await screen.findByRole("button", { name: f.pinToday }));
		await user.click(await screen.findByRole("button", { name: f.unpinToday }));
		await router.navigate({ to: "/home/today" });
		await screen.findByRole("heading", { level: 1, name: /^(Today|\d+ things? needs? you)$/ });
		expect(screen.queryByRole("region", { name: "Delivery" })).toBeNull();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});
