"use client";

// app/components/ClientNavLink.tsx
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ClientNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const active =
    pathname === href ||
    (href !== "/" && pathname?.startsWith(href + "/")) ||
    (href !== "/" && pathname === href);

  return (
    <Link href={href} className={`rc-navLink ${active ? "rc-navLink--active" : ""}`}>
      {children}
    </Link>
  );
}
