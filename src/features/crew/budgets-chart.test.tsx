import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "@/ui/test-utils";
import { niceTicks, SpendChart } from "./budgets-chart";

vi.mock("@/lib/factory", () => ({
	useMachineSpend: () => ({
		data: {
			rows: [
				{
					day: new Date().toISOString().slice(0, 10),
					runner: "claude",
					model: "m",
					project: "p",
					tokens: 10,
					costUsd: 3.2,
				},
			],
		},
		partial: null,
	}),
}));

describe("SpendChart", () => {
	it("rounds the ticks up from 0", () => {
		expect(niceTicks(3.2)).toEqual([0, 1, 2, 3, 4]);
		expect(niceTicks(0.01)).toEqual([0, 0.0025, 0.005, 0.0075, 0.01]);
	});

	it("gives each bar a name and shows it in a tooltip on focus", async () => {
		renderApp(<SpendChart prices />);
		const bars = screen.getAllByRole("img", { name: /: \$/ });
		expect(bars).toHaveLength(7);
		const last = bars[6] as HTMLElement;
		expect(last).toHaveAccessibleName(/: \$3\.20$/);
		const user = userEvent.setup();
		for (let i = 0; i < 20 && document.activeElement !== last; i++) await user.tab();
		expect(last).toHaveFocus();
		expect(await screen.findByText(/: \$3\.20$/)).toBeInTheDocument();
		expect(screen.getByText("$4.00")).toBeInTheDocument();
	});
});
