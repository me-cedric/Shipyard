import { describe, expect, it } from "vitest";
import { commands, type NewProject } from "./bindings";
import { mockState } from "./mock";
import { unwrap } from "./result";

const plan = (over: Partial<NewProject> = {}): NewProject => ({
	name: "Demo",
	key: "DEMO",
	folder: "/mock/Projects/demo",
	stack: "rust",
	brief: { vision: "v", users: "u", scope: "- one\n- two\n\n* three" },
	docsLang: "fr",
	pullsLang: "en",
	members: [{ name: "Ada", role: "architect" }],
	remote: { kind: "local" },
	tracker: null,
	trackerScope: null,
	...over,
});

const add = (group: "forge" | "tracker", kind: "github" | "linear") =>
	unwrap(
		commands.connectionsAdd({
			name: kind,
			group,
			kind,
			url: kind === "github" ? "https://github.com" : "",
			user: null,
		}),
	);

describe("mock creator", () => {
	it("lists the options and drafts the brief in the language", async () => {
		const o = await unwrap(commands.creatorOptions());
		expect(o.stacks.map((s) => s.id)).toEqual(["node", "rust", "python", "java", "go", "other"]);
		expect(o.me).toBe("Ada Lovelace");
		expect((await unwrap(commands.creatorDraft("Demo", "rust", "fr"))).scope).toContain(
			"projet Rust",
		);
	});

	it("previews the files with the gates, the headings and one issue for each scope line", async () => {
		const p = await unwrap(commands.creatorPreview(plan()));
		const text = (path: string) => p.files.find((f) => f.path === path)?.content ?? "";
		expect(text(".shipyard/project.yaml")).toContain("cargo clippy");
		expect(text(".gitignore")).toContain("target/");
		expect(text("docs/brief.md")).toContain("## Périmètre");
		expect(p.issues.map((i) => i.title)).toEqual(["one", "two", "three"]);
		expect(p.starts).toEqual(["later"]);
		expect(mockState().projects).toEqual([]);
		await expect(unwrap(commands.creatorPreview(plan({ stack: "cobol" })))).rejects.toBeTruthy();
	});

	it("offers the run with a code host and the issues with an issue tracker", async () => {
		const forge = await add("forge", "github");
		const tracker = await add("tracker", "linear");
		const p = await unwrap(
			commands.creatorPreview(
				plan({
					remote: { kind: "create", forge: forge.id, slug: "acme/demo" },
					tracker: tracker.id,
				}),
			),
		);
		expect(p.starts).toEqual(["run", "issues", "later"]);
		const yaml = p.files.find((f) => f.path === ".shipyard/project.yaml")?.content ?? "";
		expect(yaml).toContain(`forge: ${forge.id}`);
		expect(yaml).toContain(`tracker: ${tracker.id}`);
	});

	it("creates on a click, opens the project, and refuses a folder that is not empty", async () => {
		await expect(unwrap(commands.creatorCreate(plan(), false))).rejects.toBeTruthy();
		const forge = await add("forge", "github");
		const made = await unwrap(
			commands.creatorCreate(
				plan({ remote: { kind: "create", forge: forge.id, slug: "acme/demo" } }),
				true,
			),
		);
		expect(made.outcome.status).toBe("opened");
		expect(made.remote).toBe("https://github.com/acme/demo.git");
		expect(mockState().projects[0]).toMatchObject({ name: "Demo", active: true });
		const settings = await unwrap(commands.projectSettings());
		expect(settings?.file?.languages).toEqual({ docs: "fr", pulls: "en" });
		expect(settings?.file?.gates).toEqual(["cargo test", "cargo clippy"]);
		const again = await unwrap(commands.creatorCreate(plan(), true));
		expect(again.outcome.status).toBe("folder-not-empty");
	});

	it("starts the bootstrap run only with a code host, and creates issues after the tracker is set", async () => {
		await unwrap(commands.creatorCreate(plan(), true));
		await expect(unwrap(commands.creatorBootstrap(true))).rejects.toMatchObject({
			details: expect.stringContaining("code host"),
		});
		const tracker = await add("tracker", "linear");
		await unwrap(
			commands.creatorCreate(
				plan({ folder: "/mock/Projects/two", key: "TWO", tracker: tracker.id }),
				true,
			),
		);
		const row = (await unwrap(commands.creatorPreview(plan()))).issues[0];
		if (!row) throw new Error("no issue");
		expect((await unwrap(commands.workItemCreate(row, true))).key).toMatch(/-/);
	});
});
