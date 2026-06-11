"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/leave", label: "Leave", icon: "📥" },
  { href: "/take", label: "Take", icon: "📤" },
  { href: "/community", label: "Community", icon: "💬" },
  { href: "/auth", label: "Account", icon: "👤" },
];

export default function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tab-bar">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`tab-item${pathname === t.href ? " active" : ""}`}
        >
          <span className="tab-icon">{t.icon}</span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
