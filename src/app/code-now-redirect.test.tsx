import { waitFor } from "@testing-library/react";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

describe("an old address of Code / Now with a search of the pull requests", () => {
	it("opens Pull requests with the same search and hash", async () => {
		await unwrap(commands.projectsOpen("/mock/demo", false));
		const router = mountApp("/code/now?q=fix&filter=needs#top");
		await waitFor(() => expect(router.state.location.pathname).toBe("/code/pull-requests"));
		expect(router.state.location.search).toMatchObject({ q: "fix", filter: "needs" });
		expect(router.state.location.hash).toBe("top");
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("keeps Code / Now with no search", async () => {
		await unwrap(commands.projectsOpen("/mock/demo", false));
		const router = mountApp("/code/now");
		await waitFor(() => expect(router.state.status).toBe("idle"));
		expect(router.state.location.pathname).toBe("/code/now");
	});
});
