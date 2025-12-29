export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080'

export const API_ENDPOINTS = {
  // Device Management
  devices: `${API_URL}/api/devices`,
  device: (id: string) => `${API_URL}/api/devices/${id}`,
  deviceGroup: (id: string) => `${API_URL}/api/devices/${id}/group`,
  
  // Group Management
  groups: `${API_URL}/api/groups`,
  group: (id: string) => `${API_URL}/api/groups/${id}`,
  
  // System Operations
  systemInfo: `${API_URL}/api/system`,
  files: `${API_URL}/api/files`,
  services: `${API_URL}/api/services`,
  
  // WebSocket - Connect to central server
  ws: `${WS_URL}/ws/frontend`, // Frontend connects here
  wsSystem: `${WS_URL}/ws/frontend`,
  wsScreen: `${WS_URL}/ws/frontend`,
  
  // Status
  status: `${API_URL}/status`,
}
