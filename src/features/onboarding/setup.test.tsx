import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { withTracker } from "@/test/tracker";

const s = en.onboarding.setup;
const o = en.onboarding;

/** Everything is set but the team: a tracker, a code host, an AI tool, the permissions. */
async function allButTeam() {
	await withTracker();
	await unwrap(
		commands.connectionsAdd({
			name: "Hub",
			group: "forge",
			kind: "github",
			url: "https://github.com",
			user: null,
		}),
	);
	const st = mockState();
	st.prefs.defaultAgent = "claude";
	for (const p of st.permissions) p.state = "on";
}

const row = async (name: string) => within(await screen.findByRole("group", { name }));

describe("Setup", () => {
	it("shows to do for each item of a fresh machine in Settings / Me", async () => {
		mountApp("/settings/me");
		for (const id of ["project", "ai", "tracker", "forge", "permissions"] as const) {
			const r = await row(s.item[id]);
			expect(await r.findByText(s.todo)).toBeInTheDocument();
		}
	});

	it("shows done once the setting is made", async () => {
		await allButTeam();
		mountApp("/settings/me");
		for (const id of ["project", "ai", "models", "tracker", "forge", "permissions"] as const) {
			const r = await row(s.item[id]);
			expect(await r.findByText(s.done)).toBeInTheDocument();
		}
		expect(await (await row(s.item.team)).findByText(s.todo)).toBeInTheDocument();
	});

	it("picks the AI tool in place on Today, and the item goes away", async () => {
		const user = userEvent.setup();
		await allButTeam();
		mockState().prefs.defaultAgent = "";
		mountApp("/home/today");
		const card = within(await screen.findByRole("region", { name: s.title }));
		await user.click(await card.findByRole("combobox", { name: en.personal.prefs.defaultAgent }));
		await user.click(await screen.findByRole("option", { name: "Claude Code" }));
		await waitFor(() => expect(mockState().prefs.defaultAgent).toBe("claude"));
		await waitFor(() => expect(card.queryByRole("group", { name: s.item.ai })).toBeNull());
	});

	it("adds the person as the admin, then the card is gone", async () => {
		const user = userEvent.setup();
		await allButTeam();
		mountApp("/home/today");
		const card = within(await screen.findByRole("region", { name: s.title }));
		await user.click(await card.findByRole("button", { name: s.action.team }));
		await waitFor(() => expect(mockState().work?.team.members[0]?.admin).toBe(true));
		await waitFor(() => expect(screen.queryByRole("region", { name: s.title })).toBeNull());
	});

	it("opens the sections: models, the issue tracker form and the new project creator", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().prefs.defaultAgent = "claude";
		mockState().factory.tiers.forEach((t) => {
			t.top = t.mid = t.small = "";
		});
		const router = mountApp("/home/today");
		const card = within(await screen.findByRole("region", { name: s.title }));
		await user.click(await card.findByRole("button", { name: s.action.models }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/settings/agents-rules"));
		expect(router.state.location.hash).toBe("tiers");
		await router.navigate({ to: "/home/today" });
		const again = within(await screen.findByRole("region", { name: s.title }));
		await user.click(await again.findByRole("button", { name: s.action.connect }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/settings/connections"));
		expect(await screen.findByRole("combobox", { name: en.connections.field.type })).toBeVisible();
	});

	it("starts the creator from the tour and shows the items on their steps", async () => {
		const user = userEvent.setup();
		mockState().prefs.tourSeen = false;
		const router = mountApp("/home/today");
		const dialog = await screen.findByRole("dialog", { name: o.steps.loop.title });
		await user.click(within(dialog).getByRole("button", { name: o.next }));
		const step = await screen.findByRole("dialog", { name: o.steps.project.title });
		await user.click(await within(step).findByRole("button", { name: s.action.project }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/home/projects"));
		await waitFor(() =>
			expect(screen.queryByRole("dialog", { name: o.steps.project.title })).toBeNull(),
		);
		expect(await screen.findByRole("dialog", { name: en.creator.title })).toBeInTheDocument();
	});

	it("speaks French", async () => {
		mockState().prefs.lang = "fr";
		mountApp("/settings/me");
		expect(await screen.findByRole("group", { name: "Outil de suivi" })).toBeInTheDocument();
	});
});
