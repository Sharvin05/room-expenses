"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/lib/actions/auth";

export type NavItem = { href: string; label: string };

export default function AppHeader({
  homeHref,
  brand,
  tag,
  navItems,
  userName,
}: {
  homeHref: string;
  brand: string;
  tag?: string;
  navItems: NavItem[];
  userName: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <Link href={homeHref} className="flex items-center gap-2 font-semibold min-w-0">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              R
            </span>
            <span className="truncate">{brand}</span>
            {tag ? (
              <span className="ml-1 hidden rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted sm:inline">
                {tag}
              </span>
            ) : null}
          </Link>
          <DesktopNav items={navItems} pathname={pathname} />
        </div>

        <div className="hidden items-center gap-3 text-sm md:flex">
          <span className="max-w-[10rem] truncate text-muted">{userName}</span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-border bg-surface-muted px-3 py-1.5 hover:bg-border"
            >
              Sign out
            </button>
          </form>
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="app-mobile-nav"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface-muted text-foreground hover:bg-border md:hidden"
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      <MobileNav
        id="app-mobile-nav"
        open={open}
        items={navItems}
        pathname={pathname}
        userName={userName}
      />
    </header>
  );
}

function DesktopNav({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <nav className="hidden gap-1 text-sm md:flex">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "rounded-md bg-surface-muted px-3 py-1.5 font-medium text-foreground"
                : "rounded-md px-3 py-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function MobileNav({
  id,
  open,
  items,
  pathname,
  userName,
}: {
  id: string;
  open: boolean;
  items: NavItem[];
  pathname: string;
  userName: string;
}) {
  return (
    <div
      id={id}
      hidden={!open}
      className="border-t border-border bg-surface md:hidden"
    >
      <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3 text-sm">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? "rounded-md bg-surface-muted px-3 py-2 font-medium text-foreground"
                  : "rounded-md px-3 py-2 text-muted hover:bg-surface-muted hover:text-foreground"
              }
            >
              {item.label}
            </Link>
          );
        })}
        <div className="mt-2 flex items-center justify-between border-t border-border pt-3">
          <span className="truncate text-muted">{userName}</span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-border bg-surface-muted px-3 py-1.5 text-sm hover:bg-border"
            >
              Sign out
            </button>
          </form>
        </div>
      </nav>
    </div>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="6" y1="18" x2="18" y2="6" />
    </svg>
  );
}
