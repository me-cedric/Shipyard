import { screen, within } from "@testing-library/react";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

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
		// A card is one button; a card that needs a person is an article around its title button.
		// A card that waits for a person is an article around its title button (title and key, exact).
		const cardOf = (title: HTMLElement) => {
			const card = title.closest("article");
			if (!card) throw new Error("the card of a run that waits is an article");
			return card;
		};
		const asking = cardOf(
			await build.findByRole("button", { name: /^Fix login redirect\s*ACME-\d+$/ }),
		);
		expect(within(asking).getByText("Answer a question")).toBeInTheDocument();
		const working = cardOf(
			await build.findByRole("button", { name: /^Add export endpoint\s*ACME-\d+$/ }),
		);
		expect(within(working).getByText("Approve 2 actions")).toBeInTheDocument();
		const review = await lane("Review");
		expect(
			within(
				cardOf(await review.findByRole("button", { name: /^Add the health dot\s*ACME-\d+$/ })),
			).getByText("Approve 1 action"),
		).toBeInTheDocument();
	});
});
