'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Network, LayoutGrid, Layers, Settings, Rocket } from 'lucide-react'
import { fetchTasks } from '@/services/api'

const navItems = [
  { href: '/hub',       icon: LayoutGrid,  label: 'Hub' },
  { href: '/workspace', icon: Layers,       label: 'Workspace' },
  { href: '/settings',  icon: Settings,     label: 'Settings' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [activeDownloadCount, setActiveDownloadCount] = useState(0)

  // Poll active downloads every 5 seconds
  useEffect(() => {
    const pollTasks = async () => {
      try {
        const data = await fetchTasks()
        setActiveDownloadCount(data.total)
      } catch {
        setActiveDownloadCount(0)
      }
    }

    pollTasks()
    const interval = setInterval(pollTasks, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleDeployNewModel = () => {
    router.push('/workspace')
  }

  return (
    <aside className="fixed left-0 top-0 w-[248px] h-screen bg-[#0d1018] flex flex-col z-50">

      {/* [A] Logo block */}
      <div className="px-5 py-6 flex items-center gap-3">
        <Network size={28} className="text-[#3b82f6] shrink-0" />
        <div className="flex flex-col">
          <p className="font-bold text-white text-[15px] leading-none">
            NeuralForge
          </p>
          <p className="font-mono text-[11px] text-[#4a5568] mt-0.5">
            v2.4.0-stable
          </p>
        </div>
      </div>

      {/* [B] Nav */}
      <nav className="flex-1 px-3 mt-2 space-y-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={
                isActive
                  ? 'flex items-center gap-3 px-[13px] py-2.5 rounded-lg rounded-l-none bg-[#1c2333] text-white border-l-[3px] border-[#3b82f6] text-sm transition-colors duration-150'
                  : 'flex items-center gap-3 px-4 py-2.5 rounded-lg text-[#7a8ba0] text-sm hover:bg-[#1c2333] hover:text-white transition-colors duration-150'
              }
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* [C] Bottom section */}
      <div className="p-4 space-y-3">
        {/* CTA button */}
        <button
          onClick={handleDeployNewModel}
          className="w-full bg-gradient-to-r from-[#1d4ed8] to-[#2563eb] text-white font-bold text-sm py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity cursor-pointer"
        >
          <Rocket size={16} />
          Deploy New Model
        </button>

        {/* Footer badge */}
        <div className="flex items-center gap-2 px-1 py-2">
          <div className="w-5 h-5 rounded-full border-2 border-[#3b82f6] border-t-transparent animate-spin shrink-0" />
          <span className="text-[#7a8ba0] text-xs">Active Downloads</span>
          <span className="bg-[#1d4ed8] text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ml-auto">
            {activeDownloadCount}
          </span>
        </div>
      </div>

    </aside>
  )
}
