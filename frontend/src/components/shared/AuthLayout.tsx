import Link from "next/link";
import { BrainCircuit, Database, Sparkles } from "lucide-react";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen grid-cols-1 bg-bg-base md:grid-cols-2">
      <section className="relative hidden overflow-hidden p-10 text-white md:block" style={{ background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A78BFA 100%)" }}>
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='32' height='32' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h32v32H0z' fill='none'/%3E%3Cpath d='M32 0H0v32' stroke='white' stroke-width='1'/%3E%3C/svg%3E\")"
          }}
        />
        <div className="relative z-10 flex h-full flex-col">
          <div className="mb-12 flex items-center gap-2 text-lg font-semibold">
            <Sparkles size={18} /> NeuralSpace
          </div>
          <h2 className="max-w-sm text-3xl font-semibold leading-tight">Your interactive ML workspace</h2>
          <div className="mt-8 space-y-4 text-sm text-white/90">
            <p className="flex items-center gap-2"><BrainCircuit size={16} /> Instant JupyterLab in seconds</p>
            <p className="flex items-center gap-2"><Database size={16} /> Connected to your datasets & models</p>
            <p className="flex items-center gap-2"><Sparkles size={16} /> Auto-saved, always available</p>
          </div>
          <div className="relative mt-auto grid gap-3">
            <div className="auth-float rounded-lg bg-white/15 p-3 font-mono text-xs backdrop-blur">run train.py --epochs=8\nacc: 94.2%</div>
            <div className="auth-float rounded-lg bg-white/15 p-3 font-mono text-xs backdrop-blur [animation-delay:0.6s]">dataset.load("customer-churn")\nrows: 1,200,000</div>
          </div>
        </div>
      </section>
      <section className="flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-6 text-center md:hidden">
            <Link href="/" className="text-lg font-semibold text-text-primary">NeuralSpace</Link>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
