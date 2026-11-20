import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { type Connection_Serialize, commands, pickCertificate, unwrap } from "@/lib/ipc";
import { syncKeys } from "@/lib/sync";
import { Button } from "@/ui/atoms/button";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { SetupCard, SetupRow } from "../parts";
import { DeviceCode } from "./connection-form";
import { deviceSignIn } from "./device-signin";
import { connectionKeys } from "./keys";

const certsKey = ["certs"] as const;

/**
 * The browser sign-in of one GitHub or GitLab connection: the same steps as the repair line of a
 * refused token. Shipyard shows the code, the host keeps the password, the keychain keeps the token.
 */
function DeviceRow({ connection: c, label }: { connection?: Connection_Serialize; label: string }) {
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
	const signIn = async (id: string) => {
		setBusy(true);
		setError(null);
		try {
			const state = await deviceSignIn(id, setCode, () => alive.current);
			if (state === "denied") throw t.forge.device.denied;
			if (state === "expired") throw t.forge.device.expired;
			if (state === "authorized") await unwrap(commands.connectionsTest(id));
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
		<>
			<SetupRow label={label}>
				{code ? <DeviceCode code={code} /> : null}
				<Button
					variant="secondary"
					aria-label={c ? `${t.settings.signIn.action}: ${c.name}` : undefined}
					disabled={busy || !c}
					reason={c ? undefined : t.personal.setup.noHost}
					onClick={() => c && void signIn(c.id)}
				>
					{t.settings.signIn.action}
				</Button>
			</SetupRow>
			<ErrorNotice error={error} className="px-6 pb-2 text-ui text-danger-text" />
		</>
	);
}

/**
 * Security of this computer: the extra root certificates for the HTTP client (a PEM bundle of a
 * company proxy), and the browser sign-in of each GitHub or GitLab connection.
 */
export function CertsGroup() {
	const { t } = useI18n();
	const c = t.settings.certs;
	const p = t.personal.setup;
	const qc = useQueryClient();
	const status = useQuery({
		queryKey: certsKey,
		queryFn: () => unwrap(commands.certsStatus()),
	});
	const hosts = (
		useQuery({
			queryKey: connectionKeys.list,
			queryFn: () => unwrap(commands.connectionsList()),
		}).data ?? []
	).filter((x) => x.group === "forge" && (x.kind === "github" || x.kind === "gitlab"));
	const [error, setError] = useState<unknown>(null);
	if (!status.data) return null;
	const run = async (job: () => Promise<unknown>) => {
		setError(null);
		try {
			await job();
			await qc.invalidateQueries({ queryKey: certsKey });
		} catch (e) {
			setError(e);
		}
	};
	const add = () =>
		run(async () => {
			const path = await pickCertificate();
			if (path) await unwrap(commands.certsImport(path, true));
		});
	return (
		<SetupCard id="connections-certs" title={p.security}>
			<SetupRow id="certificates" label={c.title}>
				{status.data.added ? (
					<span className="text-13 text-n-11">{format(c.count, { count: status.data.count })}</span>
				) : null}
				<Button variant="secondary" aria-label={c.add} onClick={() => void add()}>
					{p.add}
				</Button>
				{status.data.added ? (
					<Button
						variant="secondary"
						aria-label={c.remove}
						onClick={() => void run(() => unwrap(commands.certsRemove(true)))}
					>
						{p.remove}
					</Button>
				) : null}
			</SetupRow>
			{error ? <ErrorNotice error={error} className="px-6 pb-2" /> : null}
			{hosts.length === 0 ? (
				<DeviceRow label={p.deviceSignIn} />
			) : (
				hosts.map((h) => (
					<DeviceRow
						key={h.id}
						connection={h}
						label={hosts.length > 1 ? `${p.deviceSignIn}: ${h.name}` : p.deviceSignIn}
					/>
				))
			)}
		</SetupCard>
	);
}
