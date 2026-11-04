import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { type Connection_Serialize, commands, unwrap } from "@/lib/ipc";
import { syncKeys } from "@/lib/sync";
import { Button } from "@/ui/atoms/button";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { DeviceCode } from "./connection-form";
import { deviceSignIn } from "./device-signin";
import { connectionKeys } from "./keys";

/**
 * The one line of a GitHub or GitLab connection that the host refused (a 401), with its two
 * actions: the browser sign-in, and the login of `gh` or `glab` when that tool is signed in to the
 * same host. Each action runs once per click, so nothing retries on its own.
 */
export function Repair({ connection: c }: { connection: Connection_Serialize }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const [code, setCode] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<unknown>(null);
	const alive = useRef(true);
	useEffect(() => {
		alive.current = true;
		return () => {
			alive.current = false;
		};
	}, []);
	const tool = c.kind === "github" ? "gh" : "glab";
	const host = new URL(c.url).hostname;
	const login = useQuery({
		queryKey: [...connectionKeys.list, "logins"],
		queryFn: () => unwrap(commands.connectionsDetect()),
	}).data?.find((l) => l.tool === tool && l.host.toLowerCase() === host.toLowerCase());

	const run = async (job: () => Promise<unknown>) => {
		setBusy(true);
		setError(null);
		try {
			await job();
			await unwrap(commands.connectionsTest(c.id));
		} catch (e) {
			setError(e);
		} finally {
			setCode(null);
			setBusy(false);
			await qc.invalidateQueries({ queryKey: connectionKeys.list });
			await qc.invalidateQueries({ queryKey: syncKeys.all });
		}
	};

	return (
		<div role="alert" className="flex flex-wrap items-center gap-2 px-3 pb-2 text-ui">
			<span className="text-danger-text">{t.connections.rejected}</span>
			<Button
				disabled={busy}
				onClick={() =>
					void run(async () => {
						const state = await deviceSignIn(c.id, setCode, () => alive.current);
						if (state === "denied") throw t.forge.device.denied;
						if (state === "expired") throw t.forge.device.expired;
					})
				}
			>
				{t.forge.device.signInAgain}
			</Button>
			{login ? (
				<Button
					disabled={busy}
					onClick={() => void run(() => unwrap(commands.connectionsUseLogin(tool, host, true)))}
				>
					{format(t.connections.useCli, { tool })}
				</Button>
			) : null}
			{code ? <DeviceCode code={code} /> : null}
			<ErrorNotice error={error} className="w-full text-ui text-danger-text" />
		</div>
	);
}
