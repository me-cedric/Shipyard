import { commands, unwrap } from "@/lib/ipc";

/** An open project whose tracker is a Linear connection. Without `secret` the polls fail. */
export async function withTracker(secret = true) {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	const c = await unwrap(
		commands.connectionsAdd({
			name: "Acme",
			group: "tracker",
			kind: "linear",
			url: "",
			user: null,
		}),
	);
	if (secret) await unwrap(commands.connectionsSetSecret(c.id, "tok-sync-view"));
	const settings = await unwrap(commands.projectSettings());
	if (!settings?.file) throw new Error("no project file");
	await unwrap(
		commands.projectFileSave({ ...settings.file, connections: { tracker: c.id, forge: null } }),
	);
	return c.id;
}

/** The open tickets of the fake tracker, in the mirror. */
export async function importAll() {
	await unwrap(commands.syncImportPlan());
	await unwrap(commands.syncImportConfirm());
}
