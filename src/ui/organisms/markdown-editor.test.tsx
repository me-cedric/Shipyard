import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { en } from "@/lib/i18n/en";
import { renderApp } from "../test-utils";
import { MarkdownEditor } from "./markdown-editor";

const editor = (props: Partial<ComponentProps<typeof MarkdownEditor>> = {}) => (
	<MarkdownEditor
		title="Page"
		refId="doc:page.md"
		value="# Page"
		onChange={() => {}}
		save="clean"
		onSave={() => {}}
		canSave={false}
		onReload={() => {}}
		onKeepMine={() => {}}
		labels={en.knowledge.editor}
		saveLabel="Save"
		{...props}
	/>
);

describe("MarkdownEditor", () => {
	it("opens on the page to read, and one switch shows the text or both", async () => {
		const user = userEvent.setup();
		renderApp(editor());
		expect(await screen.findByRole("article", { name: "Preview" })).toBeInTheDocument();
		expect(screen.queryByRole("textbox", { name: "Markdown" })).toBeNull();
		await user.click(screen.getByRole("button", { name: "Text" }));
		expect(screen.getByRole("textbox", { name: "Markdown" })).toBeInTheDocument();
		expect(screen.queryByRole("article", { name: "Preview" })).toBeNull();
		await user.click(screen.getByRole("button", { name: "Both" }));
		expect(screen.getByRole("article", { name: "Preview" })).toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: "Markdown" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Read" })).toHaveAttribute("aria-pressed", "false");
	});

	it("shows the text when the person asked to edit", async () => {
		renderApp(editor({ edit: true }));
		expect(await screen.findByRole("textbox", { name: "Markdown" })).toBeInTheDocument();
		// The Read / Edit switch of the page holds Read: a second Read here would hide the text in Edit.
		expect(screen.queryByRole("button", { name: "Read" })).toBeNull();
		expect(screen.getByRole("button", { name: "Both" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Text" })).toBeInTheDocument();
	});

	it("shows the text on a save conflict", async () => {
		renderApp(editor({ save: "conflict" }));
		expect(await screen.findByRole("textbox", { name: "Markdown" })).toBeInTheDocument();
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});
});
