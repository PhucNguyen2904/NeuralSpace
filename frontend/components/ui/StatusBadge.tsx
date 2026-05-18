type Status = 'ready' | 'downloading' | 'error' | 'initializing' | 'running'

interface StatusBadgeProps {
  status: Status
}

const config: Record<Status, { bg: string; text: string; label: string }> = {
  ready:        { bg: '#1a2e1a', text: '#22c55e', label: 'Ready' },
  downloading:  { bg: '#2e2200', text: '#f59e0b', label: 'Downloading' },
  error:        { bg: '#2e1515', text: '#ef4444', label: 'Error' },
  initializing: { bg: '#1a1f35', text: '#60a5fa', label: 'Initializing' },
  running:      { bg: '#1e3a2e', text: '#22c55e', label: 'Running' },
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const { bg, text, label } = config[status]
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-wide px-2 py-0.5 rounded"
      style={{ background: bg, color: text }}
    >
      {label}
    </span>
  )
}
