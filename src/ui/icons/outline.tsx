/** Static outline icons, same grid and stroke as the animated set (Heroicons, MIT). */
function Outline({ d, size = 16 }: { d: string; size?: number }) {
	return (
		<svg
			aria-hidden="true"
			fill="none"
			height={size}
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="1.5"
			viewBox="0 0 24 24"
			width={size}
			xmlns="http://www.w3.org/2000/svg"
		>
			<path d={d} />
		</svg>
	);
}

type Props = { size?: number };

export const PlusIcon = ({ size }: Props) => <Outline size={size} d="M12 4.5v15m7.5-7.5h-15" />;

export const ArrowDownTrayIcon = ({ size }: Props) => (
	<Outline
		size={size}
		d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
	/>
);

export const FolderOpenIcon = ({ size }: Props) => (
	<Outline
		size={size}
		d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776"
	/>
);

export const PlayIcon = ({ size }: Props) => (
	<Outline
		size={size}
		d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
	/>
);

export const StopIcon = ({ size }: Props) => (
	<Outline
		size={size}
		d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z"
	/>
);

export const BellIcon = ({ size }: Props) => (
	<Outline
		size={size}
		d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
	/>
);

export const LinkIcon = ({ size }: Props) => (
	<Outline
		size={size}
		d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
	/>
);
