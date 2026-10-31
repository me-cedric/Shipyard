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
		expect(formatDay("2026-10-31", "", "en")).toBe("10/31/2026");
		expect(formatDay("", "iso", "en")).toBe("");
	});

	it("saves the accent, the sides, the narrow bar, all pages, the date format and the close push", async () => {
		const user = userEvent.setup();
		mountApp("/settings/me");
		await choose(user, "Accent colour", "Green");
		await waitFor(() => expect(mockState().prefs.accent).toBe("green"));
		expect(document.documentElement.dataset.accent).toBe("green");
		await choose(user, "Accent colour", "Theme colour");
		await waitFor(() => expect(mockState().prefs.accent).toBeNull());
		await choose(user, "Navigation side", "Right");
		await choose(user, "Drawer side", "Right");
		await user.click(screen.getByRole("switch", { name: "Narrow top bar" }));
		await user.click(screen.getByRole("switch", { name: "Show all pages" }));
		await user.click(
			screen.getByRole("switch", { name: "Push the saved changes when the window closes" }),
		);
		await choose(user, "Date format", "31/10/2026");
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

	it("sets and removes the picture of the person and shows the data folder", async () => {
		const user = userEvent.setup();
		mountApp("/settings/me");
		mockState().nextFile = "/Users/ada/me.png";
		await user.click(await screen.findByRole("button", { name: "Choose a picture" }));
		expect(await screen.findAllByRole("img", { name: "Your picture" })).not.toHaveLength(0);
		expect(mockState().extras.pictures.avatar?.mime).toBe("image/png");
		await user.click(screen.getByRole("button", { name: "Remove the picture" }));
		await waitFor(() => expect(mockState().extras.pictures.avatar).toBeUndefined());
		expect(screen.getByText(/dev\.shipyard\.app/)).toBeInTheDocument();
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
		mountApp("/work/backlog");
		const tabs = await screen.findByRole("navigation", { name: "Tabs" });
		expect(await within(tabs).findByText("Time")).toBeInTheDocument();
	});
});
