"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface HeaderProps {
  title?: string;
  subtitle?: React.ReactNode;
}

export function Header({ title = "Montana River Intel", subtitle }: HeaderProps) {
  const pathname = usePathname();
  const isMap = pathname === "/";
  const isReports = pathname === "/reports";

  const navLink =
    "px-4 py-2.5 text-sm font-medium no-underline rounded-lg transition-all duration-200";

  return (
    <header className="flex-shrink-0 flex items-center justify-between h-16 px-5 md:px-8 bg-white border-b border-slate-200 z-30">
      <Link
        href="/"
        className="text-lg font-semibold tracking-tight text-slate-900 hover:text-slate-700 no-underline transition-colors duration-200"
      >
        {title}
      </Link>
      <div className="flex items-center gap-8">
        <nav className="flex items-center gap-0.5">
          <Link
            href="/"
            className={`${navLink} ${
              isMap
                ? "text-sky-600 bg-sky-50"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            Map
          </Link>
          <Link
            href="/reports"
            className={`${navLink} ${
              isReports
                ? "text-sky-600 bg-sky-50"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            Reports
          </Link>
        </nav>
        {subtitle !== undefined ? (
          <div className="text-sm text-slate-500">{subtitle}</div>
        ) : (
          <time
            dateTime={new Date().toISOString()}
            className="text-sm text-slate-500 tabular-nums hidden md:block"
          >
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
        )}
      </div>
    </header>
  );
}
