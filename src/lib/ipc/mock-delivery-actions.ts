// The mock of the commands of wave 12 (writer A): the origin and publish, the pull request close,
// send back and archive, the browser sign-in, the code editor and the Markdown links. It mirrors
// `publish.rs`, `device_login.rs`, `openers.rs` and the pull request writes of `code.rs`: every
// write needs a click, an address holds no user name or password, a path stays inside the project.
import type {
	Connection_Serialize,
	DeviceStart,
	DeviceState,
	Editor,
	Origin_Serialize as Origin,
} from "./bindings";

const CLICK = "this change needs the click of a person";

export type MockDeliveryActions = {
	origin: Origin | null;
	/** The editor launches: the editor id, the path and the line. */
	editors: { editor: string | null; path: string; line: number | null }[];
	/** The device codes of the sign-ins that started. */
	devices: string[];
};

export const seedDeliveryActions = (): MockDeliveryActions => ({
	origin: null,
	editors: [],
	devices: [],
});

const need = (click: boolean) => {
	if (!click) throw CLICK;
};

const host = (url: string) =>
	/^https:\/\/([^/@]+)\/(.+)$/.exec(url) ?? /^git@([^:]+):(.+)$/.exec(url);

const originOf = (url: string, connection: string | null): Origin => {
	const m = host(url);
	const slug = m?.[2]?.replace(/\.git$/, "") ?? null;
	return {
		name: "origin",
		url,
		webUrl: m && slug ? `https://${m[1]}/${slug}` : null,
		slug,
		connection,
	};
};

export function remoteSet(w: MockDeliveryActions, url: string, click: boolean): Origin {
	need(click);
	const u = url.trim();
	if (!/^(https:\/\/[^/@\s]+\/\S+|git@[^:\s]+:\S+)$/.test(u))
		throw "bad remote address: use https://host/owner/repo.git, with no user name or password";
	w.origin = originOf(u, null);
	return w.origin;
}

export function publish(
	w: MockDeliveryActions,
	connections: Connection_Serialize[],
	connection: string,
	slug: string,
	click: boolean,
): Origin {
	need(click);
	if (w.origin) throw "the project already has a remote: change it instead";
	const c = connections.find((x) => x.id === connection && x.group === "forge");
	if (!c) throw `unknown connection: ${connection}`;
	if (!/^[\w.-]+\/[\w./-]+$/.test(slug.trim()) || slug.includes(".."))
		throw `a repository name needs an owner: ${slug}`;
	w.origin = originOf(`${c.url.replace(/\/$/, "")}/${slug.trim()}.git`, c.id);
	return w.origin;
}

export function deviceStart(
	w: MockDeliveryActions,
	connections: Connection_Serialize[],
	id: string,
	click: boolean,
): DeviceStart {
	need(click);
	const c = connections.find((x) => x.id === id);
	if (!c) throw `unknown connection: ${id}`;
	if (c.kind !== "github" && c.kind !== "gitlab")
		throw "browser sign-in is not set up for this product";
	w.devices.push(`dev-${id}`);
	return {
		userCode: "AB-12",
		verificationUri: `${c.url.replace(/\/$/, "")}/login/device`,
		deviceCode: `dev-${id}`,
		interval: 1,
		expiresIn: 900,
	};
}

export function devicePoll(w: MockDeliveryActions, deviceCode: string): DeviceState {
	if (!w.devices.includes(deviceCode)) throw "browser sign-in is not set up for this host";
	return "authorized";
}

export const editors = (): Editor[] => [{ id: "vscode", name: "Visual Studio Code" }];

export function editorOpen(
	w: MockDeliveryActions,
	editor: string | null,
	path: string,
	line: number | null,
) {
	if (!path || path.startsWith("-") || path.startsWith("/") || path.split("/").includes(".."))
		throw `path not allowed: ${path}`;
	w.editors.push({ editor, path, line });
	return null;
}

export function link(opened: string[], url: string) {
	if (!/^https?:\/\/[\w.-]+[\w\-._~:/?#@%=+]*$/.test(url))
		throw "bad address: use an https address";
	opened.push(url);
	return null;
}
