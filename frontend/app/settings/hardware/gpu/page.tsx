'use client'

import { useState } from 'react'
import {
  ChevronRight,
  Cpu,
  SlidersHorizontal,
  Monitor,
  RefreshCw,
  Zap,
  Leaf,
  Scale,
  Info,
  Save,
} from 'lucide-react'
import MonoLabel from '@/components/ui/MonoLabel'
import ProgressBar from '@/components/ui/ProgressBar'
import { updateGpuSettings, checkDriverUpdates } from '@/services/api'

/* ─── Mock data ─────────────────────────────────────────────────────── */

const devices = [
  {
    id: 'PCI-E_8E_00.0',
    name: 'NVIDIA RTX 4090',
    memUsed: 12.4,
    memTotal: 24,
    temp: '64°C',
    status: 'CONNECTED',
    active: true,
  },
  {
    id: 'PCI-E_12_01.0',
    name: 'NVIDIA A100',
    memUsed: 0,
    memTotal: 80,
    temp: null,
    status: 'STANDBY',
    active: false,
  },
]

const profiles = [
  {
    id: 'power-saving',
    icon: Leaf,
    iconColor: 'text-[#22c55e]',
    title: 'Power Saving',
    desc: 'Minimizes power consumption and fan noise. Best for lightweight inference.',
  },
  {
    id: 'standard',
    icon: Scale,
    iconColor: 'text-[#3b82f6]',
    title: 'Standard',
    desc: 'Optimized balance between throughput and thermal efficiency.',
  },
  {
    id: 'max-performance',
    icon: Zap,
    iconColor: 'text-[#f59e0b]',
    title: 'Max Performance',
    desc: 'Unlocks full TGP and core clock speeds. High thermal load expected.',
  },
]

const breadcrumb = ['Settings', 'Hardware', 'GPU']
const vramLabels = ['0 GB', '8 GB', '16 GB', '24 GB']
const priorityOpts = ['LOW', 'BALANCED', 'HIGH'] as const
const thermalStats = [
  { label: 'THERMAL',   value: '64°C', color: 'text-[#f59e0b]' },
  { label: 'FAN SPEED', value: '40%',  color: 'text-[#3b82f6]' },
]

/* ─── Page ──────────────────────────────────────────────────────────── */

export default function GpuSettingsPage() {
  const [vramLimit, setVramLimit] = useState(18)
  const [computePriority, setComputePriority] = useState<'LOW' | 'BALANCED' | 'HIGH'>('BALANCED')
  const [cudaEnabled, setCudaEnabled] = useState(true)
  const [performanceProfile, setPerformanceProfile] = useState('standard')
  const [saving, setSaving] = useState(false)
  const [checkingUpdates, setCheckingUpdates] = useState(false)

  const handleResetToDefaults = () => {
    if (!window.confirm('Reset all settings to defaults?')) return
    setVramLimit(18)
    setComputePriority('BALANCED')
    setCudaEnabled(true)
    setPerformanceProfile('standard')
    alert('✅ Settings reset to defaults')
  }

  const handleSaveChanges = async () => {
    setSaving(true)
    try {
      const result = await updateGpuSettings({
        vramLimit,
        computePriority,
        cudaEnabled,
        performanceProfile,
      })
      alert('✅ GPU settings saved successfully')
    } catch (err) {
      alert(`❌ Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true)
    try {
      const result = await checkDriverUpdates()
      if (result.available) {
        alert(`✅ Update available: ${result.currentVersion} → ${result.newVersion}`)
      } else {
        alert(`✅ Driver is up to date: ${result.currentVersion}`)
      }
    } catch (err) {
      alert(`❌ Failed to check: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setCheckingUpdates(false)
    }
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-56px)]">
      <div className="flex-1 pb-6">

        {/* ── [A] BREADCRUMB ───────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-6">
          {breadcrumb.map((seg, i) => (
            <span key={seg} className="flex items-center gap-2">
              {i > 0 && <ChevronRight size={12} className="text-[#4a5568]" />}
              <span
                className={`font-mono text-[11px] uppercase tracking-wide ${
                  i === 2 ? 'text-[#e2e8f0]' : 'text-[#4a5568]'
                }`}
              >
                {seg}
              </span>
            </span>
          ))}
        </div>

        {/* ── [B] TITLE ────────────────────────────────────────────── */}
        <h1 className="text-2xl font-bold text-white mb-6">Device Selection</h1>

        {/* ── [C] DEVICE CARDS ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {devices.map((device) => (
            <div
              key={device.id}
              className={`bg-[#161b27] border rounded-xl p-5 ${
                device.active ? 'border-[#3b82f6]' : 'border-[#2a3347]'
              }`}
            >
              {/* Top row */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#1c2333] rounded-lg border border-[#2a3347] flex items-center justify-center shrink-0">
                    <Cpu size={22} className="text-[#7a8ba0]" />
                  </div>
                  <div>
                    <p className="font-bold text-white text-[17px]">{device.name}</p>
                    <p className="font-mono text-xs text-[#4a5568] mt-0.5">
                      ID: {device.id}
                    </p>
                  </div>
                </div>
                {device.active && (
                  <span className="bg-[#1e3050] text-[#60a5fa] font-mono text-[10px] uppercase tracking-wide px-2.5 py-1 rounded-md shrink-0">
                    Active Node
                  </span>
                )}
              </div>

              {/* Memory */}
              <div className="mt-4">
                <MonoLabel className="mb-1.5 block">Memory Usage</MonoLabel>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-mono text-sm text-white">
                    {device.memUsed} GB / {device.memTotal} GB
                  </span>
                </div>
                <ProgressBar
                  value={(device.memUsed / device.memTotal) * 100}
                  color="blue"
                />
              </div>

              {/* Status row */}
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      device.active ? 'bg-[#22c55e]' : 'bg-[#4a5568]'
                    }`}
                  />
                  <span
                    className={`font-mono text-xs ${
                      device.active ? 'text-[#22c55e]' : 'text-[#4a5568]'
                    }`}
                  >
                    {device.status}
                  </span>
                </div>
                {device.temp && (
                  <span className="font-mono text-xs text-[#4a5568]">
                    🌡 {device.temp}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── [D] MAIN GRID ─────────────────────────────────────────── */}
        <div className="grid grid-cols-[1fr_340px] gap-4">

          {/* LEFT COLUMN */}
          <div>

            {/* [D1] Resource Allocation */}
            <div className="bg-[#161b27] border border-[#2a3347] rounded-xl p-6 mb-4">
              <div className="flex items-center gap-2 mb-5">
                <SlidersHorizontal size={18} className="text-[#7a8ba0]" />
                <h2 className="font-bold text-white">Resource Allocation</h2>
              </div>

              {/* VRAM Limit */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <MonoLabel>VRAM Limit</MonoLabel>
                  <span className="bg-[#1c2333] border border-[#2a3347] font-mono text-sm text-white px-3 py-1 rounded-lg">
                    {vramLimit}.0 GB / 24.0 GB
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={24}
                  step={0.5}
                  value={vramLimit}
                  onChange={(e) => setVramLimit(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between mt-1">
                  {vramLabels.map((l) => (
                    <span key={l} className="font-mono text-[10px] text-[#4a5568]">
                      {l}
                    </span>
                  ))}
                </div>
              </div>

              {/* Compute Priority */}
              <div className="mb-6">
                <MonoLabel className="mb-2 block">Compute Priority</MonoLabel>
                <div className="bg-[#0f1117] border border-[#2a3347] rounded-lg p-1 flex gap-1">
                  {priorityOpts.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setComputePriority(opt)}
                      className={`flex-1 py-2.5 text-center font-mono text-xs uppercase rounded-md transition-colors cursor-pointer ${
                        computePriority === opt
                          ? 'bg-white text-[#0f1117] font-bold'
                          : 'text-[#4a5568] hover:text-[#7a8ba0]'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* CUDA Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white text-sm">CUDA Core Utilization</p>
                  <p className="font-mono text-xs text-[#4a5568] mt-0.5">
                    Enable parallel processing for accelerated training.
                  </p>
                </div>
                <button
                  onClick={() => setCudaEnabled(!cudaEnabled)}
                  className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${
                    cudaEnabled ? 'bg-[#3b82f6]' : 'bg-[#2a3347]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      cudaEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* [D2] Advanced Drivers */}
            <div className="bg-[#161b27] border border-[#2a3347] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Monitor size={18} className="text-[#7a8ba0]" />
                <h2 className="font-bold text-white">Advanced Drivers</h2>
              </div>

              <div className="grid grid-cols-2 gap-6 mt-4">
                {/* Left: driver info */}
                <div>
                  <MonoLabel>Driver Version</MonoLabel>
                  <p className="font-mono font-bold text-white text-2xl mt-1">
                    v550.54.14
                  </p>
                  <button
                    onClick={handleCheckUpdates}
                    disabled={checkingUpdates}
                    className="mt-3 border border-[#2a3347] text-[#7a8ba0] text-sm px-4 py-2 rounded-lg flex items-center gap-2 hover:text-white hover:border-[#3d4f6e] disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <RefreshCw size={14} />
                    {checkingUpdates ? 'Checking...' : 'Check for Updates'}
                  </button>
                  <div className="mt-4">
                    <MonoLabel>Kernel Interface</MonoLabel>
                    <p className="font-mono text-xs text-[#7a8ba0] mt-1">
                      CUDA v12.4 | CuDNN v8.9.7
                    </p>
                  </div>
                </div>

                {/* Right: thermal stats */}
                <div className="bg-[#0f1117] border border-[#2a3347] rounded-xl p-4 grid grid-cols-2 gap-4">
                  {thermalStats.map((stat) => (
                    <div key={stat.label}>
                      <MonoLabel>{stat.label}</MonoLabel>
                      <p className={`font-mono font-bold text-3xl mt-1 ${stat.color}`}>
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div>

            {/* [D3] Performance Profiles */}
            <div className="bg-[#161b27] border border-[#2a3347] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={18} className="text-[#f59e0b]" />
                <h2 className="font-bold text-white">Performance Profiles</h2>
              </div>

              {profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPerformanceProfile(p.id)}
                  className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left mb-2 transition-colors cursor-pointer ${
                    performanceProfile === p.id
                      ? 'border-[#3b82f6] bg-[#1e3050]/30'
                      : 'border-[#2a3347] hover:border-[#3d4f6e]'
                  }`}
                >
                  <p.icon
                    size={20}
                    className={`${p.iconColor} mt-0.5 shrink-0`}
                  />
                  <div className="flex-1">
                    <p className="font-bold text-white text-sm">{p.title}</p>
                    <p className="text-[#7a8ba0] text-xs mt-0.5 leading-relaxed">
                      {p.desc}
                    </p>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                      performanceProfile === p.id
                        ? 'border-[#3b82f6]'
                        : 'border-[#4a5568]'
                    }`}
                  >
                    {performanceProfile === p.id && (
                      <div className="w-2 h-2 rounded-full bg-[#3b82f6]" />
                    )}
                  </div>
                </button>
              ))}

              {/* Note box */}
              <div className="bg-[#0f1117] border border-[#2a3347] rounded-xl p-3 flex gap-2 mt-2">
                <Info size={14} className="text-[#4a5568] shrink-0 mt-0.5" />
                <p className="font-mono text-xs text-[#4a5568] leading-relaxed">
                  Changes to performance profiles may require a kernel restart to take
                  effect across all active workspaces.
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── [E] FOOTER ───────────────────────────────────────────────── */}
      <div className="border-t border-[#2a3347] flex items-center justify-between px-8 py-4 -mx-8">
        <span className="font-mono text-xs text-[#4a5568]">
          Last synced: 2 minutes ago
        </span>
        <div className="flex gap-3">
          <button
            onClick={handleResetToDefaults}
            className="bg-[#161b27] border border-[#2a3347] text-[#7a8ba0] px-5 py-2.5 rounded-lg text-sm hover:text-white hover:border-[#3d4f6e] transition-colors cursor-pointer"
          >
            Reset to Defaults
          </button>
          <button
            onClick={handleSaveChanges}
            disabled={saving}
            className="bg-[#1d4ed8] hover:bg-[#1e40af] disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Save size={15} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

    </div>
  )
}
