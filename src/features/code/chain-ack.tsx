import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Dialog } from "@/ui/organisms/dialog";

/** Every view that reads the chain starts with `code`: the list and the badges follow one click. */
const refresh = (qc: ReturnType<typeof useQueryClient>) =>
	qc.invalidateQueries({ queryKey: ["code"] });

/**
 * Leave one stale link as it is, with a reason. The reason goes to the repository, so the team
 * sees it. A new changed file brings the warning back.
 */
export function AckDialog({
	base,
	from,
	to,
	name,
	onClose,
}: {
	base: string;
	from: string;
	to: string;
	name: string;
	onClose: () => void;
}) {
	const { t } = useI18n();
	const c = t.review.chain;
	const qc = useQueryClient();
	const [reason, setReason] = useState("");
	const [error, setError] = useState<unknown>(null);
	const save = async () => {
		try {
			setError(null);
			await unwrap(commands.codeChainAck(base, from, to, reason.trim(), true));
			await refresh(qc);
			onClose();
		} catch (e) {
			setError(e);
		}
	};
	return (
		<Dialog
			open
			onOpenChange={(o) => !o && onClose()}
			title={format(c.acknowledgeName, { name })}
			actions={
				<Button variant="primary" disabled={!reason.trim()} onClick={() => void save()}>
					{c.acknowledge}
				</Button>
			}
		>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					if (reason.trim()) void save();
				}}
			>
				<Input
					caption
					label={c.reason}
					value={reason}
					onChange={(e) => setReason(e.target.value)}
				/>
			</form>
			<ErrorNotice error={error} />
		</Dialog>
	);
}

/** Take an acknowledgement back. The warning shows again. */
export function useWithdrawAck() {
	const qc = useQueryClient();
	return async (from: string, to: string) => {
		await unwrap(commands.codeChainAckWithdraw(from, to, true));
		await refresh(qc);
	};
}
