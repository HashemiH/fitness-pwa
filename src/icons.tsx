import type { ReactNode, SVGProps } from "react"

type Name = "home" | "chart" | "dumbbell" | "calendar" | "user" | "search" | "bell" | "back" | "check"

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
}

export function Icon({ name, ...props }: { name: Name } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  )
}
