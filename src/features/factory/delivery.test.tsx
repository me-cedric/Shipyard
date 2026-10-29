import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { ShellProvider } from "@/lib/shell";
import { RunCard } from "@/ui/molecules/run-card";
import { renderApp } from "@/ui/test-utils";
import { Runs } from "./index";

async function renderRuns() {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	return renderApp(
		<ShellProvider>
			<Runs />
		</ShellProvider>,
	);
}
const lane = async (name: string) => within(await screen.findByRole("region", { name }));

describe("Delivery on the run cards", () => {
	it("shows the pull request, CI and review state in In review (REQ-021, REQ-029)", async () => {
		await renderRuns();
		const review = await lane("In review");
		const failing = within(await review.findByRole("button", { name: /ACME-7/ }));
		expect(failing.getByText("pr:github:43")).toBeInTheDocument();
		expect(failing.getByText("CI failing")).toBeInTheDocument();
		expect(failing.getByText("Review clear")).toBeInTheDocument();
		const asked = within(review.getByRole("button", { name: /ACME-5/ }));
		expect(asked.getByText("Changes requested", { selector: "span" })).toBeInTheDocument();
	});

	it("puts a passing, clear pull request in Ready to merge", async () => {
		await renderRuns();
		const ready = within(
			(await (
				await lane("Ready to merge")
			).findByRole("button", { name: /ACME-8/ })) as HTMLElement,
		);
		expect(ready.getByText("pr:github:42")).toBeInTheDocument();
		expect(ready.getByText("CI passing")).toBeInTheDocument();
		expect(ready.getByText("Review clear")).toBeInTheDocument();
	});

	it("shows no pull request line in a lane before review", async () => {
		await renderRuns();
		const card = within(await (await lane("Working")).findByRole("button", { name: /ACME-2/ }));
		expect(card.queryByText(/^pr:/)).toBeNull();
	});

	it("shows the open questions and the approvals of a run", async () => {
		await renderRuns();
		const asking = within(
			await (await lane("Needs you")).findByRole("button", { name: /ACME-1(?!\d)/ }),
		);
		expect(asking.getByText("Questions 1")).toBeInTheDocument();
		const working = within(await (await lane("Working")).findByRole("button", { name: /ACME-10/ }));
		expect(working.getByText("Approvals 1")).toBeInTheDocument();
	});

	it("shows the draft flag, a status dot with its own shape, and opens with Enter (REQ-021, REQ-029)", async () => {
		const user = userEvent.setup();
		const onOpen = vi.fn();
		renderApp(
			<RunCard
				itemKey="ACME-46"
				title="A draft"
				state="PROpen"
				workflow="feature"
				costUsd={1}
				budgetUsd={5}
				questions={0}
				approvals={0}
				pr={{ reference: "pr:github:46", ci: "pending", review: "clear", draft: true }}
				onOpen={onOpen}
			/>,
		);
		expect(screen.getByText("Draft")).toBeInTheDocument();
		expect(screen.getByText("$1.00 / $5.00")).toBeInTheDocument();
		expect(screen.getByRole("img", { name: "CI pending" })).toHaveAttribute("data-shape", "ring");
		expect(screen.getByRole("img", { name: "Review clear" })).toHaveAttribute(
			"data-shape",
			"circle",
		);
		await user.tab();
		await user.keyboard("{Enter}");
		expect(onOpen).toHaveBeenCalledTimes(1);
	});
});
