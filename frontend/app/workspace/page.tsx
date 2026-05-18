'use client'

import {
  Link,
  Download,
  CheckCircle,
  Bot,
  X,
  Gauge,
  Clock,
  HardDrive,
  Sparkles,
  Shield,
  Users,
} from 'lucide-react'
import MonoLabel from '@/components/ui/MonoLabel'
import ProgressBar from '@/components/ui/ProgressBar'

/* ─── Mock data ─────────────────────────────────────────────────────── */

const activeTasks = [
  {
    id: '1',
    filename: 'llama-3-8b-instruct.Q4_K_M.gguf',
    speed: '12.5 MB/s',
    eta: '2m 45s',
    downloaded: '4.2GB',
    total: '8.5GB',
    progress: 49,
    status: 'DOWNLOADING',
    statusColor: 'green' as const,
  },
  {
    id: '2',
    filename: 'mistral-7b-v0.1-fp16',
    speed: '4.1 MB/s',
    eta: '14m 10s',
    downloaded: '1.1GB',
    total: '14.0GB',
    progress: 8,
    status: 'INITIALIZING SHARDS',
    statusColor: 'amber' as const,
  },
]

const features = [
  {
    icon: Sparkles,
    iconColor: 'text-[#f59e0b]',
    title: 'Auto-Detect',
    body: 'NeuralForge automatically parses GGUF, SafeTensors, and Pytorch formats.',
  },
  {
    icon: Shield,
    iconColor: 'text-[#22c55e]',
    title: 'Verify Hashes',
    body: 'SHA-256 validation is performed on every block during the download process.',
  },
  {
    icon: Users,
    iconColor: 'text-[#3b82f6]',
    title: 'Resume Support',
    body: "If your connection drops, we'll automatically resume from the last byte received.",
  },
]

const featureChips = ['Git LFS Support', 'Automated Quantization', 'Pytorch & Safetensors']

/* ─── Page ──────────────────────────────────────────────────────────── */

export default function WorkspacePage() {
  return (
    <div>

      {/* ── [A] HERO ─────────────────────────────────────────────── */}
      <div className="text-center py-10">
        <h1 className="text-[48px] font-bold text-white tracking-[-0.03em] leading-none">
          Import Neural Engine
        </h1>
        <p className="text-[#7a8ba0] text-base mt-3">
          Pull models directly from Hugging Face or specify a custom manifest URL
          to register them in your local Workspace.
        </p>
      </div>

      {/* ── [B] INPUT CARD ───────────────────────────────────────── */}
      <div className="max-w-[860px] mx-auto mt-8 bg-[#161b27] border border-[#2a3347] rounded-xl p-6">
        <MonoLabel className="mb-2 block">Model Manifest / ID</MonoLabel>

        {/* Input row */}
        <div className="flex gap-3">
          {/* Input */}
          <div className="flex-1 relative">
            <Link
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a5568]"
            />
            <input
              type="text"
              className="w-full bg-[#0f1117] border border-[#2a3347] rounded-lg pl-9 pr-4 py-3 font-mono text-sm text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none focus:border-[#3b82f6] transition-colors"
              placeholder="e.g. meta-llama/Llama-2-7b-hf or https://hf.co/..."
            />
          </div>

          {/* Download button */}
          <button className="bg-[#1d4ed8] hover:bg-[#1e40af] text-white font-bold px-6 py-3 rounded-lg flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer">
            <Download size={18} />
            Download
          </button>
        </div>

        {/* Feature chips */}
        <div className="flex items-center gap-6 mt-5">
          {featureChips.map((label) => (
            <div key={label} className="flex items-center gap-1.5">
              <CheckCircle size={14} className="text-[#22c55e]" />
              <span className="font-mono text-xs text-[#7a8ba0]">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── [C] ACTIVE TASKS ─────────────────────────────────────── */}
      <div className="max-w-[860px] mx-auto mt-8">

        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-lg text-white">Active Tasks</h2>
            <span className="bg-[#1e3a2e] text-[#22c55e] font-mono text-[11px] uppercase tracking-wide px-2.5 py-0.5 rounded-md">
              {activeTasks.length} Running
            </span>
          </div>
          <button className="text-sm text-[#4a5568] hover:text-white transition-colors cursor-pointer">
            Clear Completed
          </button>
        </div>

        {/* Task cards */}
        <div className="space-y-3">
          {activeTasks.map((task) => (
            <div
              key={task.id}
              className="bg-[#161b27] border border-[#2a3347] rounded-xl p-5"
            >
              {/* Row 1: filename + cancel */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#1c2333] border border-[#2a3347] flex items-center justify-center shrink-0">
                    <Bot size={16} className="text-[#7a8ba0]" />
                  </div>
                  <span className="font-mono font-bold text-white text-sm truncate max-w-[480px]">
                    {task.filename}
                  </span>
                </div>
                <button className="border border-[#ef4444] text-[#ef4444] text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 hover:bg-[#ef4444]/10 transition-colors cursor-pointer shrink-0">
                  <X size={12} />
                  Cancel
                </button>
              </div>

              {/* Row 2: speed / ETA / size */}
              <div className="flex items-center gap-6 mt-2">
                {[
                  { icon: Gauge,     value: task.speed },
                  { icon: Clock,     value: `ETA: ${task.eta}` },
                  { icon: HardDrive, value: `${task.downloaded} / ${task.total}` },
                ].map(({ icon: Icon, value }) => (
                  <div key={value} className="flex items-center gap-1.5">
                    <Icon size={13} className="text-[#4a5568]" />
                    <span className="font-mono text-xs text-[#7a8ba0]">{value}</span>
                  </div>
                ))}
              </div>

              {/* Row 3: status label + progress bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`font-mono text-[11px] uppercase tracking-widest ${
                      task.statusColor === 'amber'
                        ? 'text-[#f59e0b]'
                        : 'text-[#22c55e]'
                    }`}
                  >
                    {task.status}
                  </span>
                  <span className="font-mono text-xs text-white">
                    {task.progress}%
                  </span>
                </div>
                <ProgressBar
                  value={task.progress}
                  color={task.statusColor === 'amber' ? 'amber' : 'green'}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── [D] FEATURE CARDS ────────────────────────────────────── */}
      <div className="max-w-[860px] mx-auto mt-8 grid grid-cols-3 gap-4">
        {features.map(({ icon: Icon, iconColor, title, body }) => (
          <div
            key={title}
            className="bg-[#161b27] border border-[#2a3347] rounded-xl p-5"
          >
            <Icon size={26} className={iconColor} />
            <h3 className="font-bold text-white text-sm mt-3">{title}</h3>
            <p className="text-[#7a8ba0] text-xs mt-1.5 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>

    </div>
  )
}
