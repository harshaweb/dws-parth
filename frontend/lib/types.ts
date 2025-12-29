export interface Device {
  id: string
  user_id: string
  name: string
  hostname: string
  ip_address: string
  os_version: string | null
  status: "online" | "offline" | "maintenance"
  connection_status: "connected" | "disconnected" | "error"
  last_seen: string
  windows_username: string
  wallpaper_url: string
  label: string
  group_name: string
  created_at: string
  updated_at: string
}

export interface DeviceFile {
  id: string
  device_id: string
  user_id: string
  path: string
  name: string
  type: "file" | "folder"
  size: number
  modified_at: string | null
  created_at: string
}

export interface DeviceService {
  id: string
  device_id: string
  user_id: string
  name: string
  display_name: string
  status: "Running" | "Stopped" | "Paused"
  startup_type: "Automatic" | "Manual" | "Disabled"
  description: string | null
  created_at: string
  updated_at: string
}

export interface ShellSession {
  id: string
  device_id: string
  user_id: string
  shell_type: "powershell" | "cmd"
  command: string
  output: string | null
  executed_at: string
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: string
  created_at: string
  updated_at: string
}

export interface Group {
  id: string
  user_id: string
  name: string
  description: string
  created_at: string
  updated_at: string
}
