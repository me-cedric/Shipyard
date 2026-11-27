import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test-utils";
import { Gallery } from "./gallery";

// update-app-redesign, look pass 1: each shared part has an entry in the gallery.
describe("Gallery", () => {
	it("shows the new atoms and the new molecules", async () => {
		renderApp(<Gallery />);
		await userEvent.click(screen.getByRole("button", { name: "Atoms" }));
		for (const name of [
			"Button",
			"LinkButton",
			"IconButton",
			"Badge",
			"Chip",
			"StepBar",
			"Segmented",
			"Input",
		])
			expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
		expect(screen.getByRole("group", { name: "Segmented" })).toBeInTheDocument();
		expect(screen.getByRole("img", { name: "Builder" })).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "Molecules" }));
		for (const name of [
			"PageHeader",
			"SectionSwitch",
			"AttentionCard",
			"StageLine",
			"SettingsRow",
			"Card, Row",
			"Option",
			"Tile",
			"BackLink",
			"SpendMeter",
			"GroupSection",
			"ErrorNotice",
			"Loading",
			"MenuButton",
			"ConfirmButton",
			"Fold",
			"DateButton",
		])
			expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
		expect(screen.getAllByRole("meter", { name: "Spend today" })).toHaveLength(3);
		expect(screen.getByRole("heading", { level: 2, name: "Open (2)" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Developer" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	});

	it("shows the most-used organisms", async () => {
		renderApp(<Gallery />);
		await userEvent.click(screen.getByRole("button", { name: "Organisms" }));
		expect(screen.getByRole("heading", { level: 2, name: "MarkdownView" })).toBeInTheDocument();
	});

	it("shows the shared parts of the templates", async () => {
		renderApp(<Gallery />);
		await userEvent.click(screen.getByRole("button", { name: "Templates" }));
		expect(screen.getByRole("heading", { level: 1, name: "Library page" })).toBeInTheDocument();
	});
});
