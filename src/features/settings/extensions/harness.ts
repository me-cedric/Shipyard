import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

const PAGE = {
	"agents-rules": "/setup/computer?page=rules",
	extensions: "/setup/project?page=extensions",
	plugins: "/setup/project?page=plugins",
};

/** One page of Setup on the mock project: the Extensions commands need an active project. */
export async function mountTab(tab: keyof typeof PAGE) {
	// A plugin folder that waits for review is remembered: a test starts with none.
	localStorage.removeItem("shipyard.plugin-waiting");
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	return mountApp(PAGE[tab]);
}
