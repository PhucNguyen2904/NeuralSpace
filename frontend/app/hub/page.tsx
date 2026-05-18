'use client'

import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { ModelCard, ImportCard } from '@/components/hub/ModelCard'
import type { Model } from '@/components/hub/ModelCard'

/* ─── Mock data ─────────────────────────────────────────────────────── */

const models: Model[] = [
  {
    id: '1',
    name: 'Llama-3-70B',
    source: 'Hugging Face',
    status: 'ready',
    size: '4.5 GB',
    meta: 'Latency: 24ms',
    category: 'LLM',
    visual: 'barchart',
  },
  {
    id: '2',
    name: 'Stable Diffusion XL',
    source: 'Local Repository',
    status: 'downloading',
    size: '12.8 GB',
    meta: '48%',
    downloaded: '6.2 GB',
    progress: 48,
    category: 'Computer Vision',
    visual: 'image',
  },
  {
    id: '3',
    name: 'Mistral-7B-v0.1',
    source: 'Mistral AI',
    status: 'error',
    size: '4.1 GB',
    meta: 'Hash: 0x82f...a1',
    category: 'LLM',
    visual: 'error',
  },
  {
    id: '4',
    name: 'Whisper-Large-v3',
    source: 'OpenAI',
    status: 'ready',
    size: '3.1 GB',
    meta: '99% Acc.',
    category: 'Audio',
    visual: 'waveform',
  },
  {
    id: '5',
    name: 'BERT-Base-Uncased',
    source: 'Google',
    status: 'ready',
    size: '440 MB',
    meta: 'NLP/Enc.',
    category: 'LLM',
    visual: 'chip',
  },
]

const FILTERS = ['All', 'LLM', 'Computer Vision', 'Audio'] as const
type Filter = (typeof FILTERS)[number]

/* ─── Page ──────────────────────────────────────────────────────────── */

export default function HubPage() {
  const [activeFilter, setActiveFilter] = useState<Filter>('All')

  const filteredModels =
    activeFilter === 'All'
      ? models
      : models.filter((m) => m.category === activeFilter)

  return (
    <div>
      {/* Top stats bar */}
      <div className="flex items-center justify-between mb-6">

        {/* Filter tabs */}
        <div className="flex bg-[#161b27] border border-[#2a3347] rounded-full p-1 gap-1">
          {FILTERS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={`px-4 py-1.5 rounded-full text-sm transition-colors cursor-pointer ${
                activeFilter === tab
                  ? 'bg-white text-[#0f1117] font-semibold'
                  : 'text-[#7a8ba0] hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Sort label */}
        <div className="flex items-center gap-1.5 text-sm text-[#7a8ba0]">
          <SlidersHorizontal size={14} />
          Sort: Recently Used
        </div>
      </div>

      {/* Model grid */}
      <div className="grid grid-cols-3 gap-4">
        {filteredModels.map((model) => (
          <ModelCard key={model.id} model={model} />
        ))}
        <ImportCard />
      </div>
    </div>
  )
}
