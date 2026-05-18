'use client';

import { useState } from 'react';
import { SideNav, TopAppBar } from '@/components/shared';

export default function ModelHubPage() {
  const [category, setCategory] = useState('all');

  const categories = [
    { id: 'all', label: 'All', count: 12 },
    { id: 'llm', label: 'LLM', count: 7 },
    { id: 'vision', label: 'Computer Vision', count: 3 },
    { id: 'audio', label: 'Audio', count: 2 },
  ];

  const models = [
    {
      name: 'Llama 3-70B',
      status: 'Ready',
      statusColor: 'bg-tertiary',
      size: '140 GB',
      downloads: '12.5K',
    },
    {
      name: 'Mistral-7B',
      status: 'Downloading',
      statusColor: 'bg-primary',
      size: '15 GB',
      downloads: '8.2K',
    },
    {
      name: 'GPT-2',
      status: 'Ready',
      statusColor: 'bg-tertiary',
      size: '548 MB',
      downloads: '45K',
    },
    {
      name: 'CLIP Vision',
      status: 'Error',
      statusColor: 'bg-error',
      size: '1.7 GB',
      downloads: '3.1K',
    },
    {
      name: 'Whisper-Large',
      status: 'Ready',
      statusColor: 'bg-tertiary',
      size: '2.9 GB',
      downloads: '5.8K',
    },
    {
      name: 'Stable Diffusion',
      status: 'Ready',
      statusColor: 'bg-tertiary',
      size: '4.2 GB',
      downloads: '9.3K',
    },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <SideNav collapsed />

      <main className="flex-grow flex flex-col overflow-hidden">
        <TopAppBar showMetrics={false} />

        {/* Content Area */}
        <div className="flex-grow overflow-y-auto bg-background">
          <div className="max-w-7xl mx-auto p-margin">
            {/* Header Section */}
            <div className="mb-stack-lg">
              <h1 className="font-headline-xl text-headline-xl text-on-surface mb-2">
                Model Hub
              </h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant">
                Browse and download AI models for local deployment
              </p>
            </div>

            {/* Category Filter */}
            <div className="flex gap-stack-md mb-stack-lg overflow-x-auto pb-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={`px-4 py-2 rounded-lg font-body-md text-body-md whitespace-nowrap transition-all ${
                    category === cat.id
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant'
                  }`}
                >
                  {cat.label}
                  <span className="ml-2 text-[12px]">({cat.count})</span>
                </button>
              ))}
            </div>

            {/* Models Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-stack-md">
              {/* Import Card */}
              <div className="border-2 border-dashed border-outline-variant rounded-xl p-8 flex flex-col items-center justify-center min-h-64 bg-surface-container-low hover:border-primary transition-all cursor-pointer group">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-4 group-hover:text-primary transition-colors">
                  upload_file
                </span>
                <h3 className="font-headline-md text-headline-md text-on-surface mb-1">
                  Import Custom Model
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant text-center">
                  Drag & drop or click to import a model
                </p>
              </div>

              {/* Model Cards */}
              {models.map((model, idx) => (
                <div
                  key={idx}
                  className="bg-surface-container rounded-xl p-4 border border-outline-variant hover:border-primary transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-headline-md text-headline-md text-on-surface mb-1">
                        {model.name}
                      </h3>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${model.statusColor}`}
                        ></span>
                        <span className="font-label-mono text-label-mono text-on-surface-variant">
                          {model.status}
                        </span>
                      </div>
                    </div>
                    <button className="text-on-surface-variant hover:text-primary opacity-0 group-hover:opacity-100 transition-all">
                      <span className="material-symbols-outlined">
                        more_vert
                      </span>
                    </button>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between">
                      <span className="font-body-md text-body-md text-on-surface-variant">
                        Size
                      </span>
                      <span className="font-label-mono text-label-mono text-on-surface font-bold">
                        {model.size}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-body-md text-body-md text-on-surface-variant">
                        Downloads
                      </span>
                      <span className="font-label-mono text-label-mono text-on-surface font-bold">
                        {model.downloads}
                      </span>
                    </div>
                  </div>

                  <button className="w-full bg-primary text-on-primary font-bold py-2 rounded-lg hover:brightness-110 transition-all active:scale-95">
                    <span className="flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">
                        download
                      </span>
                      Download
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
