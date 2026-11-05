import { Menu } from "@base-ui/react/menu";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import type { RunnerOptions, ThreadSettings } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { CheckIcon, ChevronRightIcon } from "@/ui/icons";
import { MENU_ITEM, MENU_POPUP } from "@/ui/molecules/menu-button";

const DEFAULT = "default";

function Radio({ value, children }: { value: string; children: string }) {
	return (
		<Menu.RadioItem value={value} closeOnClick className={MENU_ITEM}>
			<span className="inline-block w-3">
				<Menu.RadioItemIndicator>
					<CheckIcon size={12} />
				</Menu.RadioItemIndicator>
			</span>
			{children}
		</Menu.RadioItem>
	);
}

/** A submenu: an item with an arrow that opens its own list. */
function Sub({ label, children }: { label: string; children: ReactNode }) {
	return (
		<Menu.SubmenuRoot>
			<Menu.SubmenuTrigger className={`${MENU_ITEM} justify-between`}>
				{label}
				<ChevronRightIcon size={12} />
			</Menu.SubmenuTrigger>
			<Menu.Portal>
				<Menu.Positioner sideOffset={4} className="z-50">
					<Menu.Popup className={MENU_POPUP}>{children}</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.SubmenuRoot>
	);
}

/**
 * One button that shows "<model> · <effort>" and opens one menu: the models of the runner of the
 * thread, an Effort submenu, and the models of the other runners.
 */
export function ModelMenu({
	runners,
	settings: s,
	onChange,
}: {
	runners: RunnerOptions[];
	settings: ThreadSettings;
	onChange: (patch: Partial<ThreadSettings>) => void;
}) {
	const { t } = useI18n();
	const runner = runners.find((r) => r.runner === s.runner);
	const others = runners.filter((r) => r.runner !== s.runner && r.models.length > 0);
	const label = [s.model ?? s.runner, s.effort].filter(Boolean).join(" · ");
	return (
		<Menu.Root>
			<Menu.Trigger render={<Button variant="ghost" className="min-w-0 max-w-full px-2" />}>
				<span className="truncate">{label}</span>
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Positioner side="top" align="start" sideOffset={4} className="z-50">
					<Menu.Popup className={MENU_POPUP}>
						<Menu.RadioGroup
							aria-label={t.assistant.model}
							value={s.model ?? DEFAULT}
							onValueChange={(v) => onChange({ model: v === DEFAULT ? null : String(v) })}
						>
							<Radio value={DEFAULT}>{t.assistant.default}</Radio>
							{(runner?.models ?? []).map((m) => (
								<Radio key={m} value={m}>
									{m}
								</Radio>
							))}
						</Menu.RadioGroup>
						{runner?.efforts.length ? (
							<Sub label={t.assistant.effort}>
								<Menu.RadioGroup
									aria-label={t.assistant.effort}
									value={s.effort ?? DEFAULT}
									onValueChange={(v) => onChange({ effort: v === DEFAULT ? null : String(v) })}
								>
									<Radio value={DEFAULT}>{t.assistant.default}</Radio>
									{runner.efforts.map((e) => (
										<Radio key={e} value={e}>
											{e}
										</Radio>
									))}
								</Menu.RadioGroup>
							</Sub>
						) : null}
						{others.length ? (
							<Sub label={t.assistant.moreModels}>
								{others.map((r) => (
									<Menu.Group key={r.runner}>
										<Menu.GroupLabel className="px-2 py-1 text-12 text-n-10">
											{r.runner}
										</Menu.GroupLabel>
										{r.models.map((m) => (
											// A model belongs to its runner: the effort of this one does not go over.
											<Menu.Item
												key={m}
												className={MENU_ITEM}
												onClick={() => onChange({ runner: r.runner, model: m, effort: null })}
											>
												{m}
											</Menu.Item>
										))}
									</Menu.Group>
								))}
							</Sub>
						) : null}
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	);
}
