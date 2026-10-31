import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

const demo = () => unwrap(commands.projectsOpen("/mock/demo", false));

describe("Home / Needs you: agent review", () => {
	it("shows a draft review that waits, opens its pull request, and drops it once posted", async () => {
		const user = userEvent.setup();
		await demo();
		const draft = await unwrap(commands.prReviewStart(141, true));
		mountApp("/home/inbox");
		const group = (await screen.findByRole("heading", { name: "Agent reviews (1)" })).closest(
			"section",
		) as HTMLElement;
		expect(within(group).getByText("#141")).toBeVisible();
		expect(within(group).getByText(draft.title)).toBeVisible();
		await user.click(within(group).getByRole("button", { name: "Open the pull request" }));
		// The pull request page opens on that pull request, with the draft on it.
		expect(await screen.findByRole("heading", { name: /Agent review \(2\)/ })).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Post review" }));
		expect(await screen.findByText("Posted")).toBeVisible();
		await waitFor(async () => expect(await unwrap(commands.prReviewWaiting())).toEqual([]));
	});

	it("shows no group when no draft waits", async () => {
		await demo();
		mountApp("/home/inbox");
		await screen.findByRole("heading", { name: /^Needs you/ });
		expect(screen.queryByRole("heading", { name: /^Agent reviews/ })).toBeNull();
	});
});
