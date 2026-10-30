import { render, screen } from "@testing-library/react";
import { Providers } from "@/app/providers";
import { importAll, withTracker } from "@/test/tracker";
import { TicketThread } from "./ticket-thread";

describe("the ticket budget", () => {
	it("shows the time spent against the estimate and the ticket link", async () => {
		await withTracker();
		await importAll();
		render(
			<Providers>
				<TicketThread itemKey="ACME-3" />
			</Providers>,
		);
		const bar = await screen.findByRole("progressbar", { name: "Budget ACME-3" });
		expect(bar).toHaveAttribute("aria-valuenow", "360");
		expect(bar).toHaveAttribute("aria-valuemax", "480");
		expect(screen.getByText("6 h of 8 h")).toBeInTheDocument();
		expect(await screen.findByText("Ticket feat-sync")).toBeInTheDocument();
	});

	it("shows no bar for a ticket with no estimate", async () => {
		await withTracker();
		await importAll();
		render(
			<Providers>
				<TicketThread itemKey="ACME-1" />
			</Providers>,
		);
		await screen.findByRole("list", { name: "Comments" });
		expect(screen.queryByRole("progressbar")).toBeNull();
	});
});
