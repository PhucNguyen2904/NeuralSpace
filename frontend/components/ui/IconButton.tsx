import { LucideIcon } from 'lucide-react'

interface IconButtonProps {
  icon: LucideIcon
  onClick?: () => void
  className?: string
  label?: string
}

export default function IconButton({ icon: Icon, onClick, className = '', label }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`w-8 h-8 bg-[#1c2333] rounded-lg flex items-center justify-center text-[#4a5568] hover:text-white hover:bg-[#2a3347] transition-colors cursor-pointer ${className}`}
    >
      <Icon size={15} />
    </button>
  )
}
