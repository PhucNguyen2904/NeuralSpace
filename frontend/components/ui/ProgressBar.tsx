interface ProgressBarProps {
  value: number
  color?: 'green' | 'blue' | 'amber'
}

export default function ProgressBar({ value, color = 'green' }: ProgressBarProps) {
  return (
    <div className="w-full h-1.5 bg-[#2a3347] rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-300 ${
          color === 'blue'
            ? 'bg-[#3b82f6]'
            : color === 'amber'
            ? 'bg-[#f59e0b]'
            : 'bg-gradient-to-r from-[#16a34a] to-[#22c55e]'
        }`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}
