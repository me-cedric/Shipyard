import { Menu } from "@base-ui/react/menu";
import { Link, useNavigate } from "@tanstack/react-router";
import { format, LANGS, useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { useHealth, worstStatus } from "@/lib/projects";
import { useRightsView } from "@/lib/rights";
import { useWhatsNew } from "@/lib/updates/whats-new";
import { cn } from "@/lib/utils";
import { useTeam } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { Kbd } from "@/ui/atoms/kbd";
import { type Status, StatusDot } from "@/ui/atoms/status-dot";
import { MENU_ITEM, MENU_POPUP } from "@/ui/molecules/menu-button";
import { usePicture } from "@/ui/organisms/picture-field";
import { useActions } from "./actions";
import { useSignOut } from "./sign-out";

// A row of the menu card: 60 px, with a line between two rows.
const ROW = "flex min-h-15 items-center gap-3 border-n-6 px-6 text-n-12 [&+&]:border-t";
const ITEM = cn(ROW, "cursor-pointer font-semibold data-[highlighted]:bg-n-3");
const BTN =
	"inline-flex min-h-control items-center rounded-md border border-n-7 bg-surface-1 px-4.5 font-semibold";
const SEG =
	"inline-flex min-h-control cursor-pointer items-center rounded-sm px-3.5 font-medium text-n-10 data-[checked]:bg-surface-2 data-[checked]:text-n-12 data-[checked]:shadow-1 data-[highlighted]:text-n-12";

/**
 * The account row at the foot of the rail and its menu: the person, the theme, the language, the
 * manual, the shortcuts, what is new, the tour, the update check, the version and the health of
 * the project. The items run the same actions as the palette.
 */
export function AccountMenu({ compact }: { compact?: boolean }) {
	const { t, lang } = useI18n();
	const { theme, teamRole } = usePrefs();
	const navigate = useNavigate();
	const avatar = usePicture("avatar").data;
	const { list } = useActions();
	const signOut = useSignOut();
	const handle = useRightsView().data?.person.member;
	// The full name of the team file. A person with no team file has no name here.
	const person = useTeam().data?.team.members.find((m) => m.handle === handle)?.name;
	const name = person ?? t.shell.account;
	const { current } = useWhatsNew();
	const health = useHealth();
	const findings = health.data ?? [];
	// The dot shows the worst finding by shape and colour.
	const status: Status = health.isError
		? "danger"
		: health.data === undefined
			? "idle"
			: worstStatus(findings.map((f) => f.severity));
	// The health of the project hides the tools: the link opens the page that shows the worst finding.
	const ofProject = findings.filter((f) => f.group !== "tools");
	const scope =
		ofProject.length < findings.length && worstStatus(ofProject.map((f) => f.severity)) !== status
			? "/setup/computer"
			: "/setup/project";
	const action = (id: string) => {
		const a = list.find((x) => x.id === id);
		if (!a) throw new Error(`Missing action: ${id}`);
		return a;
	};
	// The short label of the menu. The palette keeps the full label of the action.
	const item = ([id, label]: [string, string]) => {
		const a = action(id);
		return (
			<Menu.Item key={id} className={ITEM} onClick={a.run}>
				{label}
				{a.shortcut ? (
					<Kbd aria-hidden="true" className="ml-auto">
						{a.shortcut}
					</Kbd>
				) : null}
			</Menu.Item>
		);
	};
	return (
		<Menu.Root>
			<Menu.Trigger
				title={t.shell.account}
				className={cn(
					"flex min-h-control min-w-0 shrink-0 items-center gap-3 rounded-md font-medium text-n-12 hover:bg-surface-1 data-[popup-open]:bg-surface-1 data-[popup-open]:shadow-1",
					compact ? "justify-center" : "px-3",
				)}
			>
				{/* The name comes from the text, so it holds the visible words (WCAG 2.5.3). The initials are not a part of it. */}
				<span aria-hidden="true" className="flex">
					<Avatar name={name} src={avatar ?? undefined} />
				</span>
				{person || compact ? <span className="sr-only">{t.shell.account} </span> : null}
				{compact && !person ? null : (
					<span className={compact ? "sr-only" : "min-w-0 truncate"}>{name}</span>
				)}
			</Menu.Trigger>
			<Menu.Portal>
				{/* In the page area, right of the rail (picture 064): the offset clears the 14 px padding of the rail. */}
				<Menu.Positioner side="right" align="end" sideOffset={18} className="z-50">
					<Menu.Popup
						className={cn(
							MENU_POPUP,
							"max-h-[var(--available-height)] w-94 max-w-[calc(100vw-2rem)] overflow-y-auto border-2 border-accent px-0",
						)}
					>
						<Menu.Item
							className={cn(ITEM, "min-h-19")}
							onClick={() => void navigate({ to: "/setup/me" })}
						>
							<span aria-hidden="true" className="flex">
								<Avatar name={name} src={avatar ?? undefined} />
							</span>
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="truncate">{name}</span>
								<span className="truncate font-normal text-n-11">{t.role[teamRole ?? "none"]}</span>
							</span>
							<span className={BTN}>{t.shell.change}</span>
						</Menu.Item>
						<div className={cn(ROW, "flex-wrap py-2.5")}>
							<span className="mr-auto font-semibold">{t.prefs.theme}</span>
							<Menu.RadioGroup
								aria-label={t.prefs.theme}
								value={theme}
								className="inline-flex rounded-md bg-n-4 p-1"
							>
								{(["light", "dark", "system"] as const).map((id) => {
									const a = action(`theme-${id}`);
									return (
										// The name holds the visible text (WCAG 2.5.3).
										<Menu.RadioItem
											key={id}
											value={id}
											aria-label={a.label}
											onClick={a.run}
											className={SEG}
										>
											{t.theme[id]}
										</Menu.RadioItem>
									);
								})}
							</Menu.RadioGroup>
						</div>
						<div className={ROW}>
							<span className="mr-auto font-semibold">{t.prefs.language}</span>
							<Menu.SubmenuRoot>
								{/* The name holds the visible text (WCAG 2.5.3). */}
								<Menu.SubmenuTrigger
									aria-label={`${t.prefs.language} ${t.lang[lang]}`}
									className={cn(BTN, "cursor-pointer data-[highlighted]:bg-n-3")}
								>
									{t.lang[lang]}
								</Menu.SubmenuTrigger>
								<Menu.Portal>
									<Menu.Positioner sideOffset={4} className="z-50">
										<Menu.Popup className={MENU_POPUP}>
											<Menu.RadioGroup value={lang}>
												{LANGS.map((l) => {
													const a = action(`lang-${l}`);
													return (
														<Menu.RadioItem key={l} value={l} onClick={a.run} className={MENU_ITEM}>
															{a.label}
															<Menu.RadioItemIndicator
																aria-hidden="true"
																className="ml-auto text-accent-text"
															>
																✓
															</Menu.RadioItemIndicator>
														</Menu.RadioItem>
													);
												})}
											</Menu.RadioGroup>
										</Menu.Popup>
									</Menu.Positioner>
								</Menu.Portal>
							</Menu.SubmenuRoot>
						</div>
						{(
							[
								["manual", t.shell.menu.manual],
								["shortcuts-help", t.shell.menu.shortcuts],
								["whats-new", t.shell.menu.whatsNew],
								["tour", t.shell.menu.tour],
								["update-check", t.shell.menu.update],
							] as [string, string][]
						).map(item)}
						{/* The version row opens the What is new dialog, which shows the version. */}
						<Menu.Item className={ITEM} onClick={action("whats-new").run}>
							{t.menu.about}
							{current ? (
								<span className="ml-auto font-mono text-13 font-normal text-n-11">
									<span className="sr-only">{format(t.shell.version, { version: current })}</span>
									<span aria-hidden="true">v{current}</span>
								</span>
							) : null}
						</Menu.Item>
						<Menu.Item
							className={ITEM}
							render={
								<Link
									to={scope}
									// shortcut: one cast. The section routes are built in a loop, so the link type does not know `page`.
									search={{ page: "health" } as never}
								/>
							}
						>
							{format(t.count, { name: t.shell.health, count: findings.length })}
							<StatusDot status={status} className="ml-auto" />
						</Menu.Item>
						{/* The last row: red, with the confirmation of what it removes. */}
						<Menu.Item className={cn(ITEM, "text-danger-text")} onClick={() => void signOut()}>
							{t.shellFn.signOut.label}
						</Menu.Item>
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	);
}
