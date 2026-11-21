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

/** The steps of the guided start (Setup / Start), which took the list of Settings / Me (`spec:app-redesign#REQ-024`). */
const steps = async () => within(await screen.findByRole("list", { name: s.title }));
/** A step that is done adds the word Done to its name. */
const doneName = (id: (typeof ITEMS)[number]) => new RegExp(`^${s.item[id]}\\s*${s.done}$`);
const card = async () => within(await screen.findByRole("region", { name: s.title }));
/** Open the step `id` of Setup / Start: its controls show beside the list. */
const pick = async (user: ReturnType<typeof userEvent.setup>, id: (typeof ITEMS)[number]) =>
	user.click(await (await steps()).findByRole("button", { name: new RegExp(`^${s.item[id]}`) }));

describe("Get started checklist", () => {
	it("shows the eleven items in order in Setup / Start, also from the old address of Settings / Me", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/settings/me#section-setup");
		const items = await steps();
		await waitFor(() => expect(router.state.location.pathname).toBe("/setup/start"));
		expect(items.getAllByRole("button")).toHaveLength(ITEMS.length);
		items.getAllByRole("button").forEach((b, i) => {
			expect(b).toHaveAccessibleName(new RegExp(`^${s.item[ITEMS[i] ?? "project"]}`));
		});
		// The project is open: its step is done, and the list shows it.
		await waitFor(() =>
			expect(items.getByRole("button", { name: doneName("project") })).toBeVisible(),
		);
	});

	it("shows to do for each item of a fresh machine in Setup / Start", async () => {
		mountApp("/setup/start");
		const items = await steps();
		// A step to do has its name alone: no Done.
		for (const id of ["project", "ai", "tracker", "forge", "permissions"] as const)
			expect(items.getByRole("button", { name: s.item[id] })).toBeInTheDocument();
	});

	it("marks the same state on Today and in Setup / Start", async () => {
		await allButTeam();
		mountApp("/setup/start");
		const items = await steps();
		for (const id of ITEMS.filter((i) => i !== "team"))
			expect(await items.findByRole("button", { name: doneName(id) })).toBeInTheDocument();
		expect(items.getByRole("button", { name: s.item.team })).toBeInTheDocument();
		const router = mountApp("/home/today");
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("shows only the next step on Today, and Continue opens the full list", async () => {
		const user = userEvent.setup();
		await allButTeam();
		const router = mountApp("/home/today");
		const today = await card();
		expect(await today.findByText(s.item.team)).toBeInTheDocument();
		await user.click(today.getByRole("link", { name: o.continue }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/setup/start"));
		expect((await steps()).getAllByRole("button")).toHaveLength(ITEMS.length);
	});

	it("says Sign in for an AI tool that is signed out", async () => {
		await allButTeam();
		mockState().prefs.defaultAgent = "codex";
		const router = mountApp("/setup/start");
		const user = userEvent.setup();
		await pick(user, "ai");
		await user.click(await screen.findByRole("button", { name: s.action.signIn }));
		await waitFor(() =>
			expect(router.state.location.href).toBe("/setup/computer?page=models#tools"),
		);
	});

	it("asks before it installs an AI tool, and names what it installs", async () => {
		await allButTeam();
		mockState().prefs.defaultAgent = "copilot";
		mountApp("/setup/start");
		const user = userEvent.setup();
		await pick(user, "ai");
		await user.click(await screen.findByRole("button", { name: "Install GitHub Copilot" }));
		expect(mockState().agents.runners.find((r) => r.id === "copilot")?.state).toBe("missing");
		await user.click(
			await screen.findByRole("button", {
				name: "Run npm install -g copilot to install GitHub Copilot?",
			}),
		);
		await waitFor(() =>
			expect(mockState().agents.runners.find((r) => r.id === "copilot")?.state).toBe("detected"),
		);
		await waitFor(() =>
			expect(
				within(screen.getByRole("list", { name: s.title })).getByRole("button", {
					name: doneName("ai"),
				}),
			).toBeVisible(),
		);
	});

	it("picks the AI tool in place on Today, and the item goes away", async () => {
		const user = userEvent.setup();
		await allButTeam();
		mockState().prefs.defaultAgent = "";
		mountApp("/setup/start");
		await pick(user, "ai");
		// Setup / Start offers the AI tools as tiles (picture 008).
		const tools = await screen.findByRole("group", { name: en.personal.prefs.defaultAgent });
		await user.click(within(tools).getByRole("button", { name: "Claude Code" }));
		await waitFor(() => expect(mockState().prefs.defaultAgent).toBe("claude"));
		await waitFor(() =>
			expect(
				within(screen.getByRole("list", { name: s.title })).getByRole("button", {
					name: doneName("ai"),
				}),
			).toBeVisible(),
		);
	});

	it("adds the person as the admin, then the step is done and Today has no setup card", async () => {
		const user = userEvent.setup();
		await allButTeam();
		const router = mountApp("/setup/start");
		await pick(user, "team");
		await user.click(await screen.findByRole("button", { name: s.action.team }));
		await waitFor(() => expect(mockState().work?.team.members[0]?.admin).toBe(true));
		await waitFor(() =>
			expect(
				within(screen.getByRole("list", { name: s.title })).getByRole("button", {
					name: doneName("team"),
				}),
			).toBeVisible(),
		);
		await router.navigate({ to: "/home/today" });
		await waitFor(() => expect(screen.queryByRole("region", { name: s.title })).toBeNull());
	});

	it("offers the team page with the member form beside Add me as admin", async () => {
		const user = userEvent.setup();
		await allButTeam();
		const router = mountApp("/setup/start");
		await pick(user, "team");
		expect(await screen.findByRole("button", { name: s.action.team })).toBeInTheDocument();
		await user.click(await screen.findByRole("button", { name: s.action.openTeam }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/crew/crew"));
		expect(await screen.findByRole("textbox", { name: "Handle" })).toBeInTheDocument();
	});

	it("offers Install and the runner page when no AI tool is set", async () => {
		const user = userEvent.setup();
		await allButTeam();
		mockState().prefs.defaultAgent = "";
		const router = mountApp("/setup/start");
		await pick(user, "ai");
		expect(
			await screen.findByRole("button", { name: "Install GitHub Copilot" }),
		).toBeInTheDocument();
		// The step has one main action; the door to the AI tools is the scope This computer.
		const [computer] = await screen.findAllByRole("link", {
			name: new RegExp(`^${s.scope.computer}`),
		});
		await user.click(computer as HTMLElement);
		await waitFor(() => expect(router.state.location.pathname).toBe("/setup/computer"));
		expect(await screen.findByRole("region", { name: en.connections.group.runner })).toBeVisible();
	});

	it("links a done item to its page and marks the next item to do", async () => {
		const user = userEvent.setup();
		await allButTeam();
		const router = mountApp("/setup/start");
		const items = await steps();
		await user.click(await items.findByRole("button", { name: doneName("tracker") }));
		await user.click(await screen.findByRole("button", { name: `View ${s.item.tracker}` }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/setup/project"));
		expect(router.state.location.hash).toBe("issue-tracker");
	});

	it("marks the first item to do as the current step, and counts only the done ones", async () => {
		await allButTeam();
		mountApp("/setup/start");
		const items = await steps();
		const team = items.getByRole("button", { name: s.item.team });
		await waitFor(() => expect(team).toHaveAttribute("aria-current", "step"));
		expect(document.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
		// The guided start has no progress bar: each done step says Done.
		await waitFor(() =>
			expect(items.getAllByRole("button", { name: new RegExp(`${s.done}$`) })).toHaveLength(
				ITEMS.length - 1,
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
		const router = mountApp("/setup/start");
		await pick(user, "models");
		await user.click(await screen.findByRole("button", { name: s.action.models }));
		await waitFor(() =>
			expect(router.state.location.href).toBe("/setup/computer?page=models#tiers"),
		);
		await router.navigate({ to: "/setup/start" });
		await pick(user, "forge");
		await user.click(await screen.findByRole("button", { name: s.action.connect }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/setup/project"));
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
		const router = mountApp("/setup/start");
		await pick(user, "forge");
		await user.click(await screen.findByRole("button", { name: s.action.choose }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/setup/project"));
		expect(router.state.location.hash).toBe("more-code-host");
	});

	it("connects the code host in one click from a detected gh login", async () => {
		const user = userEvent.setup();
		mockState().logins = [{ tool: "gh", host: "example.com", user: "ada" }];
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/setup/start");
		await pick(user, "forge");
		await user.click(await screen.findByRole("button", { name: "Connect with gh as ada" }));
		await waitFor(async () =>
			expect((await unwrap(commands.projectSettings()))?.file?.connections?.forge).toBeTruthy(),
		);
		await waitFor(
			() =>
				expect(
					within(screen.getByRole("list", { name: s.title })).getByRole("button", {
						name: doneName("forge"),
					}),
				).toBeVisible(),
			{ timeout: 5000 },
		);
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
		// The first run shows without the shell.
		await screen.findByRole("heading", { level: 1, name: en.projects.job });
		// The tour opens by itself after the first project. A replay opens it with no project.
		openTour();
		const dialog = await screen.findByRole("dialog", { name: o.steps.loop.title });
		await user.click(within(dialog).getByRole("button", { name: o.next }));
		const step = await screen.findByRole("dialog", { name: o.steps.project.title });
		await user.click(await within(step).findByRole("button", { name: s.action.project }));
		// The creator is a page of its own, behind Projects.
		await waitFor(() => expect(router.state.location.pathname).toBe("/projects/new"));
		await waitFor(() =>
			expect(screen.queryByRole("dialog", { name: o.steps.project.title })).toBeNull(),
		);
		expect(await screen.findByRole("navigation", { name: en.creator.steps })).toBeInTheDocument();
	});

	it("speaks French", async () => {
		mockState().prefs.lang = "fr";
		mountApp("/setup/start");
		const items = within(await screen.findByRole("list", { name: "Pour commencer" }));
		expect(items.getByRole("button", { name: "Outil de suivi" })).toBeInTheDocument();
	});
});
