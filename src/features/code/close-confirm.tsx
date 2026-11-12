import { format, useI18n } from "@/lib/i18n";
import { Button } from "@/ui/atoms/button";

/** The confirmation step of Close or Discard: one danger button that takes the focus. Leaving it cancels. */
export function CloseConfirm({
	number,
	label,
	onConfirm,
	onCancel,
}: {
	number?: number;
	/** The question, when it is not "Close #number?". */
	label?: string;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	const { t } = useI18n();
	return (
		<Button variant="danger" autoFocus onBlur={onCancel} onClick={onConfirm}>
			{label ?? format(t.forge.pullPage.confirmClose, { number: number ?? "" })}
		</Button>
	);
}
