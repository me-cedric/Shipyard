import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { type Connection_Serialize, commands, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { Switch } from "@/ui/atoms/switch";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { deviceSignIn } from "./device-signin";
import { connectionKeys, mcpKeys, useMcpServers } from "./keys";

/**
 * The GitLab tools of a connection that is signed in: a switch when the sign-in holds the `mcp`
 * scope, else "Sign in again" (an older sign-in has `api` only). The server entry holds no token.
 */
export function GitlabTools({ connection: c }: { connection: Connection_Serialize }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const servers = useMcpServers();
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
	if (c.kind !== "gitlab" || !c.secret) return null;
	const on = servers.data?.find((s) => s.id === `custom-gitlab-${c.id}`)?.enabled ?? false;

	const toggle = async (next: boolean) => {
		setError(null);
		try {
			await unwrap(commands.gitlabMcpSetOn(c.id, next, true));
		} catch (e) {
			setError(e);
		} finally {
			await qc.invalidateQueries({ queryKey: mcpKeys.list });
		}
	};

	const signIn = async () => {
		setBusy(true);
		setError(null);
		try {
			const state = await deviceSignIn(c.id, setCode, () => alive.current);
			if (state === "denied") setError(t.forge.device.denied);
			if (state === "expired") setError(t.forge.device.expired);
		} catch (e) {
			setError(e);
		} finally {
			setCode(null);
			setBusy(false);
			await qc.invalidateQueries({ queryKey: connectionKeys.list });
		}
	};

	return (
		<div className="flex flex-wrap items-center gap-2 px-3 pb-2">
			{c.scopes.includes("mcp") ? (
				<Switch label={t.forge.device.gitlabTools} checked={on} onCheckedChange={toggle} />
			) : (
				<Button disabled={busy} onClick={() => void signIn()}>
					{t.forge.device.signInAgain}
				</Button>
			)}
			{code ? (
				<span role="status" className="font-mono">
					{format(t.forge.device.code, { code })}
				</span>
			) : null}
			<ErrorNotice error={error} className="text-ui text-danger-text" />
		</div>
	);
}
