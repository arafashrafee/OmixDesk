"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { LayoutDashboard, Users, Contact, FolderKanban, FileText, Receipt, ChartNoAxesCombined, Settings, Files, UserRound, Menu, X } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";

const icons = { Dashboard: LayoutDashboard, Overview: LayoutDashboard, Leads: Contact, Clients: Users, Projects: FolderKanban, Proposals: FileText, Invoices: Receipt, Reports: ChartNoAxesCombined, Settings, Files, Profile: UserRound };

export function WorkspaceNav({ links, portal = false }: { links: readonly (readonly [string, string])[]; portal?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <button ref={toggle} type="button" className="mobile-menu" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="workspace-navigation" onClick={() => setOpen(!open)}>
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
      <aside className={`workspace-sidebar ${open ? "is-open" : ""}`} id="workspace-navigation" onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); } }}>
        <Link href={portal ? "/portal" : "/dashboard"} className="workspace-brand" onClick={() => setOpen(false)}>
          <BrandMark priority />
          <span>OmixDesk<small>{portal ? "Client portal" : "Agency workspace"}</small></span>
        </Link>
        <nav aria-label={portal ? "Client portal" : "Main navigation"}>
          {links.map(([href, label]) => {
            const active = pathname === href || (href !== "/dashboard" && href !== "/portal" && pathname.startsWith(`${href}/`));
            const Icon = icons[label as keyof typeof icons] ?? FolderKanban;
            return <Link key={href} href={href} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)}><Icon size={19} aria-hidden="true" /><span>{label}</span></Link>;
          })}
        </nav>
        <p className="sidebar-footer">Omix Solutions</p>
      </aside>
    </>
  );
}
