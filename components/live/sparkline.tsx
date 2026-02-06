"use client"

interface SparklineProps {
  data: number[]
  color: string
  label: string
  height?: number
  width?: number
}

export function Sparkline({ data, color, label, height = 24, width = 80 }: SparklineProps) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 2) - 1
    return `${x},${y}`
  })

  const pathD = `M ${points.join(" L ")}`
  const lastValue = data[data.length - 1]
  const prevValue = data[data.length - 2]
  const direction = lastValue > prevValue ? "up" : lastValue < prevValue ? "down" : "flat"

  return (
    <div className="flex items-center gap-2 glass-panel rounded-md px-2 py-1">
      <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
      <svg width={width} height={height} className="overflow-visible">
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span
        className={`font-mono text-[10px] font-bold ${
          direction === "up" ? "text-[hsl(var(--success))]" : direction === "down" ? "text-[hsl(var(--live-red))]" : "text-foreground"
        }`}
      >
        {Math.round(lastValue)}
      </span>
    </div>
  )
}
