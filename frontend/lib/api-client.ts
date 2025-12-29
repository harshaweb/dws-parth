import { API_ENDPOINTS } from './api-config'
import type { Device } from './types'

export async function fetchDevices(): Promise<Device[]> {
  const response = await fetch(API_ENDPOINTS.devices)
  if (!response.ok) {
    throw new Error(`Failed to fetch devices: ${response.status} ${response.statusText}`)
  }
  const data = await response.json()
  // Handle both wrapped {data: []} and plain array responses
  const devices = data.data || data
  return Array.isArray(devices) ? devices : []
}

export async function fetchDevice(id: string): Promise<Device> {
  const response = await fetch(API_ENDPOINTS.device(id))
  if (!response.ok) {
    throw new Error(`Failed to fetch device: ${response.status} ${response.statusText}`)
  }
  const data = await response.json()
  if (!data.success || !data.data) {
    throw new Error('Device not found or invalid response')
  }
  return data.data
}

export async function registerDevice(name: string): Promise<Device> {
  const response = await fetch(API_ENDPOINTS.devices, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  const data = await response.json()
  return data.data
}

export async function updateDeviceStatus(
  id: string,
  status: string,
  connectionStatus: string
): Promise<void> {
  await fetch(API_ENDPOINTS.device(id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, connection_status: connectionStatus }),
  })
}

export async function updateDeviceLabel(
  id: string,
  label: string
): Promise<void> {
  // Labels are now stored locally on agents, so we send via WebSocket
  // This function is kept for compatibility but should use WebSocket
  throw new Error('Use WebSocket to update device labels - call wsService.send() with update_label command')
}

export async function deleteDevice(id: string): Promise<void> {
  await fetch(API_ENDPOINTS.device(id), {
    method: 'DELETE',
  })
}

export async function fetchSystemInfo() {
  const response = await fetch(API_ENDPOINTS.systemInfo)
  const data = await response.json()
  return data.data
}

export async function fetchFiles(path: string = 'C:\\\\') {
  const response = await fetch(`${API_ENDPOINTS.files}?path=${encodeURIComponent(path)}`)
  const data = await response.json()
  return data.data
}

export async function fetchServices() {
  const response = await fetch(API_ENDPOINTS.services)
  const data = await response.json()
  return data.data
}

export function connectWebSocket(onMessage: (data: any) => void) {
  const ws = new WebSocket(API_ENDPOINTS.ws)
  
  ws.onopen = () => {
    console.log('✅ WebSocket connected')
  }
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    onMessage(data)
  }
  
  ws.onerror = (error) => {
    console.error('❌ WebSocket error:', error)
  }
  
  ws.onclose = () => {
    console.log('🔌 WebSocket disconnected')
  }
  
  return ws
}

export function sendWebSocketMessage(ws: WebSocket, type: string, data: any) {
  ws.send(JSON.stringify({ type, data }))
}

// Group API functions
export async function fetchGroups() {
  try {
    const response = await fetch(API_ENDPOINTS.groups)
    if (!response.ok) {
      throw new Error(`Failed to fetch groups: ${response.status} ${response.statusText}`)
    }
    const data = await response.json()
    console.log('Fetched groups:', data)
    return data.data || []
  } catch (error) {
    console.error('Error fetching groups:', error)
    throw error
  }
}

export async function createGroup(name: string, description: string = '') {
  try {
    const response = await fetch(API_ENDPOINTS.groups, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Failed to create group: ${response.statusText}`)
    }
    const data = await response.json()
    console.log('Created group:', data)
    return data.data
  } catch (error) {
    console.error('Error creating group:', error)
    throw error
  }
}

export async function deleteGroup(id: string) {
  try {
    const response = await fetch(API_ENDPOINTS.group(id), {
      method: 'DELETE',
    })
    if (!response.ok) {
      throw new Error(`Failed to delete group: ${response.statusText}`)
    }
    console.log('Deleted group:', id)
  } catch (error) {
    console.error('Error deleting group:', error)
    throw error
  }
}

export async function updateDeviceGroup(deviceId: string, groupName: string) {
  try {
    const response = await fetch(API_ENDPOINTS.deviceGroup(deviceId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_name: groupName }),
    })
    if (!response.ok) {
      throw new Error(`Failed to update device group: ${response.statusText}`)
    }
    const data = await response.json()
    console.log('Updated device group:', deviceId, 'to', groupName)
    return data
  } catch (error) {
    console.error('Error updating device group:', error)
    throw error
  }
}
