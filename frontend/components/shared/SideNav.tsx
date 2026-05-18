'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

interface SideNavProps {
  collapsed?: boolean;
}

export function SideNav({ collapsed = false }: SideNavProps) {
  const pathname = usePathname();

  const navItems = [
    { href: '/model-hub', icon: 'hub', label: 'Hub' },
    { href: '/workspace', icon: 'terminal', label: 'Workspace' },
    { href: '/settings', icon: 'settings', label: 'Settings' },
  ];

  if (collapsed) {
    return (
      <aside className="bg-surface-container border-r border-outline-variant flex flex-col h-screen py-margin gap-stack-lg w-[72px] items-center shrink-0">
        <div className="mb-stack-lg">
          <span className="material-symbols-outlined text-primary text-[32px]">
            hub
          </span>
        </div>
        <nav className="flex flex-col gap-stack-md flex-grow">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`w-12 h-12 flex items-center justify-center rounded-lg transition-all ${
                pathname === item.href
                  ? 'bg-secondary-container text-on-secondary-container border-l-2 border-primary'
                  : 'hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface'
              }`}
              title={item.label}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <button className="w-12 h-12 flex items-center justify-center rounded-lg hover:bg-surface-container-highest text-on-surface-variant transition-all">
            <span className="material-symbols-outlined">downloading</span>
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex flex-col h-screen py-margin gap-stack-lg bg-surface-container border-r border-outline-variant w-sidebar-width shrink-0">
      <div className="px-margin flex flex-col gap-base">
        <div className="flex items-center gap-stack-sm">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary text-[20px]">
              hub
            </span>
          </div>
          <div>
            <h1 className="font-headline-md text-headline-md font-bold text-on-surface">
              NeuralForge
            </h1>
            <p className="font-label-mono text-label-mono text-on-surface-variant">
              v2.4.0-stable
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-stack-md px-4 py-2 transition-all ${
              pathname === item.href
                ? 'bg-secondary-container text-on-secondary-container border-l-2 border-primary translate-x-1'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
            }`}
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="font-body-md text-body-md">{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="px-margin pt-4 border-t border-outline-variant">
        <button className="w-full bg-primary text-on-primary font-bold py-3 rounded-lg hover:brightness-110 transition-all flex items-center justify-center gap-2 active:scale-95">
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span className="font-body-md text-body-md">Deploy New Model</span>
        </button>
      </div>

      <div className="mt-auto px-4">
        <div className="flex items-center gap-stack-md px-4 py-2 text-on-surface-variant">
          <span className="material-symbols-outlined">downloading</span>
          <span className="font-body-md text-body-md">Active Downloads</span>
          <span className="ml-auto bg-primary-container text-on-primary-container px-2 rounded-full text-[10px] font-bold">
            2
          </span>
        </div>
      </div>
    </aside>
  );
}
