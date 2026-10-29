import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

/** One tab of the whole app on the mock project: the Extensions commands need an active project. */
export async function mountTab(tab: "agents-rules" | "extensions") {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	return mountApp(`/settings/${tab}`);
}
