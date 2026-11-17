import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";
import { RunCard } from "@/ui/molecules/run-card";
import { renderApp } from "@/ui/test-utils";

async function renderRuns() {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	return mountApp("/factory/runs");
}
const lane = async (name: string) => within(await screen.findByRole("region", { name }));

describe("Delivery on the cards of Flow", () => {
	beforeEach(() => {
		window.matchMedia = ((query: string) => ({
			matches: false,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		})) as unknown as typeof window.matchMedia;
	});

	it("shows the checks of a pull request in the state of a card in Review (REQ-021, REQ-029)", async () => {
		await renderRuns();
		const review = await lane("Review");
		const failing = within(await review.findByRole("button", { name: /ACME-7/ }));
		expect(failing.getByText("Checks fail")).toBeInTheDocument();
		const passing = within(await review.findByRole("button", { name: /ACME-8/ }));
		expect(passing.getByText("Ready to merge")).toBeInTheDocument();
	});

	it("shows no pull request line on a card before review", async () => {
		await renderRuns();
		const card = within(
			await (await lane("Build")).findByRole("heading", { name: /Add export endpoint/ }),
		);
		expect(card.queryByText(/^#\d+$/)).toBeNull();
		expect(screen.queryByText(/^#\d+$/)).toBeNull();
	});

	it("says in plain words what a run waits for: a question, or approvals", async () => {
		await renderRuns();
		const build = await lane("Build");
		const asking = (await build.findByRole("heading", { name: "Fix login redirect" })).closest(
			"article",
		) as HTMLElement;
		expect(within(asking).getByText("Answer a question")).toBeInTheDocument();
		const working = (await build.findByRole("heading", { name: "Add export endpoint" })).closest(
			"article",
		) as HTMLElement;
		expect(within(working).getByText("Approve 2 actions")).toBeInTheDocument();
		const review = await lane("Review");
		expect(
			within(
				(await review.findByRole("heading", { name: "Add the health dot" })).closest(
					"article",
				) as HTMLElement,
			).getByText("Approve 1 action"),
		).toBeInTheDocument();
	});

	it("shows the draft flag, a status dot with its own shape, and opens with Enter (REQ-021, REQ-029)", async () => {
		const user = userEvent.setup();
		const onOpen = vi.fn();
		renderApp(
			<RunCard
				itemKey="ACME-46"
				title="A draft"
				state="PROpen"
				costUsd={1}
				budgetUsd={5}
				questions={0}
				approvals={0}
				pr={{ number: 46, ci: "pending", review: "clear", draft: true }}
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

	it("shows no cost for a null cost, and stops a run from the menu after a confirmation", async () => {
		const user = userEvent.setup();
		const onStop = vi.fn();
		renderApp(
			<RunCard
				itemKey="ACME-1"
				title="A run"
				state="Working"
				step={{ n: 2, total: 5, name: "Build" }}
				costUsd={null}
				budgetUsd={5}
				questions={0}
				approvals={0}
				onOpen={() => {}}
				onStop={onStop}
			/>,
		);
		expect(screen.queryByText(/\$/)).toBeNull();
		expect(screen.getByText("ACME-1")).toBeVisible();
		expect(screen.getByText("2 of 5")).toBeVisible();
		expect(screen.getByText("Build")).toBeVisible();
		await user.click(screen.getByRole("button", { name: "More actions" }));
		await user.click(await screen.findByRole("menuitem", { name: "Stop" }));
		expect(onStop).not.toHaveBeenCalled();
		await user.click(await screen.findByRole("button", { name: "Stop ACME-1?" }));
		expect(onStop).toHaveBeenCalledTimes(1);
	});

	it("leads the step line with the workflow, and gives the clamped text a title", () => {
		renderApp(
			<RunCard
				itemKey="ACME-3"
				title="A long title"
				state="Working"
				workflow="Feature"
				step={{ n: 1, total: 3, name: "Build" }}
				costUsd={null}
				budgetUsd={null}
				questions={0}
				approvals={0}
				onOpen={() => {}}
			/>,
		);
		expect(screen.getByText("Feature · Build")).toHaveAttribute("title", "Feature · Build");
		expect(screen.getByText("A long title")).toHaveAttribute("title", "A long title");
	});

	it("gives the right-click menu the items of the button menu, Stop too", async () => {
		const user = userEvent.setup();
		renderApp(
			<RunCard
				itemKey="ACME-3"
				title="A run"
				state="Working"
				costUsd={null}
				budgetUsd={null}
				questions={0}
				approvals={0}
				onOpen={() => {}}
				onStop={() => {}}
			/>,
		);
		await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("group") });
		expect(await screen.findByRole("menuitem", { name: "Stop" })).toBeVisible();
	});
});
