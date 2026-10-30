import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";

/**
 * The Codex trust step. Codex treats a folder that is not in its
 * trusted list more strictly. One notice names the exact effect, and one click adds the folder.
 * Nothing is written before the click.
 */
export function CodexTrust(): ReactNode {
	const { t } = useI18n();
	const qc = useQueryClient();
	const [error, setError] = useState<string | null>(null);
	const q = useQuery({
		queryKey: ["codex", "trust"],
		queryFn: () => unwrap(commands.codexTrustState()),
		retry: false,
	});
	if (q.data !== false) return null;
	const trust = async () => {
		setError(null);
		try {
			await unwrap(commands.codexTrust(true));
			await qc.invalidateQueries({ queryKey: ["codex", "trust"] });
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};
	return (
		<div className="flex flex-col gap-1 rounded-md border border-warning bg-warning-subtle p-2 text-ui text-n-12">
			<p>{t.assistant.codexTrust.body}</p>
			<Button className="self-start" onClick={() => void trust()}>
				{t.assistant.codexTrust.button}
			</Button>
			{error ? (
				<p role="alert" className="text-danger-text">
					{error}
				</p>
			) : null}
		</div>
	);
}
