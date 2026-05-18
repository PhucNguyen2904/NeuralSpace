interface MonoLabelProps {
  children: React.ReactNode
  className?: string
}

export default function MonoLabel({ children, className = '' }: MonoLabelProps) {
  return (
    <span
      className={`font-mono text-[11px] uppercase tracking-[0.08em] text-[#5a6a80] ${className}`}
    >
      {children}
    </span>
  )
}
