import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/** Opens the card of the sync mark in the top row. Returns the queries of the card. */
export async function openSync(user: UserEvent) {
	await user.click(await screen.findByRole("button", { name: /^Sync state/ }));
	return within(await screen.findByRole("dialog", { name: "Sync state" }));
}

/** Opens the account menu at the foot of the rail. Returns the queries of the menu. */
export async function openAccount(user: UserEvent) {
	await user.click(await screen.findByRole("button", { name: /^Account/ }));
	return within(await screen.findByRole("menu"));
}
