import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, pickCertificate, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { message } from "./keys";

const certsKey = ["certs"] as const;

/** Extra root certificates for the HTTP client: a PEM bundle of a company proxy. */
export function CertsGroup() {
	const { t } = useI18n();
	const c = t.settings.certs;
	const qc = useQueryClient();
	const status = useQuery({
		queryKey: certsKey,
		queryFn: () => unwrap(commands.certsStatus()),
	});
	const [error, setError] = useState<string | null>(null);
	if (!status.data) return null;
	const run = async (job: () => Promise<unknown>) => {
		setError(null);
		try {
			await job();
			await qc.invalidateQueries({ queryKey: certsKey });
		} catch (e) {
			setError(message(e));
		}
	};
	const add = () =>
		run(async () => {
			const path = await pickCertificate();
			if (path) await unwrap(commands.certsImport(path, true));
		});
	return (
		<section aria-labelledby="connections-certs" className="flex flex-col gap-2">
			<h2 id="connections-certs" className="px-1 py-1 text-12 font-medium text-n-11">
				{c.title}
			</h2>
			<div className="flex flex-col rounded-lg border bg-surface-1 shadow-1">
				<SettingsRow label={c.title}>
					<span className="text-12 text-n-11">
						{status.data.added ? format(c.count, { count: status.data.count }) : c.none}
					</span>
					<Button variant="secondary" onClick={() => void add()}>
						{c.add}
					</Button>
					<Button
						variant="secondary"
						disabled={!status.data.added}
						onClick={() => void run(() => unwrap(commands.certsRemove(true)))}
					>
						{c.remove}
					</Button>
				</SettingsRow>
				{error && (
					<p role="alert" className="px-3 pb-2 text-ui text-danger-text">
						{error}
					</p>
				)}
			</div>
		</section>
	);
}
