import { Search, Settings, LayoutGrid, BarChart2 } from 'lucide-react'

const systemStats = [
  { label: 'CPU', value: '24%',    color: 'bg-[#f59e0b]', width: '24%' },
  { label: 'GPU', value: '68%',    color: 'bg-[#ef4444]', width: '68%' },
  { label: 'RAM', value: '12.4GB', color: 'bg-[#3b82f6]', width: '52%' },
]

export default function TopBar() {
  return (
    <header className="h-[56px] bg-[#0f1117]/80 backdrop-blur-sm border-b border-[#2a3347] sticky top-0 z-40 flex items-center justify-between px-6">

      {/* Left: CPU / GPU / RAM mini-stats */}
      <div className="flex items-center gap-5 font-mono text-xs">
        {systemStats.map(({ label, value, color, width }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[#4a5568]">{label}</span>
            <div className="w-16 h-1 bg-[#2a3347] rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${color}`} style={{ width }} />
            </div>
            <span className="text-white">{value}</span>
          </div>
        ))}
      </div>

      {/* Center: Search input */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a5568]"
        />
        <input
          type="text"
          className="bg-[#161b27] border border-[#2a3347] rounded-lg pl-9 pr-4 py-2 text-sm font-mono text-[#e2e8f0] placeholder-[#4a5568] w-[280px] focus:outline-none focus:border-[#3b82f6] transition-colors"
          placeholder="Search resources..."
        />
      </div>

      {/* Right: icon buttons + avatar */}
      <div className="flex items-center gap-2">
        {([Settings, LayoutGrid, BarChart2] as const).map((Icon, i) => (
          <button
            key={i}
            className="w-8 h-8 bg-[#161b27] border border-[#2a3347] rounded-lg flex items-center justify-center text-[#7a8ba0] hover:text-white transition-colors cursor-pointer"
          >
            <Icon size={16} />
          </button>
        ))}
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6] ml-1 shrink-0" />
      </div>

    </header>
  )
}
