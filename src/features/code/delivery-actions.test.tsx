import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { renderApp } from "@/ui/test-utils";
import { OpenInEditor } from "./open-in-editor";

const demo = () => unwrap(commands.projectsOpen("/mock/demo", false));

describe("Code: origin and publish", () => {
	it("publishes a local project to a forge after a click, then shows the origin", async () => {
		const user = userEvent.setup();
		await unwrap(
			commands.connectionsAdd({
				name: "GitHub",
				group: "forge",
				kind: "github",
				url: "https://github.com",
				user: null,
			}),
		);
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await unwrap(commands.codeStatus());
		mountApp("/code/branches");
		await user.type(
			await screen.findByRole("textbox", { name: "Repository (owner/name)" }),
			"acme/app",
		);
		await user.click(screen.getByRole("button", { name: "Publish to the forge" }));
		expect(await screen.findByText("https://github.com/acme/app.git")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Open acme/app" })).toBeInTheDocument();
		expect(mockState().deliveryActions.origin?.connection).toBe("github");
		// A project with an origin changes it. An address with a password is refused.
		await user.click(screen.getByRole("button", { name: "Change remote" }));
		await user.type(
			screen.getByRole("textbox", { name: "Remote address" }),
			"https://me:tok@github.com/acme/other.git",
		);
		await user.click(screen.getByRole("button", { name: "Save remote" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Use an https address");
		expect(mockState().deliveryActions.origin?.url).toBe("https://github.com/acme/app.git");
	}, 20_000);

	it("needs a click for each write", async () => {
		await expect(
			unwrap(commands.codeRemoteSet("https://github.com/a/b.git", false)),
		).rejects.toThrow();
		await expect(unwrap(commands.codePublish("github", "a/b", false))).rejects.toThrow();
		await expect(unwrap(commands.codePullClose(142, "", false))).rejects.toThrow();
	});
});

describe("Code: close, send back and archive", () => {
	it("closes an open pull request with a reason", async () => {
		const user = userEvent.setup();
		await demo();
		mountApp("/code/pull-requests");
		await user.click(await screen.findByRole("button", { name: /refuse an empty token/ }));
		await user.type(await screen.findByRole("textbox", { name: "Comment" }), "Wrong approach");
		await user.click(screen.getByRole("button", { name: "Close pull request" }));
		await waitFor(() =>
			expect(mockState().prs?.pulls.find((p) => p.number === 142)?.state).toBe("closed"),
		);
		expect(mockState().prs?.pulls.find((p) => p.number === 142)?.threads.length).toBeGreaterThan(0);
	});

	it("sends a pull request of an agent run back with a text", async () => {
		const user = userEvent.setup();
		await demo();
		mountApp("/code/pull-requests");
		await user.click(await screen.findByRole("button", { name: /show the pull requests/ }));
		const back = await screen.findByRole("button", { name: "Send back to the agent" });
		await user.click(back);
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"a request for changes needs some text",
		);
		await user.type(screen.getByRole("textbox", { name: "Comment" }), "Add a test");
		await user.click(back);
		await waitFor(() =>
			expect(
				mockState()
					.prs?.pulls.find((p) => p.number === 143)
					?.verdicts.map((v) => v.state),
			).toContain("changes-requested"),
		);
	});

	it("archives a spec change in the pull request", async () => {
		const user = userEvent.setup();
		await demo();
		mountApp("/code/pull-requests");
		await user.click(await screen.findByRole("button", { name: /health route/ }));
		await user.click(await screen.findByRole("button", { name: "Archive in this pull request" }));
		expect(await screen.findByText(/^Archived in /)).toBeInTheDocument();
	}, 20_000);
});

describe("Code: open a file in the editor", () => {
	it("shows the detected editor and launches it with the file and the line", async () => {
		const user = userEvent.setup();
		renderApp(<OpenInEditor path="src/app.ts" line={12} />);
		await user.click(await screen.findByRole("button", { name: "Open in Visual Studio Code" }));
		await waitFor(() =>
			expect(mockState().deliveryActions.editors).toEqual([{ editor: "vscode", path: "src/app.ts", line: 12 }]),
		);
	});

	it("refuses a path that leaves the project", async () => {
		for (const path of ["../x", "/etc/passwd", "-g"])
			await expect(unwrap(commands.editorOpen("vscode", path, null))).rejects.toThrow();
		expect(within(document.body).queryByRole("alert")).toBeNull();
	});
});
