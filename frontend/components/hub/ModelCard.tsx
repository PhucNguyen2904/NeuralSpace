import {
  Play,
  RefreshCw,
  Settings,
  Trash2,
  X,
  Cpu,
  AlertTriangle,
  Plus,
} from 'lucide-react'
import StatusBadge from '@/components/ui/StatusBadge'
import ProgressBar from '@/components/ui/ProgressBar'
import IconButton from '@/components/ui/IconButton'

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface Model {
  id: string
  name: string
  source: string
  status: 'ready' | 'downloading' | 'error' | 'initializing' | 'running'
  size: string
  meta: string
  category: string
  visual: 'barchart' | 'waveform' | 'chip' | 'image' | 'error'
  downloaded?: string
  progress?: number
}

/* ─── Thumbnail visuals ─────────────────────────────────────────────── */

function Thumbnail({ visual }: { visual: Model['visual'] }) {
  switch (visual) {
    case 'barchart':
      return (
        <div className="flex items-end gap-1 px-6">
          {[40, 55, 35, 65, 80, 70, 50].map((h, i) => (
            <div
              key={i}
              className="w-6 rounded-t-sm bg-[#2a3347]"
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
      )
    case 'waveform':
      return (
        <div className="flex items-center gap-0.5 px-4">
          {[20, 35, 55, 80, 60, 45, 70, 90, 65, 40, 55, 35].map((h, i) => (
            <div
              key={i}
              className="w-1.5 rounded-full bg-[#3b82f6]/60"
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
      )
    case 'chip':
      return (
        <div className="w-20 h-20 rounded-xl bg-[#1c2333] border border-[#2a3347] flex items-center justify-center">
          <Cpu size={36} className="text-[#3b82f6]/60" />
        </div>
      )
    case 'image':
      return (
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, #1c2333 0%, #0f1117 100%)',
          }}
        />
      )
    case 'error':
      return (
        <div className="flex flex-col items-center gap-2">
          <AlertTriangle size={32} className="text-[#ef4444]" />
          <span className="font-mono text-xs text-[#ef4444]">Checksum Mismatch</span>
        </div>
      )
  }
}

/* ─── ModelCard ─────────────────────────────────────────────────────── */

export function ModelCard({ model }: { model: Model }) {
  const isDownloading = model.status === 'downloading'
  const isError = model.status === 'error'
  const isReady = model.status === 'ready'

  return (
    <div className="bg-[#161b27] border border-[#2a3347] rounded-xl overflow-hidden hover:border-[#3d4f6e] transition-colors">

      {/* [A] Thumbnail */}
      <div className="h-[160px] relative bg-[#0f1117] flex items-center justify-center overflow-hidden">
        <Thumbnail visual={model.visual} />

        {/* Bottom fade overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#161b27]/70 pointer-events-none" />

        {/* Source badge */}
        <span className="absolute top-3 left-3 font-mono text-[10px] text-[#7a8ba0] uppercase tracking-wide">
          {model.source}
        </span>

        {/* Status badge */}
        <span className="absolute top-3 right-3">
          <StatusBadge status={model.status} />
        </span>
      </div>

      {/* [B] Body */}
      <div className="p-4">
        {/* Model name */}
        <p className="text-[17px] font-bold text-white leading-tight">{model.name}</p>

        {/* Stats row */}
        <div className="flex justify-between mt-1.5 mb-3">
          <span className="font-mono text-xs text-[#7a8ba0]">Size: {model.size}</span>
          <span className="font-mono text-xs text-[#7a8ba0]">{model.meta}</span>
        </div>

        {/* Download progress */}
        {isDownloading && model.progress !== undefined && (
          <div className="mb-3">
            <div className="flex justify-between mb-1">
              <span className="font-mono text-xs text-[#7a8ba0]">
                {model.downloaded} / {model.size}
              </span>
              <span className="font-mono text-xs text-white">{model.progress}%</span>
            </div>
            <ProgressBar value={model.progress} color="amber" />
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center gap-2">
          {/* Primary button */}
          {isReady && (
            <button className="flex-1 bg-[#1d4ed8] hover:bg-[#1e40af] text-white rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer">
              <Play size={14} fill="white" />
              Run
            </button>
          )}
          {isDownloading && (
            <button
              disabled
              className="flex-1 bg-[#1c2333] text-[#4a5568] rounded-lg py-2 text-sm cursor-not-allowed"
            >
              Run
            </button>
          )}
          {isError && (
            <button className="flex-1 border border-[#ef4444] text-[#ef4444] rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-[#ef4444]/10 transition-colors cursor-pointer">
              <RefreshCw size={14} />
              Retry
            </button>
          )}

          {/* Icon buttons */}
          {(isReady || isError) && (
            <>
              <IconButton icon={Settings} label="Settings" />
              <IconButton icon={Trash2} label="Delete" />
            </>
          )}
          {isDownloading && (
            <IconButton icon={X} label="Cancel download" />
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── ImportCard ────────────────────────────────────────────────────── */

export function ImportCard() {
  return (
    <div className="border-2 border-dashed border-[#2a3347] rounded-xl flex flex-col items-center justify-center min-h-[280px] cursor-pointer group hover:border-[#3b82f6] hover:bg-[#161b27]/40 transition-all duration-200">
      <div className="w-12 h-12 rounded-xl bg-[#1c2333] group-hover:bg-[#1e3050] flex items-center justify-center transition-colors">
        <Plus size={24} className="text-[#2a3347] group-hover:text-[#3b82f6] transition-colors" />
      </div>
      <p className="font-bold text-[#4a5568] group-hover:text-white mt-3 text-sm transition-colors">
        Import Model
      </p>
      <p className="text-xs text-[#4a5568] mt-1">Drag &amp; drop weights or URL</p>
    </div>
  )
}
