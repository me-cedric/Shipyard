import { Menu } from "@base-ui/react/menu";
import { useNavigate } from "@tanstack/react-router";
import { usePicture } from "@/features/settings/picture-field";
import { useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { UserCircleIcon } from "@/ui/icons";
import { MenuList } from "@/ui/molecules/menu-button";
import { useActions } from "./actions";

/**
 * The avatar menu: Settings / Me, the theme, the manual, the shortcuts, what is new and the tour.
 * The items run the same actions as the palette.
 */
export function AccountMenu() {
	const { t } = useI18n();
	const { theme } = usePrefs();
	const navigate = useNavigate();
	const avatar = usePicture("avatar").data;
	const { list } = useActions();
	const item = (id: string) => {
		const a = list.find((x) => x.id === id);
		if (!a) throw new Error(`Missing action: ${id}`);
		return { id, label: a.label, shortcut: a.shortcut, onSelect: a.run };
	};
	return (
		<Menu.Root>
			<Menu.Trigger
				aria-label={t.shell.account}
				title={t.shell.account}
				className="flex size-7 shrink-0 items-center justify-center rounded-full text-n-11 hover:bg-n-3 hover:text-n-12"
			>
				{avatar ? (
					<img src={avatar} alt="" className="size-6 rounded-full object-cover" />
				) : (
					<UserCircleIcon size={20} />
				)}
			</Menu.Trigger>
			<MenuList
				value={theme}
				items={[
					{
						id: "me",
						label: `${t.space.settings} / ${t.tabs.settings.me}`,
						onSelect: () => void navigate({ to: "/settings/me" }),
					},
					...(["light", "dark", "system"] as const).map((id) => ({
						...item(`theme-${id}`),
						value: id,
					})),
					item("manual"),
					item("shortcuts-help"),
					item("whats-new"),
					item("tour"),
				]}
			/>
		</Menu.Root>
	);
}
