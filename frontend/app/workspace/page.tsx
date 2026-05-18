'use client';

import { useState } from 'react';
import { SideNav, TopAppBar } from '@/components/shared';

export default function WorkspacePage() {
  const [messages, setMessages] = useState([
    {
      role: 'ai' as const,
      content:
        'Quantum entanglement is a physical phenomenon that occurs when a group of particles are generated, interact, or share spatial proximity in a way such that the quantum state of each particle cannot be described independently of the state of the others.\n\nEven when the particles are separated by a large distance, a measurement of one particle\'s properties will instantaneously correlate with the measurement of the other\'s.',
    },
    {
      role: 'user' as const,
      content: 'Can you explain how this relates to Bell\'s Theorem?',
    },
    {
      role: 'ai' as const,
      content: null,
      isTyping: true,
    },
  ]);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <SideNav collapsed />

      <main className="flex-grow flex flex-col overflow-hidden relative">
        <TopAppBar
          title="NeuralForge"
          subtitle="Llama-3-70B"
          showSearch={false}
        />

        {/* Status Bar */}
        <div className="flex justify-between items-center px-margin h-12 bg-surface border-b border-outline-variant shrink-0">
          <div className="flex items-center gap-stack-sm bg-surface-container-low px-3 py-1.5 rounded-lg border border-outline-variant">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-tertiary"></span>
              <span className="font-label-mono text-label-mono text-on-surface">
                Status: Ready
              </span>
            </div>
            <div className="h-4 w-[1px] bg-outline-variant mx-1"></div>
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-primary">
                monitoring
              </span>
              <span className="font-label-mono text-label-mono text-on-surface">
                GPU: 82% utilized
              </span>
            </div>
          </div>
        </div>

        {/* Split Pane Layout */}
        <section className="flex flex-grow overflow-hidden">
          {/* Left: Code Editor */}
          <div className="w-1/2 flex flex-col border-r border-outline-variant bg-surface">
            <div className="flex items-center justify-between px-4 py-2 bg-surface-container-low border-b border-outline-variant">
              <div className="flex items-center gap-stack-sm">
                <span className="material-symbols-outlined text-primary text-[18px]">
                  terminal
                </span>
                <span className="font-label-mono text-label-mono text-on-surface">
                  inference_script.py
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-on-surface-variant text-[18px] hover:text-on-surface cursor-pointer">
                  content_copy
                </span>
                <span className="material-symbols-outlined text-on-surface-variant text-[18px] hover:text-on-surface cursor-pointer">
                  settings_ethernet
                </span>
              </div>
            </div>

            {/* Code Display */}
            <div className="flex-grow overflow-auto p-4 bg-[#0d1117] font-code-block text-code-block leading-relaxed">
              <div className="space-y-1">
                <div className="flex">
                  <div className="w-8 text-outline text-right pr-4 select-none opacity-50">
                    1
                  </div>
                  <div className="text-[#ff7b72]">import</div>
                  <div className="text-white ml-2">neuralforge</div>
                  <div className="text-[#ff7b72] ml-2">as</div>
                  <div className="text-white ml-2">nf</div>
                </div>
                <div className="flex">
                  <div className="w-8 text-outline text-right pr-4 select-none opacity-50">
                    2
                  </div>
                  <div className="text-[#ff7b72]">from</div>
                  <div className="text-white ml-2">nf.models</div>
                  <div className="text-[#ff7b72] ml-2">import</div>
                  <div className="text-white ml-2">Llama3</div>
                </div>
                <div className="flex">
                  <div className="w-8 text-outline text-right pr-4 select-none opacity-50">
                    3
                  </div>
                </div>
                <div className="flex">
                  <div className="w-8 text-outline text-right pr-4 select-none opacity-50">
                    4
                  </div>
                  <div className="text-gray-500">
                    # Initialize the high-performance kernel
                  </div>
                </div>
                <div className="flex">
                  <div className="w-8 text-outline text-right pr-4 select-none opacity-50">
                    5
                  </div>
                  <div className="text-white">model = Llama3(</div>
                  <div className="text-[#a5d6ff]">"meta-llama/Llama-3-70B"</div>
                  <div className="text-white">)</div>
                </div>
                <div className="flex">
                  <div className="w-8 text-outline text-right pr-4 select-none opacity-50">
                    6
                  </div>
                  <div className="text-white">model.load_weights(precision=</div>
                  <div className="text-[#a5d6ff]">"bf16"</div>
                  <div className="text-white">)</div>
                </div>
                <div className="flex">
                  <div className="w-8 text-outline text-right pr-4 select-none opacity-50">
                    7
                  </div>
                </div>
                <div className="flex">
                  <div className="w-8 text-outline text-right pr-4 select-none opacity-50">
                    8
                  </div>
                  <div className="text-[#ff7b72]">def</div>
                  <div className="text-[#d2a8ff] ml-2">generate_response</div>
                  <div className="text-white">(prompt: str):</div>
                </div>
                <div className="flex">
                  <div className="w-8 text-outline text-right pr-4 select-none opacity-50">
                    9
                  </div>
                  <div className="ml-4 text-white">response = model.generate(</div>
                </div>
                <div className="flex">
                  <div className="w-8 text-outline text-right pr-4 select-none opacity-50">
                    10
                  </div>
                  <div className="ml-8 text-white">prompt=prompt,</div>
                </div>
                <div className="flex">
                  <div className="w-8 text-outline text-right pr-4 select-none opacity-50">
                    11
                  </div>
                  <div className="ml-8 text-white">max_new_tokens=</div>
                  <div className="text-[#79c0ff]">512</div>
                  <div className="text-white">,</div>
                </div>
                <div className="flex">
                  <div className="w-8 text-outline text-right pr-4 select-none opacity-50">
                    12
                  </div>
                  <div className="ml-8 text-white">temperature=</div>
                  <div className="text-[#79c0ff]">0.7</div>
                </div>
                <div className="flex">
                  <div className="w-8 text-outline text-right pr-4 select-none opacity-50">
                    13
                  </div>
                  <div className="ml-4 text-white">)</div>
                </div>
                <div className="flex">
                  <div className="w-8 text-outline text-right pr-4 select-none opacity-50">
                    14
                  </div>
                  <div className="ml-4 text-[#ff7b72]">return</div>
                  <div className="text-white ml-2">response</div>
                </div>
                <div className="flex">
                  <div className="w-8 text-outline text-right pr-4 select-none opacity-50">
                    15
                  </div>
                </div>
                <div className="flex">
                  <div className="w-8 text-outline text-right pr-4 select-none opacity-50">
                    16
                  </div>
                  <div className="text-gray-500"># Testing interface</div>
                </div>
                <div className="flex">
                  <div className="w-8 text-outline text-right pr-4 select-none opacity-50">
                    17
                  </div>
                  <div className="text-white">print(generate_response(</div>
                  <div className="text-[#a5d6ff]">
                    "Explain quantum entanglement."
                  </div>
                  <div className="text-white">))</div>
                </div>
                <div className="flex">
                  <div className="w-8 text-outline text-right pr-4 select-none opacity-50">
                    18
                  </div>
                  <div className="text-[#8b949e]">|</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Chat Interface */}
          <div className="w-1/2 flex flex-col bg-surface-container-low">
            {/* Chat Tabs */}
            <div className="flex items-center px-4 py-2 bg-surface-container-low border-b border-outline-variant">
              <div className="flex gap-stack-md">
                <button className="font-label-mono text-label-mono border-b-2 border-primary text-primary pb-1">
                  Playground
                </button>
                <button className="font-label-mono text-label-mono text-on-surface-variant hover:text-on-surface pb-1">
                  Logs
                </button>
                <button className="font-label-mono text-label-mono text-on-surface-variant hover:text-on-surface pb-1">
                  Metrics
                </button>
              </div>
            </div>

            {/* Chat History */}
            <div className="flex-grow overflow-y-auto p-margin flex flex-col gap-stack-lg">
              {messages.map((msg, idx) =>
                msg.role === 'ai' ? (
                  <div key={idx} className="flex flex-col gap-stack-sm self-start max-w-[85%]">
                    <div className="flex items-center gap-stack-sm">
                      <div className="w-6 h-6 rounded bg-primary-container flex items-center justify-center">
                        <span className="material-symbols-outlined text-[14px] text-on-primary-container">
                          memory
                        </span>
                      </div>
                      <span className="font-label-mono text-label-mono text-primary">
                        Llama-3-70B
                      </span>
                      {msg.isTyping && (
                        <span className="font-label-mono text-[10px] text-on-surface-variant italic">
                          Typing...
                        </span>
                      )}
                    </div>
                    {msg.isTyping ? (
                      <div className="flex gap-1.5 p-2 items-center">
                        <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></div>
                        <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse [animation-delay:0.2s]"></div>
                        <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse [animation-delay:0.4s]"></div>
                      </div>
                    ) : (
                      <>
                        <div className="bg-surface-container-high p-4 rounded-xl rounded-tl-none border border-outline-variant shadow-sm text-on-surface leading-relaxed">
                          {msg.content}
                        </div>
                        <div className="flex gap-2 mt-1">
                          <span className="material-symbols-outlined text-[16px] text-on-surface-variant hover:text-primary cursor-pointer">
                            thumb_up
                          </span>
                          <span className="material-symbols-outlined text-[16px] text-on-surface-variant hover:text-primary cursor-pointer">
                            thumb_down
                          </span>
                          <span className="material-symbols-outlined text-[16px] text-on-surface-variant hover:text-primary cursor-pointer">
                            refresh
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div key={idx} className="flex flex-col gap-stack-sm self-end max-w-[85%]">
                    <div className="flex items-center gap-stack-sm justify-end">
                      <span className="font-label-mono text-label-mono text-on-surface-variant">
                        Engineer
                      </span>
                      <div className="w-6 h-6 rounded-full overflow-hidden bg-outline-variant flex items-center justify-center">
                        <span className="material-symbols-outlined text-sm">
                          account_circle
                        </span>
                      </div>
                    </div>
                    <div className="bg-secondary-container p-4 rounded-xl rounded-tr-none border border-outline-variant shadow-sm text-on-secondary-container">
                      {msg.content}
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Input Box */}
            <div className="p-margin border-t border-outline-variant bg-surface">
              <div className="relative flex items-end gap-stack-sm bg-background rounded-xl border border-outline-variant focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all p-2 px-4 shadow-inner">
                <textarea
                  className="flex-grow bg-transparent border-none focus:ring-0 text-on-surface placeholder:text-on-surface-variant py-2 resize-none max-h-32 min-h-[44px] font-body-md"
                  placeholder="Type your message to the model..."
                ></textarea>
                <div className="flex items-center gap-2 pb-1.5">
                  <button className="p-2 text-on-surface-variant hover:text-primary transition-colors">
                    <span className="material-symbols-outlined">
                      attach_file
                    </span>
                  </button>
                  <button className="bg-primary text-on-primary p-2 rounded-lg flex items-center justify-center hover:bg-primary-fixed-dim transition-colors active:scale-95 duration-100 shadow-lg">
                    <span className="material-symbols-outlined">send</span>
                  </button>
                </div>
              </div>
              <div className="mt-2 flex justify-between items-center px-1">
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase font-bold text-outline">
                      Temp
                    </span>
                    <span className="font-label-mono text-[12px] text-on-surface">
                      0.7
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase font-bold text-outline">
                      Tokens
                    </span>
                    <span className="font-label-mono text-[12px] text-on-surface">
                      4096
                    </span>
                  </div>
                </div>
                <div className="text-[11px] text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">
                    bolt
                  </span>
                  Latency: 42ms
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Floating Run Button */}
        <button className="absolute bottom-8 left-[calc(50%-130px)] flex items-center gap-stack-sm bg-tertiary-container text-on-tertiary-container px-6 py-3 rounded-full font-bold shadow-2xl hover:scale-105 active:scale-95 transition-all z-10 border border-on-tertiary-container/20 group">
          <span className="material-symbols-outlined group-hover:rotate-12 transition-transform">
            play_arrow
          </span>
          <span className="tracking-wide">Run Script</span>
          <div className="h-4 w-[1px] bg-on-tertiary-container/30 mx-1"></div>
          <span className="font-label-mono text-[12px] opacity-80">⌘+R</span>
        </button>
      </main>
    </div>
  );
}
