import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

/** One page of Setup on the mock project: the Extensions commands need an active project. */
export async function mountTab(tab: "agents-rules" | "extensions") {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	return mountApp(
		tab === "extensions" ? "/setup/project?page=extensions" : "/setup/computer?page=models",
	);
}
