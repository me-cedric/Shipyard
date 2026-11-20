import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { openAccount } from "./test-open";

/** A code host and an issue tracker, each with a token. */
async function signedIn() {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	const add = (name: string, group: "forge" | "tracker", kind: "github" | "linear") =>
		unwrap(
			commands.connectionsAdd({
				name,
				group,
				kind,
				url: kind === "github" ? "https://github.com" : "",
				user: null,
			}),
		);
	const host = await add("Code", "forge", "github");
	const issues = await add("Issues", "tracker", "linear");
	for (const c of [host, issues]) await unwrap(commands.connectionsSetSecret(c.id, "tok-sign-out"));
	return [host.id, issues.id];
}

const secrets = (ids: string[]) => ids.filter((id) => mockState().secrets[id]);

// spec:shell-setup-rights#REQ-001: Sign out removes the tokens of the code host and the issue tracker.
describe("Sign out", () => {
	it("lists what it removes and then removes both tokens, and leaves the AI tools signed in", async () => {
		const user = userEvent.setup();
		const ids = await signedIn();
		const tools = mockState().agents.runners.map((r) => r.auth);
		mountApp("/today");
		const menu = await openAccount(user);
		mockState().confirm = true;
		await user.click(menu.getByRole("menuitem", { name: "Sign out" }));
		await waitFor(() => expect(secrets(ids)).toEqual([]));
		// The question lists what it removes.
		expect(mockState().asked).toEqual(["Remove the sign-in of Code, Issues?"]);
		expect(mockState().connections.map((c) => c.secret)).toEqual([false, false]);
		expect(mockState().agents.runners.map((r) => r.auth)).toEqual(tools);
	});

	it("removes no token when the person cancels", async () => {
		const user = userEvent.setup();
		const ids = await signedIn();
		mountApp("/today");
		const menu = await openAccount(user);
		mockState().confirm = false;
		await user.click(menu.getByRole("menuitem", { name: "Sign out" }));
		await screen.findByRole("button", { name: /^Account/ });
		expect(secrets(ids)).toEqual(ids);
	});

	it("is the last, red row of the account menu and says so when nothing is signed in", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/today");
		const menu = await openAccount(user);
		const items = menu.getAllByRole("menuitem");
		const last = items[items.length - 1];
		expect(last).toHaveTextContent("Sign out");
		expect(last).toHaveClass("text-danger-text");
		await user.click(last as HTMLElement);
		expect(await screen.findByText("No code host or issue tracker is signed in")).toBeVisible();
	});

	it("is also beside the name in the Me card", async () => {
		const user = userEvent.setup();
		const ids = await signedIn();
		mountApp("/setup/me");
		mockState().confirm = true;
		await user.click(await screen.findByRole("button", { name: "Sign out" }));
		await waitFor(() => expect(secrets(ids)).toEqual([]));
	});
});

// The command is a click of a person: a call with no click removes nothing.
describe("Sign out command", () => {
	it("needs the click of a person", async () => {
		const ids = await signedIn();
		await expect(unwrap(commands.accountSignOut(false))).rejects.toBeDefined();
		expect(secrets(ids)).toEqual(ids);
	});
});
