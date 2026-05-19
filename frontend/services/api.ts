const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

/* ─────────────────────────────────────────────────────────────────────────
   TYPES
   ───────────────────────────────────────────────────────────────────────── */

export interface Model {
  id: string
  name: string
  source: string
  status: 'ready' | 'downloading' | 'error' | 'initializing' | 'running'
  size: string
  category: string
  progress?: number
}

export interface Task {
  id: string
  filename: string
  speed: string
  eta: string
  downloaded: string
  total: string
  progress: number
  status: string
  statusColor: 'green' | 'amber'
}

export interface HardwareStats {
  cpu: number
  gpu: number
  ram: number | string
}

export interface GpuSettings {
  vramLimit: number
  computePriority: 'LOW' | 'BALANCED' | 'HIGH'
  cudaEnabled: boolean
  performanceProfile: string
}

/* ─────────────────────────────────────────────────────────────────────────
   MODELS
   ───────────────────────────────────────────────────────────────────────── */

export async function fetchModels(): Promise<{ items: Model[]; total: number }> {
  try {
    const res = await fetch(`${BASE_URL}/models`)
    if (!res.ok) throw new Error('Failed to fetch models')
    return res.json()
  } catch (err) {
    console.error('fetchModels error:', err)
    throw err
  }
}

export async function runModel(modelId: string): Promise<{ success: boolean; taskId: string }> {
  try {
    const res = await fetch(`${BASE_URL}/models/${modelId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) throw new Error('Failed to run model')
    return res.json()
  } catch (err) {
    console.error('runModel error:', err)
    throw err
  }
}

export async function retryModel(taskId: string): Promise<{ success: boolean }> {
  try {
    const res = await fetch(`${BASE_URL}/models/tasks/${taskId}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) throw new Error('Failed to retry model')
    return res.json()
  } catch (err) {
    console.error('retryModel error:', err)
    throw err
  }
}

export async function deleteModel(modelId: string): Promise<{ success: boolean }> {
  try {
    const res = await fetch(`${BASE_URL}/models/${modelId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) throw new Error('Failed to delete model')
    return res.json()
  } catch (err) {
    console.error('deleteModel error:', err)
    throw err
  }
}

export async function cancelDownload(taskId: string): Promise<{ success: boolean }> {
  try {
    const res = await fetch(`${BASE_URL}/models/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) throw new Error('Failed to cancel download')
    return res.json()
  } catch (err) {
    console.error('cancelDownload error:', err)
    throw err
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   DOWNLOADS & TASKS
   ───────────────────────────────────────────────────────────────────────── */

export async function downloadModel(modelId: string): Promise<{ taskId: string; success: boolean }> {
  try {
    const res = await fetch(`${BASE_URL}/models/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: modelId }),
    })
    if (!res.ok) throw new Error('Failed to start download')
    return res.json()
  } catch (err) {
    console.error('downloadModel error:', err)
    throw err
  }
}

export async function fetchTasks(): Promise<{ items: Task[]; total: number }> {
  try {
    const res = await fetch(`${BASE_URL}/models/tasks`)
    if (!res.ok) throw new Error('Failed to fetch tasks')
    return res.json()
  } catch (err) {
    console.error('fetchTasks error:', err)
    throw err
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   HARDWARE & SETTINGS
   ───────────────────────────────────────────────────────────────────────── */

export async function fetchHardwareStats(): Promise<HardwareStats> {
  try {
    const res = await fetch(`${BASE_URL}/hardware/stats`)
    if (!res.ok) throw new Error('Failed to fetch hardware stats')
    return res.json()
  } catch (err) {
    console.error('fetchHardwareStats error:', err)
    throw err
  }
}

export async function updateGpuSettings(settings: GpuSettings): Promise<{ success: boolean }> {
  try {
    const res = await fetch(`${BASE_URL}/hardware/gpu/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    if (!res.ok) throw new Error('Failed to update GPU settings')
    return res.json()
  } catch (err) {
    console.error('updateGpuSettings error:', err)
    throw err
  }
}

export async function checkDriverUpdates(): Promise<{
  available: boolean
  currentVersion: string
  newVersion?: string
}> {
  try {
    const res = await fetch(`${BASE_URL}/hardware/gpu/driver/check-updates`)
    if (!res.ok) throw new Error('Failed to check driver updates')
    return res.json()
  } catch (err) {
    console.error('checkDriverUpdates error:', err)
    throw err
  }
}
