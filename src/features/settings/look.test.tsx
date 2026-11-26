import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { formatDay } from "@/lib/prefs";
import { mountApp } from "@/test/mount";

async function choose(user: ReturnType<typeof userEvent.setup>, field: string, option: string) {
	await user.click(await screen.findByRole("combobox", { name: field }));
	await user.click(await screen.findByRole("option", { name: option }));
}

describe("Settings / Me: look, close and picture (W12)", () => {
	it("formats a day in each date format", () => {
		expect(formatDay("2026-10-31", "iso", "en")).toBe("2026-10-31");
		expect(formatDay("2026-10-31", "dmy", "en")).toBe("31/10/2026");
		expect(formatDay("2026-10-31", "mdy", "en")).toBe("10/31/2026");
		expect(formatDay("2026-10-31", "", "en")).toBe("31 Oct 2026");
		expect(formatDay("", "iso", "en")).toBe("");
	});

	it("saves the accent, the sides, the narrow bar, all pages, the date format and the close push", async () => {
		const user = userEvent.setup();
		mountApp("/setup/me?page=look");
		await user.click(await screen.findByRole("button", { name: "Green" }));
		await waitFor(() => expect(mockState().prefs.accent).toBe("green"));
		expect(document.documentElement.dataset.accent).toBe("green");
		await user.click(screen.getByRole("button", { name: "Theme colour" }));
		await waitFor(() => expect(mockState().prefs.accent).toBeNull());
		await user.click(
			within(
				screen.getAllByRole("group", { name: "Menu of places" }).at(-1) as HTMLElement,
			).getByRole("button", {
				name: "Right",
			}),
		);
		await user.click(
			within(screen.getAllByRole("group", { name: "Side panel" }).at(-1) as HTMLElement).getByRole(
				"button",
				{
					name: "Right",
				},
			),
		);
		await user.click(screen.getByRole("switch", { name: "Narrow top bar" }));
		await user.click(screen.getByRole("switch", { name: "Show all pages" }));
		await user.click(
			screen.getByRole("switch", { name: "Push the saved changes when the window closes" }),
		);
		await choose(user, "Dates", "31/10/2026");
		await waitFor(() => expect(mockState().prefs.dateFormat).toBe("dmy"));
		const p = mockState().prefs;
		expect([p.navSide, p.drawerSide, p.narrowBar, p.showAllPages, p.closePush]).toEqual([
			"right",
			"right",
			true,
			true,
			true,
		]);
		// The sidebar now sits after the main view.
		const main = screen.getByRole("main");
		const nav = screen.getByRole("navigation", { name: "Sidebar" });
		expect(main.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it("saves the motion and the focus ring, shows a preview and writes root attributes", async () => {
		const user = userEvent.setup();
		mountApp("/setup/me?page=look");
		const root = document.documentElement.dataset;
		await waitFor(() =>
			expect([root.motion, root.focusRing, root.focusWidth]).toEqual(["system", "keyboard", "2"]),
		);
		await user.click(await screen.findByRole("switch", { name: "Motion" }));
		await user.click(screen.getByRole("switch", { name: "Ring around the active control" }));
		await user.click(screen.getByRole("button", { name: "More: Width of the ring" }));
		await waitFor(() =>
			expect([
				mockState().prefs.motion,
				mockState().prefs.focusRing,
				mockState().prefs.focusWidth,
			]).toEqual(["reduce", "always", 3]),
		);
		expect([root.motion, root.focusRing, root.focusWidth]).toEqual(["reduce", "always", "3"]);
		expect(screen.getByText("Preview")).toBeInTheDocument();
	});

	it("saves the text size and writes it on the root element", async () => {
		const user = userEvent.setup();
		mountApp("/setup/me");
		const more = await screen.findByRole("button", { name: "More: Text size" });
		await user.click(more);
		await user.click(more);
		await waitFor(() => expect(mockState().prefs.uiScale).toBe(18));
		expect(document.documentElement.style.fontSize).toBe("18px");
	});

	it("sets and removes the picture of the person and shows the data folder", async () => {
		const user = userEvent.setup();
		const router = mountApp("/setup/me");
		mockState().nextFile = "/Users/ada/me.png";
		await user.click(await screen.findByRole("button", { name: "Change" }));
		expect(await screen.findAllByRole("img", { name: "Your picture" })).not.toHaveLength(0);
		expect(mockState().extras.pictures.avatar?.mime).toBe("image/png");
		await user.click(screen.getByRole("button", { name: "Remove the picture" }));
		await waitFor(() => expect(mockState().extras.pictures.avatar).toBeUndefined());
		router.history.push("/setup/me?page=look");
		expect(await screen.findByText(/dev\.shipyard\.app/)).toBeInTheDocument();
		await expect(unwrap(commands.pictureSet("avatar", "/Users/ada/me.svg", true))).rejects.toThrow(
			"Choose a PNG or JPEG picture",
		);
		await expect(unwrap(commands.pictureSet("avatar", "/Users/ada/me.png", false))).rejects.toThrow(
			"Confirm this action",
		);
	});

	it("shows the hidden pages of a profile when the person asks for all pages", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const settings = await unwrap(commands.projectSettings());
		await unwrap(
			commands.projectOverridesSave({
				...(settings?.overrides ?? ({} as never)),
				hiddenTabs: ["work/time"],
			}),
		);
		mockState().prefs.showAllPages = true;
		mountApp("/plan/plan");
		const tabs = await screen.findByRole("navigation", { name: "Tabs" });
		expect(await within(tabs).findByText("Time")).toBeInTheDocument();
	});
});
