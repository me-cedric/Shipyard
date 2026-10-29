import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { seedCode } from "@/lib/ipc/mock-code";
import { mountApp } from "@/test/mount";

const open = () => unwrap(commands.projectsOpen("/mock/alpha", false));
const main = () => screen.getByRole("main");
const selector = () => screen.findByRole("combobox", { name: "Working branch" });

describe("Code / History", () => {
	it("lists the commits with their labels and opens one with its files and first diff", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/history");
		const row = await screen.findByRole("button", { name: /fix\(auth\): refuse an empty token/ });
		expect(row).toHaveTextContent("main");
		expect(row).toHaveTextContent("origin/main");
		expect(screen.getAllByRole("button", { name: /Ada Lovelace/ })).toHaveLength(3);
		await user.click(await screen.findByRole("button", { name: /chore: first commit/ }));
		expect(await screen.findByRole("heading", { name: "chore: first commit" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Files (2)" })).toBeInTheDocument();
		// The first file, in the order of the commit, shows its diff.
		expect(await screen.findByRole("region", { name: "Diff of docs/guide.md" })).toHaveTextContent(
			"g",
		);
		await user.click(
			within(screen.getByRole("region", { name: "Files" })).getByRole("button", {
				name: "src/app.ts",
			}),
		);
		expect(await screen.findByRole("region", { name: "Diff of src/app.ts" })).toBeInTheDocument();
	});

	it("loads older commits and stops when the log is whole", async () => {
		const user = userEvent.setup();
		await open();
		const code = seedCode();
		const main = code.branches.main;
		const base = Object.values(code.commits)[0];
		if (!(main && base)) throw new Error("seed");
		for (let i = 0; i < 37; i++) {
			const sha = `${String(100 + i).padStart(7, "0")}${"b".repeat(33)}`;
			code.commits[sha] = {
				...base,
				info: { ...base.info, sha, short: sha.slice(0, 7), summary: `chore: n${i}` },
			};
			main.log.push(sha);
		}
		mockState().code = code;
		mountApp("/code/history");
		await screen.findByRole("button", { name: /chore: n26/ });
		expect(screen.queryByRole("button", { name: /chore: n27/ })).toBeNull();
		await user.click(screen.getByRole("button", { name: "Older" }));
		await screen.findByRole("button", { name: /chore: n36/ });
		await waitFor(() => expect(screen.queryByRole("button", { name: "Older" })).toBeNull());
	});
});

describe("Code / Branches", () => {
	it("shows the working branch in the header selector and lists the local and remote branches", async () => {
		await open();
		mountApp("/code/branches");
		expect(await selector()).toHaveTextContent("main");
		expect(await screen.findByRole("heading", { name: "Local (2)" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Remote (1)" })).toBeInTheDocument();
	});

	it("has one primary action and refuses a name that is not type/area/kebab", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/branches");
		const create = await screen.findByRole("button", { name: "Branch" });
		const primary = within(main())
			.getAllByRole("button")
			.filter((b) => b.className.includes("bg-accent"));
		expect(primary).toEqual([create]);
		// An empty area and subject give `feat//`: the same rule refuses it and shows the types.
		await user.click(create);
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"feat, fix, chore, docs, refactor, test",
		);
		expect(mockState().code?.branch).toBe("main");
	});

	it("creates a branch from the current head and makes it the working branch", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/branches");
		await user.click(await screen.findByRole("combobox", { name: "Type" }));
		await user.click(await screen.findByRole("option", { name: "fix" }));
		await user.type(screen.getByRole("textbox", { name: "Area" }), "auth");
		await user.type(screen.getByRole("textbox", { name: "Subject" }), "login-timeout");
		await user.click(screen.getByRole("button", { name: "Branch" }));
		await waitFor(() => expect(mockState().code?.branch).toBe("fix/auth/login-timeout"));
		expect(await screen.findByRole("heading", { name: "Local (3)" })).toBeInTheDocument();
		expect(await selector()).toHaveTextContent("fix/auth/login-timeout");
	});

	it("switches and refuses a switch that would overwrite a change, naming the file", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/branches");
		const row = await screen.findByRole("group", { name: "feat/auth/login" });
		await user.click(within(row).getByRole("button", { name: "Switch" }));
		// `src/app.ts` has an unstaged change and the target branch changes it.
		expect(await screen.findByRole("alert")).toHaveTextContent("src/app.ts");
		expect(mockState().code?.branch).toBe("main");
		await unwrap(commands.codeDiscard(["src/app.ts"], false));
		await user.click(within(row).getByRole("button", { name: "Switch" }));
		await waitFor(() => expect(mockState().code?.branch).toBe("feat/auth/login"));
	});

	it("deletes a branch after a second click that names it, and never the working branch", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/branches");
		const head = await screen.findByRole("group", { name: "main" });
		expect(within(head).queryByRole("button", { name: /Delete/ })).toBeNull();
		const row = screen.getByRole("group", { name: "feat/auth/login" });
		await user.click(within(row).getByRole("button", { name: "Delete" }));
		expect(mockState().code?.branches["feat/auth/login"]).toBeDefined();
		await user.click(within(row).getByRole("button", { name: "Delete feat/auth/login" }));
		await waitFor(() => expect(mockState().code?.branches["feat/auth/login"]).toBeUndefined());
	});

	it("switches from the header selector", async () => {
		const user = userEvent.setup();
		await open();
		await unwrap(commands.codeDiscard(["src/app.ts"], false));
		mountApp("/code/changes");
		await user.click(await selector());
		await user.click(await screen.findByRole("option", { name: "feat/auth/login" }));
		await waitFor(() => expect(mockState().code?.branch).toBe("feat/auth/login"));
	});
});
