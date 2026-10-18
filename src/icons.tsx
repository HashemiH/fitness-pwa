import type { ReactNode, SVGProps } from "react"

type Name = "home" | "chart" | "dumbbell" | "calendar" | "user" | "search" | "bell" | "back" | "check" | "x" | "doc" | "download" | "swap" | "bars" | "gear" | "cloud" | "power" | "meal"

const paths: Record<Name, ReactNode> = {
  home: <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />,
  chart: <path d="M4 19h16M7 16V9M12 16V5M17 16v-4" />,
  dumbbell: <path d="M6 9v6M18 9v6M3 10v4M21 10v4M6 12h12" />,
  calendar: <path d="M5 6h14v13H5zM8 4v4M16 4v4M5 10h14" />,
  user: <path d="M12 12a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 12 12zm-6 7.5a6 6 0 0 1 12 0" />,
  search: <><circle cx="11" cy="11" r="6" /><path d="m20 20-3.5-3.5" /></>,
  bell: <path d="M6 16h12l-1.2-2.2V10a4.8 4.8 0 0 0-9.6 0v3.8zM10 18a2 2 0 0 0 4 0" />,
  back: <path d="m14 6-6 6 6 6" />,
  check: <path d="m6 12 4 4 8-8" />,
  x: <path d="M6 6 18 18M18 6 6 18" />,
  doc: <><path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" /><path d="M14 3.5V8h4M8.5 12h7M8.5 16h5" /></>,
  download: <path d="M12 4v10M8 10.5 12 14.5l4-4M5 19h14" />,
  swap: <path d="M7 8h11M15 5l3 3-3 3M17 16H6M9 13l-3 3 3 3" />,
  bars: <path d="M5 19V10M12 19V5M19 19v-7" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6.1 6.1l1.4 1.4M16.5 16.5l1.4 1.4M17.9 6.1l-1.4 1.4M7.5 16.5l-1.4 1.4" /></>,
  cloud: <path d="M7.2 18h9.3a3.8 3.8 0 0 0 .5-7.6 5.2 5.2 0 0 0-10 1.5A3.3 3.3 0 0 0 7.2 18z" />,
  power: <path d="M12 3.5V11M7.4 6.6a6.5 6.5 0 1 0 9.2 0" />,
  meal: <path d="M8 4.5v6.2M12 4.5V11M16 4.5v6.2M6.5 10.8h11a5.2 5.2 0 0 1-5.2 5.2h-.6A5.2 5.2 0 0 1 6.5 10.8zM12 16v3.5" />,
}

const filledPaths: Partial<Record<Name, ReactNode>> = {
  home: <path d="M12 3.4 3.6 10.4A1 1 0 0 0 4.2 12H6v7.2A1.2 1.2 0 0 0 7.2 20.4h3.1v-5.2h3.4v5.2h3.1a1.2 1.2 0 0 0 1.2-1.2V12h1.8a1 1 0 0 0 .6-1.6z" />,
  chart: <><rect x="4.5" y="12" width="3.4" height="6.5" rx="1.1" /><rect x="10.3" y="7" width="3.4" height="11.5" rx="1.1" /><rect x="16.1" y="9.5" width="3.4" height="9" rx="1.1" /></>,
  dumbbell: <path d="M3.2 10.2h2.1v3.6H3.2A1.2 1.2 0 0 1 2 12.6v-1.2a1.2 1.2 0 0 1 1.2-1.2zm15.5 0H20.8a1.2 1.2 0 0 1 1.2 1.2v1.2a1.2 1.2 0 0 1-1.2 1.2h-2.1zM5.5 9h2.2v6H5.5zm10.8 0h2.2v6h-2.2zM7.7 11h8.6v2H7.7z" />,
  calendar: <path d="M8 3.2a1 1 0 0 1 1 1V5h6V4.2a1 1 0 1 1 2 0V5h1.2A1.8 1.8 0 0 1 20 6.8v11.4A1.8 1.8 0 0 1 18.2 20H5.8A1.8 1.8 0 0 1 4 18.2V6.8A1.8 1.8 0 0 1 5.8 5H7V4.2a1 1 0 0 1 1-1z" />,
  user: <><circle cx="12" cy="8" r="3.3" /><path d="M5.6 19.4a6.4 6.4 0 0 1 12.8 0 1 1 0 0 1-1 .8H6.6a1 1 0 0 1-1-.8z" /></>,
  meal: <path d="M7.2 3.8v6.4a1.6 1.6 0 0 0 1.6 1.6H11V20h2v-8.2h1.4a1.6 1.6 0 0 0 1.6-1.6V3.8h-1.8v5.2h-1.2V3.8h-1.8v5.2H10V3.8z" />,
}

export function Icon({ name, filled = false, ...props }: { name: Name; filled?: boolean } & SVGProps<SVGSVGElement>) {
  const solid = filled && filledPaths[name] != null
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill={solid ? "currentColor" : "none"} stroke={solid ? "none" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {solid ? filledPaths[name] : paths[name]}
    </svg>
  )
}
