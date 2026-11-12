import { format, useI18n } from "@/lib/i18n";
import { Button } from "@/ui/atoms/button";

/** The confirmation step of Close: one danger button that takes the focus. Leaving it cancels. */
export function CloseConfirm({
	number,
	onConfirm,
	onCancel,
}: {
	number: number;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	const { t } = useI18n();
	return (
		<Button variant="danger" autoFocus onBlur={onCancel} onClick={onConfirm}>
			{format(t.forge.pullPage.confirmClose, { number })}
		</Button>
	);
}
