'use client';

import { useState } from 'react';
import { SideNav, TopAppBar, TaskCard } from '@/components/shared';

export default function ImportModelPage() {
  const [tasks] = useState([
    {
      title: 'llama-3-8b-instruct.Q4_K_M.gguf',
      icon: 'model_training',
      speed: '12.5 MB/s',
      eta: 'ETA: 2m 45s',
      progress: 49,
      dataUsage: '4.2GB / 8.5GB',
    },
    {
      title: 'mistral-7b-v0.1-fp16',
      icon: 'neurology',
      speed: '4.1 MB/s',
      eta: 'ETA: 14m 10s',
      progress: 8,
      progressLabel: 'INITIALIZING SHARDS',
      dataUsage: '1.1GB / 14.0GB',
      isLoading: true,
      iconColor: 'text-tertiary',
    },
  ]);

  const tips = [
    {
      icon: 'auto_awesome',
      title: 'Auto-Detect',
      description:
        'NeuralForge automatically parses GGUF, SafeTensors, and Pytorch formats.',
    },
    {
      icon: 'encrypted',
      title: 'Verify Hashes',
      description:
        'SHA-256 validation is performed on every block during the download process.',
    },
    {
      icon: 'cloud_sync',
      title: 'Resume Support',
      description:
        'If your connection drops, we\'ll automatically resume from the last byte received.',
    },
  ];

  return (
    <div className="flex overflow-hidden h-screen">
      <SideNav />

      <div className="flex flex-col flex-1 min-w-0 h-screen">
        <TopAppBar />

        <main className="flex-1 overflow-y-auto bg-background p-margin">
          <div className="max-w-4xl mx-auto flex flex-col gap-stack-lg py-12">
            {/* Hero Section */}
            <div className="text-center flex flex-col gap-stack-sm mb-4">
              <h2 className="font-headline-xl text-headline-xl text-on-surface">
                Import Neural Engine
              </h2>
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl mx-auto">
                Pull models directly from Hugging Face or specify a custom
                manifest URL to register them in your local Workspace.
              </p>
            </div>

            {/* Input Area */}
            <div className="bg-surface-container p-stack-lg rounded-xl border border-outline-variant shadow-lg">
              <div className="flex flex-col gap-stack-md">
                <label className="font-label-mono text-label-mono text-primary uppercase tracking-wider">
                  Model Manifest / ID
                </label>
                <div className="flex gap-4">
                  <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">
                      link
                    </span>
                    <input
                      className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-4 pl-12 pr-4 text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent font-code-block text-code-block placeholder:text-on-surface-variant/50"
                      placeholder="e.g. meta-llama/Llama-2-7b-hf or https://hf.co/..."
                      type="text"
                    />
                  </div>
                  <button className="bg-primary text-on-primary font-bold px-8 py-4 rounded-lg flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all">
                    <span className="material-symbols-outlined">download</span>
                    <span className="font-body-lg text-body-lg">Download</span>
                  </button>
                </div>
                <div className="flex gap-stack-md text-on-surface-variant font-label-mono text-label-mono">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">
                      check_circle
                    </span>
                    Git LFS Support
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">
                      check_circle
                    </span>
                    Automated Quantization
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">
                      check_circle
                    </span>
                    Pytorch &amp; Safetensors
                  </span>
                </div>
              </div>
            </div>

            {/* Active Tasks */}
            <section className="flex flex-col gap-stack-md">
              <div className="flex items-center justify-between">
                <h3 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
                  Active Tasks
                  <span className="bg-surface-container-highest px-2 py-0.5 rounded text-xs font-label-mono">
                    2 RUNNING
                  </span>
                </h3>
                <button className="text-primary font-body-md text-body-md hover:underline">
                  Clear Completed
                </button>
              </div>
              <div className="grid grid-cols-1 gap-stack-md">
                {tasks.map((task, idx) => (
                  <TaskCard
                    key={idx}
                    title={task.title}
                    icon={task.icon}
                    iconColor={task.iconColor}
                    speed={task.speed}
                    eta={task.eta}
                    progress={task.progress}
                    progressLabel={task.progressLabel}
                    dataUsage={task.dataUsage}
                    isLoading={task.isLoading}
                    onCancel={() => console.log('Cancel task')}
                  />
                ))}
              </div>
            </section>

            {/* Tips Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-stack-md mt-4">
              {tips.map((tip, idx) => (
                <div
                  key={idx}
                  className="border border-outline-variant p-4 rounded-lg bg-surface-container-low"
                >
                  <span className="material-symbols-outlined text-primary mb-2">
                    {tip.icon}
                  </span>
                  <h4 className="font-body-md text-body-md font-bold mb-1">
                    {tip.title}
                  </h4>
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    {tip.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
