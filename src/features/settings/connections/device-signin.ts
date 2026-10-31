import { commands, type DeviceState, unwrap } from "@/lib/ipc";

/**
 * The browser sign-in of a connection: asks for a code, opens the page and polls until the host
 * answers. `stopped` when the view left before the end.
 */
export async function deviceSignIn(
	id: string,
	onCode: (code: string) => void,
	alive: () => boolean,
): Promise<DeviceState | "stopped"> {
	const d = await unwrap(commands.deviceLoginStart(id, true));
	onCode(d.userCode);
	await unwrap(commands.openLink(d.verificationUri));
	let wait = d.interval;
	for (const end = Date.now() + d.expiresIn * 1000; Date.now() < end; ) {
		await new Promise((r) => setTimeout(r, wait * 1000));
		if (!alive()) return "stopped";
		const state = await unwrap(commands.deviceLoginPoll(id, d.deviceCode));
		if (state === "slow_down") wait += 5;
		else if (state !== "pending") return state;
	}
	return "expired";
}
