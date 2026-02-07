"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Volume2, VolumeX } from "lucide-react"
import type { Phase } from "@/lib/types"

interface AmbientSoundProps {
  phase: Phase
  weather: string
}

// Procedural ambient sound engine using Web Audio API
class SoundEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private birdInterval: ReturnType<typeof setInterval> | null = null
  private cricketInterval: ReturnType<typeof setInterval> | null = null
  private windNode: AudioBufferSourceNode | null = null
  private rainNode: AudioBufferSourceNode | null = null
  private activeOscillators: OscillatorNode[] = []
  private currentPhase: Phase = "day"
  private currentWeather = "clear"
  private isPlaying = false

  start() {
    if (this.isPlaying) return
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.15
    this.master.connect(this.ctx.destination)
    this.isPlaying = true
    this.update(this.currentPhase, this.currentWeather)
  }

  stop() {
    this.clearAll()
    if (this.ctx) {
      this.ctx.close()
      this.ctx = null
    }
    this.master = null
    this.isPlaying = false
  }

  private clearAll() {
    if (this.birdInterval) { clearInterval(this.birdInterval); this.birdInterval = null }
    if (this.cricketInterval) { clearInterval(this.cricketInterval); this.cricketInterval = null }
    for (const osc of this.activeOscillators) {
      try { osc.stop() } catch { /* already stopped */ }
    }
    this.activeOscillators = []
    if (this.windNode) { try { this.windNode.stop() } catch {} this.windNode = null }
    if (this.rainNode) { try { this.rainNode.stop() } catch {} this.rainNode = null }
  }

  update(phase: Phase, weather: string) {
    this.currentPhase = phase
    this.currentWeather = weather
    if (!this.isPlaying || !this.ctx || !this.master) return

    this.clearAll()

    // Phase-based ambient
    if (phase === "morning" || phase === "day") {
      this.startBirds()
      this.startWind(0.03)
    } else if (phase === "evening") {
      this.startBirds(0.4) // quieter
      this.startCrickets(0.3)
      this.startWind(0.02)
    } else {
      // night
      this.startCrickets(0.7)
      this.startWind(0.015)
    }

    // Weather overlays
    if (weather === "rain") {
      this.startRain(0.12)
    } else if (weather === "storm") {
      this.startRain(0.25)
      this.startWind(0.08)
    } else if (weather === "fog") {
      this.startWind(0.01)
    }
  }

  private createNoiseBuffer(duration: number): AudioBuffer {
    if (!this.ctx) throw new Error("No context")
    const sampleRate = this.ctx.sampleRate
    const length = sampleRate * duration
    const buffer = this.ctx.createBuffer(1, length, sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1
    }
    return buffer
  }

  private startBirds(volumeScale = 1) {
    if (!this.ctx || !this.master) return
    const playBird = () => {
      if (!this.ctx || !this.master) return
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      const baseFreq = 2000 + Math.random() * 2500
      osc.type = "sine"
      osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime)
      // Chirp: quick frequency sweep
      osc.frequency.linearRampToValueAtTime(baseFreq + 400 + Math.random() * 600, this.ctx.currentTime + 0.08)
      osc.frequency.linearRampToValueAtTime(baseFreq - 200, this.ctx.currentTime + 0.15)
      gain.gain.setValueAtTime(0, this.ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.04 * volumeScale, this.ctx.currentTime + 0.02)
      gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.2)
      osc.connect(gain).connect(this.master!)
      osc.start()
      osc.stop(this.ctx.currentTime + 0.25)
      this.activeOscillators.push(osc)
      osc.onended = () => {
        this.activeOscillators = this.activeOscillators.filter((o) => o !== osc)
      }
    }
    // Random bird chirps
    this.birdInterval = setInterval(() => {
      if (Math.random() < 0.6) playBird()
      if (Math.random() < 0.2) setTimeout(playBird, 100 + Math.random() * 200)
    }, 800 + Math.random() * 2000)
  }

  private startCrickets(volumeScale = 1) {
    if (!this.ctx || !this.master) return
    const playCricket = () => {
      if (!this.ctx || !this.master) return
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = "sine"
      osc.frequency.value = 4000 + Math.random() * 1000
      gain.gain.setValueAtTime(0, this.ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.015 * volumeScale, this.ctx.currentTime + 0.01)
      // Rapid on-off pulsing
      const pulses = 3 + Math.floor(Math.random() * 5)
      for (let p = 0; p < pulses; p++) {
        const t = this.ctx.currentTime + p * 0.06
        gain.gain.setValueAtTime(0.015 * volumeScale, t)
        gain.gain.setValueAtTime(0.002, t + 0.03)
      }
      gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + pulses * 0.06 + 0.05)
      osc.connect(gain).connect(this.master!)
      osc.start()
      osc.stop(this.ctx.currentTime + pulses * 0.06 + 0.1)
      this.activeOscillators.push(osc)
      osc.onended = () => {
        this.activeOscillators = this.activeOscillators.filter((o) => o !== osc)
      }
    }
    this.cricketInterval = setInterval(() => {
      if (Math.random() < 0.7) playCricket()
    }, 400 + Math.random() * 1500)
  }

  private startWind(volume: number) {
    if (!this.ctx || !this.master) return
    const buffer = this.createNoiseBuffer(2)
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    const filter = this.ctx.createBiquadFilter()
    filter.type = "lowpass"
    filter.frequency.value = 400
    filter.Q.value = 0.5
    const gain = this.ctx.createGain()
    gain.gain.value = volume
    source.connect(filter).connect(gain).connect(this.master!)
    source.start()
    this.windNode = source
  }

  private startRain(volume: number) {
    if (!this.ctx || !this.master) return
    const buffer = this.createNoiseBuffer(2)
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    const filter = this.ctx.createBiquadFilter()
    filter.type = "bandpass"
    filter.frequency.value = 3000
    filter.Q.value = 0.3
    const gain = this.ctx.createGain()
    gain.gain.value = volume
    source.connect(filter).connect(gain).connect(this.master!)
    source.start()
    this.rainNode = source
  }
}

export function AmbientSound({ phase, weather }: AmbientSoundProps) {
  const engineRef = useRef<SoundEngine | null>(null)
  const [muted, setMuted] = useState(true) // start muted, user opts in

  useEffect(() => {
    engineRef.current = new SoundEngine()
    return () => {
      engineRef.current?.stop()
    }
  }, [])

  useEffect(() => {
    if (!engineRef.current) return
    if (muted) {
      engineRef.current.stop()
    } else {
      engineRef.current.start()
      engineRef.current.update(phase, weather)
    }
  }, [muted, phase, weather])

  const toggle = useCallback(() => {
    setMuted((m) => !m)
  }, [])

  return (
    <button
      type="button"
      onClick={toggle}
      className="glass-panel rounded-md px-2.5 py-1.5 flex items-center gap-1.5 hover:border-primary/30 transition-colors"
      title={muted ? "Enable ambient sound" : "Mute ambient sound"}
    >
      {muted ? (
        <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
      ) : (
        <Volume2 className="h-3.5 w-3.5 text-primary" />
      )}
      <span className="font-mono text-[10px] text-muted-foreground">
        {muted ? "Sound Off" : "Sound On"}
      </span>
    </button>
  )
}
