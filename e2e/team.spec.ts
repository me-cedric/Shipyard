import { expect, type Page, test } from "@playwright/test";

const tabs = (page: Page) => page.getByRole("navigation", { name: "Tabs" });
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Sidebar" });

/** Adds a member in Work / Team and saves. */
async function addMember(page: Page, name: string, handle: string, role: string, admin = false) {
	await page.getByRole("button", { name: "Member", exact: true }).click();
	const panel = page.getByRole("complementary", { name: "Member" });
	await panel.getByRole("textbox", { name: "Name" }).fill(name);
	await panel.getByRole("textbox", { name: "Handle" }).fill(handle);
	await panel.getByRole("combobox", { name: "Role" }).click();
	await page.getByRole("option", { name: role }).click();
	if (admin) await panel.getByRole("switch", { name: "Admin" }).click();
	await panel.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("row", { name: handle, exact: true })).toBeVisible();
}

test("a solo project gets two members with an admin, then an unknown person reads and cannot save", async ({
	page,
}) => {
	await page.goto("/home/today");
	await page.getByRole("button", { name: "Open a local folder" }).click();
	await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
	await sidebar(page).getByRole("link", { name: "Work" }).click();
	await tabs(page).getByRole("link", { name: "Team" }).click();
	// No admin in the team file: every right, so the member control is on.
	await expect(page.getByRole("button", { name: "Member", exact: true })).toBeEnabled();
	await addMember(page, "Bo Dev", "bo", "Developer");
	await addMember(page, "Cy Lead", "cy", "Tech lead", true);
	// The team has an admin and this person matches no member: a viewer.
	await expect(page.getByText("You are not in the team file")).toBeVisible();
	const add = page.getByRole("button", { name: "Member", exact: true });
	await expect(add).toBeDisabled();
	await expect(add).toHaveAccessibleDescription(
		"Needs the right project.settings (your role: Viewer)",
	);
	// Every view still reads: Settings / Project opens, and its save is off.
	await sidebar(page).getByRole("link", { name: "Settings" }).click();
	await tabs(page).getByRole("link", { name: "Project" }).click();
	await page.getByRole("textbox", { name: "Name" }).first().fill("Renamed");
	const save = page.getByRole("button", { name: "Save", exact: true });
	await expect(save).toBeDisabled();
	await expect(save).toHaveAccessibleDescription(
		"Needs the right project.settings (your role: Viewer)",
	);
});
