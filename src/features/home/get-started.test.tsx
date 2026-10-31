import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";
import { remoteHost } from "./get-started";

describe("Home / Get started", () => {
	it("marks each step from the real state and opens the form of the next one", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home/inbox");
		const list = await screen.findByRole("list", { name: "Get started" });
		const steps = within(list).getAllByRole("link");
		expect(steps.map((s) => s.textContent)).toEqual([
			"1Connect an issue tracker",
			"2Connect a code host",
			"Install an agent Done",
			"Set the team Done",
			"Record the first decision Done",
			"Write the first spec Done",
			"7Assign a ticket",
			"Start the first run Done",
		]);
		expect(steps[0]).toHaveAttribute("aria-current", "step");
		expect(screen.getByRole("progressbar", { name: "Get started (5)" })).toHaveAttribute(
			"aria-valuenow",
			"5",
		);
		await user.click(steps[0] as HTMLElement);
		expect(await screen.findByRole("link", { name: "Connections", current: "page" })).toBeVisible();
		// The step opens the add form itself, not only the page.
		expect(await screen.findByRole("textbox", { name: "Name" })).toBeInTheDocument();
	});

	it("connects the forge in one click from a detected gh login", async () => {
		const user = userEvent.setup();
		mockState().logins = [{ tool: "gh", host: "example.com", user: "ada" }];
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home/inbox");
		await user.click(await screen.findByRole("button", { name: "Connect with gh as ada" }));
		await waitFor(async () =>
			expect((await unwrap(commands.projectSettings()))?.file?.connections?.forge).toBeTruthy(),
		);
		const list = await screen.findByRole("list", { name: "Get started" });
		await waitFor(() => expect(list).toHaveTextContent("Connect a code host Done"), {
			timeout: 5000,
		});
	}, 15_000);

	it("reads the host of a remote", () => {
		expect(remoteHost("https://user@github.com/acme/app.git")).toBe("github.com");
		expect(remoteHost("git@gitlab.example.com:acme/app.git")).toBe("gitlab.example.com");
		expect(remoteHost("not a remote")).toBe("");
	});

	it("goes away when every step is done", async () => {
		const user = userEvent.setup();
		const tracker = await withTracker();
		await importAll();
		mountApp("/home/inbox");
		await screen.findByRole("list", { name: "Get started" });
		const forge = await unwrap(
			commands.connectionsAdd({
				url: "https://github.com",
				user: null,
				name: "Hub",
				group: "forge",
				kind: "github",
			}),
		);
		const settings = await unwrap(commands.projectSettings());
		if (!settings?.file) throw new Error("no project file");
		await unwrap(
			commands.projectFileSave({ ...settings.file, connections: { tracker, forge: forge.id } }),
		);
		// A new visit reads the state again.
		await user.click(screen.getByRole("link", { name: "Activity" }));
		await user.click(await screen.findByRole("link", { name: "Inbox" }));
		await waitFor(() => expect(screen.queryByRole("list", { name: "Get started" })).toBeNull());
	});
});
