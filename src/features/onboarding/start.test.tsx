import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { ITEMS } from "./checklist";

const s = en.onboarding.setup;
const steps = async () => within(await screen.findByRole("list", { name: s.title }));

/** A project with an AI tool and its models, and no issue tracker. */
async function noTracker() {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	mockState().prefs.defaultAgent = "claude";
}

// spec:app-redesign#REQ-024
describe("Setup / Start", () => {
	it("lists every item of the start checklist in order, with its number", async () => {
		await noTracker();
		mountApp("/setup/start");
		const list = await steps();
		await waitFor(() => expect(list.getAllByRole("button")).toHaveLength(ITEMS.length));
		list.getAllByRole("button").forEach((b, i) => {
			expect(b).toHaveTextContent(s.item[ITEMS[i] ?? "project"]);
			expect(b).toHaveClass("min-h-control");
		});
		// A done item shows a check and says Done. An item to do shows its number.
		await waitFor(() =>
			expect(
				list.getByRole("button", { name: new RegExp(`^${s.item.project}`) }),
			).toHaveTextContent(s.done),
		);
		expect(list.getByRole("button", { name: s.item.forge })).toHaveTextContent(`5${s.item.forge}`);
	});

	it("shows the issue tracker step of a project with no issue tracker, and opens the form of This project", async () => {
		const user = userEvent.setup();
		await noTracker();
		const router = mountApp("/setup/start");
		expect(
			await screen.findByRole("heading", { level: 2, name: s.question.tracker }),
		).toBeVisible();
		const list = await steps();
		expect(list.getByRole("button", { name: new RegExp(s.item.tracker) })).toHaveAttribute(
			"aria-current",
			"step",
		);
		expect(document.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
		const connect = screen.getByRole("button", { name: s.action.connect });
		expect(connect).toHaveClass("min-h-control");
		await user.click(connect);
		// The connection lives under This project only: no form here.
		await waitFor(() => expect(router.state.location.pathname).toBe("/setup/project"));
	});

	it("offers the products of the issue tracker as large choices on its step", async () => {
		const user = userEvent.setup();
		await noTracker();
		mountApp("/setup/start");
		const kinds = within(await screen.findByRole("group", { name: "Product" }));
		expect(kinds.getAllByRole("button").map((b) => b.textContent)).toContain("Linear");
		await user.click(kinds.getByRole("button", { name: "Linear" }));
		expect(kinds.getByRole("button", { name: "Linear" })).toHaveAttribute("aria-pressed", "true");
		expect(kinds.getByRole("button", { name: "Jira Cloud" })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
	});

	it("skips to the next step that is to do, and a click on an item opens it", async () => {
		const user = userEvent.setup();
		await noTracker();
		mountApp("/setup/start");
		await screen.findByRole("heading", { level: 2, name: s.question.tracker });
		await user.click(screen.getByRole("button", { name: s.skip }));
		expect(screen.getByRole("heading", { level: 2, name: s.question.forge })).toBeVisible();
		const list = await steps();
		await user.click(list.getByRole("button", { name: new RegExp(s.item.project) }));
		expect(screen.getByRole("heading", { level: 2, name: s.question.project })).toBeVisible();
		expect(screen.getByRole("button", { name: `View ${s.item.project}` })).toBeInTheDocument();
	});

	it("opens the three scopes, each with one state line", async () => {
		// A door has its state after its name: the section switch has the name alone.
		await noTracker();
		mountApp("/setup/start");
		const project = await screen.findByRole("link", { name: new RegExp(`^${s.scope.project}.+`) });
		expect(project).toHaveAttribute("href", "/setup/project");
		await waitFor(() => expect(project).toHaveTextContent("Connections to make: 2"));
		const computer = screen.getByRole("link", { name: new RegExp(`^${s.scope.computer}.+`) });
		expect(computer).toHaveAttribute("href", "/setup/computer");
		await waitFor(() => expect(computer).toHaveTextContent(/AI tools ready: [1-9]/));
		const me = screen.getByRole("link", { name: new RegExp(`^${s.scope.me}.+`) });
		expect(me).toHaveAttribute("href", "/setup/me");
		expect(me).toHaveTextContent("English");
	});

	it("shows no door to a scope that the role does not see, and opens the permissions under Me", async () => {
		const user = userEvent.setup();
		await noTracker();
		const view = await unwrap(commands.rightsGet());
		mockState().person = {
			member: "bo",
			found: "email",
			role: "developer",
			admin: false,
			readOnly: false,
			rights: [],
			access: { ...view.person.access, settings: "none" },
		};
		const router = mountApp("/setup/start");
		expect(
			await screen.findByRole("link", { name: new RegExp(`^${s.scope.me}.+`) }),
		).toBeInTheDocument();
		await waitFor(() =>
			expect(
				screen.queryByRole("link", { name: new RegExp(`^${s.scope.computer}.+`) }),
			).not.toBeInTheDocument(),
		);
		expect(
			screen.queryByRole("link", { name: new RegExp(`^${s.scope.project}.+`) }),
		).not.toBeInTheDocument();
		const list = await steps();
		await user.click(list.getByRole("button", { name: new RegExp(s.item.permissions) }));
		await user.click(screen.getByRole("button", { name: s.action.permissions }));
		await waitFor(() => expect(router.state.location.href).toBe("/setup/me#section-permissions"));
		expect(
			await screen.findByRole("region", { name: /^What the system allows/ }),
		).toBeInTheDocument();
	});

	it("speaks French", async () => {
		mockState().prefs.lang = "fr";
		await noTracker();
		mountApp("/setup/start");
		expect(
			await screen.findByRole("heading", { level: 2, name: "Où sont vos tickets ?" }),
		).toBeVisible();
	});
});
