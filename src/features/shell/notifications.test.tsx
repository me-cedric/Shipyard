import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { en } from "@/lib/i18n/en";
import { fr } from "@/lib/i18n/fr";
import { mockState } from "@/lib/ipc/mock";
import { NotificationsProvider, useNotifications } from "@/lib/notifications";
import { mountApp } from "@/test/mount";
import { MENU_ACTIONS, menuLabels } from "./events";

const NEWER = "https://example.com/newer/releases/latest";

async function runAction(user: ReturnType<typeof userEvent.setup>, name: string) {
	await screen.findByRole("navigation", { name: "Sidebar" });
	await user.keyboard("{Control>}k{/Control}");
	await user.type(await screen.findByRole("combobox"), name);
	await user.keyboard("{Enter}");
}

describe("Notification centre", () => {
	it("tells once that a newer version exists, as a toast and in the centre", async () => {
		const user = userEvent.setup();
		mockState().prefs.releaseUrl = NEWER;
		mountApp("/home/inbox");
		const toast = await screen.findByRole("status", { name: "Notifications" });
		expect(await within(toast).findByText("Update available: 0.2.0")).toBeInTheDocument();

		const bell = screen.getByRole("button", { name: "Notifications" });
		expect(bell).toHaveTextContent("1 unread");
		await user.click(bell);
		const list = await screen.findByRole("dialog");
		expect(within(list).getAllByText("Update available: 0.2.0")).toHaveLength(1);
		// Opening the centre reads each event.
		await waitFor(() => expect(bell).not.toHaveTextContent("unread"));
		// A manual check finds the same version: still one entry.
		await user.keyboard("{Escape}");
		await runAction(user, "Check for updates");
		await user.click(bell);
		expect(
			within(await screen.findByRole("dialog")).getAllByText("Update available: 0.2.0"),
		).toHaveLength(1);
	});

	it("shows the changelog once after an update, across two starts", async () => {
		mockState().prefs.seenVersion = "0.0.9";
		mountApp("/home/inbox");
		const toast = await screen.findByRole("status", { name: "Notifications" });
		expect(await within(toast).findByText("What changed in 0.1.0")).toBeInTheDocument();
		expect(within(toast).getByText(/A change\./)).toBeInTheDocument();
		await waitFor(() => expect(mockState().prefs.seenVersion).toBe("0.1.0"));
		// Second start: the last version that ran is the current one. Nothing shows.
		cleanup();
		mountApp("/home/inbox");
		await screen.findByRole("navigation", { name: "Sidebar" });
		await new Promise((r) => setTimeout(r, 50));
		expect(screen.queryByText("What changed in 0.1.0")).toBeNull();
	});

	it("shows only the new version entry when it is not installed", async () => {
		mockState().prefs.releaseUrl = NEWER;
		mountApp("/home/inbox");
		const toast = await screen.findByRole("status", { name: "Notifications" });
		expect(await within(toast).findByText("Update available: 0.2.0")).toBeInTheDocument();
		expect(screen.queryByText(/What changed in/)).toBeNull();
		await waitFor(() => expect(mockState().prefs.seenVersion).toBe("0.1.0"));
	});

	it("keeps the changelog back and the version unchanged when the update source is off", async () => {
		mockState().prefs.seenVersion = "0.0.9";
		mockState().prefs.notifyOff = ["update"];
		mountApp("/home/inbox");
		await screen.findByRole("navigation", { name: "Sidebar" });
		await new Promise((r) => setTimeout(r, 50));
		expect(screen.queryByText("What changed in 0.1.0")).toBeNull();
		expect(mockState().prefs.seenVersion).toBe("0.0.9");
	});

	it("says that the app is up to date on a manual check and stays quiet at start", async () => {
		const user = userEvent.setup();
		mountApp("/home/inbox");
		await screen.findByRole("navigation", { name: "Sidebar" });
		expect(screen.getByRole("button", { name: "Notifications" })).not.toHaveTextContent("unread");
		await runAction(user, "Check for updates");
		expect(await screen.findByText("Up to date: 0.1.0")).toBeInTheDocument();
	});

	it("names a failed check, and only on a manual check", async () => {
		const user = userEvent.setup();
		mockState().prefs.releaseUrl = "https://example.com/broken";
		mountApp("/home/inbox");
		await screen.findByRole("navigation", { name: "Sidebar" });
		expect(screen.queryByText("Update check failed")).toBeNull();
		await runAction(user, "Check for updates");
		expect(await screen.findByText("Update check failed")).toBeInTheDocument();
	});

	it("keeps the release address in Settings / Me and restores the default when it is empty", async () => {
		const user = userEvent.setup();
		mountApp("/settings/me");
		const field = await screen.findByRole("textbox", { name: "Release address" });
		await waitFor(() => expect(field).toHaveValue(mockState().prefs.releaseUrl));
		await user.clear(field);
		await user.click(field);
		await user.paste("https://example.com/newer/latest");
		await user.tab();
		await waitFor(() =>
			expect(mockState().prefs.releaseUrl).toBe("https://example.com/newer/latest"),
		);
		await user.clear(field);
		await user.tab();
		await waitFor(() => expect((field as HTMLInputElement).value).toMatch(/api\.github\.com/));
	});
});

function Probe({ id, kind }: { id: string; kind: "info" | "error" | "needs-you" }) {
	const { push, items } = useNotifications();
	const [settled, setSettled] = useState(0);
	return (
		<>
			<button
				type="button"
				onClick={async () => {
					await push({ id, kind, title: "Approve the pull request" });
					setSettled((n) => n + 1);
				}}
			>
				push
			</button>
			<span data-testid="count">{items.length}</span>
			<span data-testid="settled">{settled}</span>
		</>
	);
}

describe("Notifications store", () => {
	const focus = (on: boolean) => vi.spyOn(document, "hasFocus").mockReturnValue(on);

	it("shows an event once, whatever the number of pushes", async () => {
		focus(true);
		render(
			<NotificationsProvider>
				<Probe id="run:1" kind="info" />
			</NotificationsProvider>,
		);
		await userEvent.click(screen.getByRole("button", { name: "push" }));
		await userEvent.click(screen.getByRole("button", { name: "push" }));
		// Both pushes are done before the count is read.
		await waitFor(() => expect(screen.getByTestId("settled")).toHaveTextContent(/^2$/));
		expect(screen.getByTestId("count")).toHaveTextContent(/^1$/);
	});

	it("skips a source in notifyOff, in the centre and for the system", async () => {
		focus(false);
		mockState().prefs.notifyOff = ["approval"];
		render(
			<NotificationsProvider>
				<Probe id="approval:1" kind="needs-you" />
				<Probe id="question:1" kind="needs-you" />
			</NotificationsProvider>,
		);
		const [approval, question] = screen.getAllByRole("button", { name: "push" });
		await act(async () => {
			await userEvent.click(approval as HTMLElement);
			await userEvent.click(question as HTMLElement);
		});
		await waitFor(() => expect(mockState().os).toHaveLength(1));
		expect(screen.getAllByTestId("count")[0]).toHaveTextContent("1");
	});

	it("asks the system for a sync failure, an update and a moved head in the background", async () => {
		focus(false);
		render(
			<NotificationsProvider>
				<Probe id="sync:1" kind="error" />
				<Probe id="update:2" kind="info" />
				<Probe id="remote:main:x" kind="info" />
			</NotificationsProvider>,
		);
		await act(async () => {
			for (const b of screen.getAllByRole("button", { name: "push" })) await userEvent.click(b);
		});
		await waitFor(() => expect(mockState().os).toHaveLength(3));
	});

	it("asks the system for a needs-you event in the background only, once", async () => {
		const spy = focus(false);
		render(
			<NotificationsProvider>
				<Probe id="approval:1" kind="needs-you" />
				<Probe id="info:1" kind="info" />
			</NotificationsProvider>,
		);
		const [needs, info] = screen.getAllByRole("button", { name: "push" });
		await act(async () => {
			await userEvent.click(needs as HTMLElement);
			await userEvent.click(needs as HTMLElement);
			await userEvent.click(info as HTMLElement);
		});
		await waitFor(() => expect(mockState().os).toHaveLength(1));
		expect(mockState().os[0]?.title).toBe("Approve the pull request");
		spy.mockReturnValue(true);
		await userEvent.click(screen.getAllByRole("button", { name: "push" })[0] as HTMLElement);
		expect(mockState().os).toHaveLength(1);
		spy.mockRestore();
	});
});

describe("Native menu", () => {
	it("has a label in both languages for each global action and each menu", () => {
		for (const t of [en, fr]) {
			const labels = menuLabels(t);
			for (const id of [...MENU_ACTIONS, "app", "file", "edit", "view", "window", "help", "quit"])
				expect(labels[id], id).toBeTruthy();
		}
	});

	it("maps each menu item to a palette action", async () => {
		const user = userEvent.setup();
		mountApp("/home/inbox");
		await screen.findByRole("navigation", { name: "Sidebar" });
		await user.keyboard("{Control>}k{/Control}");
		await screen.findByRole("combobox");
		const names = (await screen.findAllByRole("option")).map((o) => o.textContent);
		// The commit action stays out of the palette while nothing is staged.
		for (const label of [
			"Open a local folder",
			"Switch project",
			"Sync",
			"Command palette",
			"Toggle sidebar",
			"Toggle inspector",
			"Check for updates",
		])
			expect(
				names.some((n) => n?.startsWith(label)),
				label,
			).toBe(true);
	});
});
