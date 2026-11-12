import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";
import { ITEMS, remoteHost } from "./checklist";
import { openTour } from "./tour-store";

const s = en.onboarding.setup;
const o = en.onboarding;

/** A code host account. The mock links the first one to the open project. */
const addForge = () =>
	unwrap(
		commands.connectionsAdd({
			name: "Hub",
			group: "forge",
			kind: "github",
			url: "https://github.com",
			user: null,
		}),
	);

/** Everything is set but the team. */
async function allButTeam() {
	await withTracker();
	await importAll();
	await addForge();
	const st = mockState();
	st.prefs.defaultAgent = "claude";
	for (const p of st.permissions) p.state = "on";
}

const row = async (name: string) => within(await screen.findByRole("group", { name }));
const card = async () => within(await screen.findByRole("region", { name: s.title }));

describe("Get started checklist", () => {
	it("shows the eleven items in order in Settings / Me", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/settings/me");
		const items = within(await screen.findByRole("region", { name: s.title }));
		await waitFor(() => expect(items.getAllByRole("group")).toHaveLength(ITEMS.length));
		items.getAllByRole("group").forEach((g, i) => {
			expect(g).toHaveAccessibleName(s.item[ITEMS[i] ?? "project"]);
		});
		expect(screen.getByRole("progressbar", { name: /^Get started/ })).toBeVisible();
	});

	it("shows to do for each item of a fresh machine in Settings / Me", async () => {
		mountApp("/settings/me");
		for (const id of ["project", "ai", "tracker", "forge", "permissions"] as const) {
			const r = await row(s.item[id]);
			expect(await r.findByText(s.todo)).toBeInTheDocument();
		}
	});

	it("marks the same state on Today and in Settings / Me", async () => {
		await allButTeam();
		mountApp("/settings/me");
		for (const id of ITEMS.filter((i) => i !== "team")) {
			const r = await row(s.item[id]);
			expect(await r.findByText(s.done)).toBeInTheDocument();
		}
		expect(await (await row(s.item.team)).findByText(s.todo)).toBeInTheDocument();
		const router = mountApp("/home/today");
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("lists only what is to do on Today", async () => {
		await allButTeam();
		mountApp("/home/today");
		const today = await card();
		await today.findByRole("group", { name: s.item.team });
		expect(today.getAllByRole("group")).toHaveLength(1);
	});

	it("says Sign in for an AI tool that is signed out", async () => {
		await allButTeam();
		mockState().prefs.defaultAgent = "codex";
		const router = mountApp("/home/today");
		const user = userEvent.setup();
		const today = await card();
		await user.click(await today.findByRole("button", { name: s.action.signIn }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/settings/agents-rules"));
		expect(router.state.location.hash).toBe("tools");
	});

	it("asks before it installs an AI tool, and names what it installs", async () => {
		await allButTeam();
		mockState().prefs.defaultAgent = "copilot";
		mountApp("/home/today");
		const user = userEvent.setup();
		const today = await card();
		await user.click(await today.findByRole("button", { name: "Install GitHub Copilot" }));
		expect(mockState().agents.runners.find((r) => r.id === "copilot")?.state).toBe("missing");
		await user.click(
			await today.findByRole("button", {
				name: "Run npm install -g copilot to install GitHub Copilot?",
			}),
		);
		await waitFor(() =>
			expect(mockState().agents.runners.find((r) => r.id === "copilot")?.state).toBe("detected"),
		);
		await waitFor(() => expect(today.queryByRole("group", { name: s.item.ai })).toBeNull());
	});

	it("picks the AI tool in place on Today, and the item goes away", async () => {
		const user = userEvent.setup();
		await allButTeam();
		mockState().prefs.defaultAgent = "";
		mountApp("/home/today");
		const today = await card();
		await user.click(await today.findByRole("combobox", { name: en.personal.prefs.defaultAgent }));
		await user.click(await screen.findByRole("option", { name: "Claude Code" }));
		await waitFor(() => expect(mockState().prefs.defaultAgent).toBe("claude"));
		await waitFor(() => expect(today.queryByRole("group", { name: s.item.ai })).toBeNull());
	});

	it("adds the person as the admin, then the card is gone", async () => {
		const user = userEvent.setup();
		await allButTeam();
		mountApp("/home/today");
		const today = await card();
		await user.click(await today.findByRole("button", { name: s.action.team }));
		await waitFor(() => expect(mockState().work?.team.members[0]?.admin).toBe(true));
		await waitFor(() => expect(screen.queryByRole("region", { name: s.title })).toBeNull());
	});

	it("offers the team page with the member form beside Add me as admin", async () => {
		const user = userEvent.setup();
		await allButTeam();
		const router = mountApp("/home/today");
		const today = await card();
		expect(await today.findByRole("button", { name: s.action.team })).toBeInTheDocument();
		await user.click(await today.findByRole("button", { name: s.action.openTeam }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/work/team"));
		expect(await screen.findByRole("textbox", { name: "Handle" })).toBeInTheDocument();
	});

	it("offers Install and the runner page when no AI tool is set", async () => {
		const user = userEvent.setup();
		await allButTeam();
		mockState().prefs.defaultAgent = "";
		const router = mountApp("/home/today");
		const today = await card();
		expect(
			await today.findByRole("button", { name: "Install GitHub Copilot" }),
		).toBeInTheDocument();
		await user.click(await today.findByRole("button", { name: s.action.openRunner }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/settings/connections"));
		expect(router.state.location.hash).toBe("connections-runner");
	});

	it("links a done item to its page and marks the next item to do", async () => {
		const user = userEvent.setup();
		await allButTeam();
		const router = mountApp("/settings/me");
		const tracker = await row(s.item.tracker);
		await user.click(await tracker.findByRole("button", { name: `View ${s.item.tracker}` }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/settings/project"));
		expect(router.state.location.hash).toBe("issue-tracker");
	});

	it("marks the first item to do as the current step, and counts only the done ones", async () => {
		await allButTeam();
		mountApp("/settings/me");
		const team = await screen.findByRole("group", { name: s.item.team });
		await waitFor(() => expect(team).toHaveAttribute("aria-current", "step"));
		expect(document.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
		await waitFor(() =>
			expect(screen.getByRole("progressbar", { name: /^Get started/ })).toHaveAttribute(
				"aria-valuenow",
				String(ITEMS.length - 1),
			),
		);
	});

	it("opens the sections: models, then the code host form", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().prefs.defaultAgent = "claude";
		mockState().factory.tiers.forEach((t) => {
			t.top = t.mid = t.small = "";
		});
		const router = mountApp("/home/today");
		const today = await card();
		await user.click(await today.findByRole("button", { name: s.action.models }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/settings/agents-rules"));
		expect(router.state.location.hash).toBe("tiers");
		await router.navigate({ to: "/home/today" });
		const again = await card();
		await user.click(await again.findByRole("button", { name: s.action.connect }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/settings/connections"));
		// The item opens the add form on the code host, not on the issue tracker.
		expect(await screen.findByRole("combobox", { name: "Type" })).toHaveTextContent("Code host");
	});

	it("says Choose for a code host account that the project does not use yet", async () => {
		const user = userEvent.setup();
		await withTracker();
		await addForge();
		const settings = await unwrap(commands.projectSettings());
		if (!settings?.file) throw new Error("no project file");
		await unwrap(
			commands.projectFileSave({
				...settings.file,
				connections: { ...settings.file.connections, forge: null },
			}),
		);
		const router = mountApp("/home/today");
		const today = await card();
		await user.click(
			await within(await today.findByRole("group", { name: s.item.forge })).findByRole("button", {
				name: s.action.choose,
			}),
		);
		await waitFor(() => expect(router.state.location.pathname).toBe("/settings/project"));
		expect(router.state.location.hash).toBe("code-host");
	});

	it("connects the code host in one click from a detected gh login", async () => {
		const user = userEvent.setup();
		mockState().logins = [{ tool: "gh", host: "example.com", user: "ada" }];
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home/today");
		await user.click(await screen.findByRole("button", { name: "Connect with gh as ada" }));
		await waitFor(async () =>
			expect((await unwrap(commands.projectSettings()))?.file?.connections?.forge).toBeTruthy(),
		);
		const today = await card();
		await waitFor(() => expect(today.queryByRole("group", { name: s.item.forge })).toBeNull(), {
			timeout: 5000,
		});
	}, 15_000);

	it.each([
		["/settings/project#issue-tracker", "issue-tracker"],
		["/settings/project#code-host", "code-host"],
		["/settings/connections#connections-runner", "connections-runner"],
	])("%s has its anchor and takes the focus", async (path, id) => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp(path);
		await waitFor(() => expect(document.getElementById(id)).not.toBeNull());
		const el = document.getElementById(id) as HTMLElement;
		await waitFor(() => expect(el.contains(document.activeElement)).toBe(true));
	});

	it("reads the host of a remote", () => {
		expect(remoteHost("https://user@github.com/acme/app.git")).toBe("github.com");
		expect(remoteHost("git@gitlab.example.com:acme/app.git")).toBe("gitlab.example.com");
		expect(remoteHost("not a remote")).toBe("");
	});

	it("starts the creator from the tour and shows the items on their steps", async () => {
		const user = userEvent.setup();
		const router = mountApp("/home/today");
		await screen.findByRole("navigation", { name: "Sidebar" });
		// The tour opens by itself after the first project. A replay opens it with no project.
		openTour();
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
