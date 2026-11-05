import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

const seed = () =>
	unwrap(
		commands.connectionsAdd({
			name: "Acme",
			group: "tracker",
			kind: "linear",
			url: "",
			user: null,
		}),
	);

describe("Settings / Connections, keyboard and language", () => {
	it("reaches Add, then Test, Edit and Remove of a connection, in that order, with Tab", async () => {
		const user = userEvent.setup();
		await seed();
		mountApp("/settings/connections");
		const main = within(await screen.findByRole("main"));
		const add = await main.findByRole("button", { name: "Connection" });
		add.focus();
		const seen: string[] = [add.getAttribute("aria-label") ?? add.textContent ?? ""];
		for (let i = 0; i < 20 && !seen.includes("Remove"); i++) {
			await user.tab();
			const el = document.activeElement as HTMLElement;
			seen.push(el.getAttribute("aria-label") ?? el.textContent ?? "");
		}
		const names = ["Connection", "Test", "Edit", "Remove"];
		expect(seen.filter((n) => names.includes(n))).toEqual(names);
	});

	it("shows the main labels in French when the person chose French", async () => {
		await unwrap(commands.prefsSet({ lang: "fr" }));
		await seed();
		mountApp("/settings/connections");
		const main = within(await screen.findByRole("main"));
		expect(await main.findByRole("heading", { name: "Outils de suivi (1)" })).toBeInTheDocument();
		expect(main.getByRole("button", { name: "Connexion" })).toBeInTheDocument();
		const row = within(main.getByRole("group", { name: "Acme" }));
		for (const name of ["Tester", "Modifier", "Supprimer"])
			expect(row.getByRole("button", { name })).toBeInTheDocument();
		expect(main.queryByRole("button", { name: "Connection" })).toBeNull();
	});
});
