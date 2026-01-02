"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Monitor,
  Activity,
  HardDrive,
  Cpu,
  Wifi,
  FolderTree,
  Terminal,
  Settings,
  Eye,
  MemoryStick,
  Clock,
  User,
  MapPin,
  Calendar,
  Server,
  ChevronLeft,
  ChevronRight,
  Package,
  ListTodo,
} from "lucide-react"
import { useRouter } from "next/navigation"
import type { Device } from "@/lib/types"
import { cn } from "@/lib/utils"
import { FileManager } from "@/components/file-manager"
import { ScreenViewer } from "@/components/screen-viewer"
import { ProfessionalTerminal } from "@/components/professional-terminal"
import { ServicesManager } from "@/components/services-manager"
import { SoftwareManager } from "@/components/software-manager"
import { TaskManager } from "@/components/task-manager"
import { useSystemMetrics } from "@/lib/hooks/useWebSocket"

interface DeviceDetailLayoutProps {
  device: Device
  userId: string
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''}, ${hours} hour${hours > 1 ? 's' : ''}`
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}, ${minutes} minute${minutes > 1 ? 's' : ''}`
  } else {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`
  }
}

export function DeviceDetailLayout({ device, userId }: DeviceDetailLayoutProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("overview")
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const { systemInfo, isConnected } = useSystemMetrics(device.id)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto px-6 pt-24 pb-8">
        <div className="flex gap-6">
          {/* Sidebar with tabs */}
          <div
            className={cn(
              "flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/50 p-4 backdrop-blur transition-all duration-300 shrink-0",
              isSidebarCollapsed ? "w-20" : "w-64",
            )}
          >
            <div className="flex items-center justify-between mb-2 px-2 pt-2">
              {!isSidebarCollapsed && <span className="text-sm font-medium text-slate-400">Navigation</span>}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400 hover:text-white ml-auto"
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              >
                {isSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </Button>
            </div>
            <div className="space-y-1">
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start gap-3 h-11 transition-all",
                  activeTab === "overview"
                    ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/20"
                    : "text-slate-300 hover:text-white hover:bg-slate-800",
                  isSidebarCollapsed && "justify-center px-0",
                )}
                onClick={() => setActiveTab("overview")}
              >
                <Activity className="h-4 w-4 shrink-0" />
                {!isSidebarCollapsed && <span>Overview</span>}
              </Button>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start gap-3 h-11 transition-all",
                  activeTab === "files"
                    ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/20"
                    : "text-slate-300 hover:text-white hover:bg-slate-800",
                  isSidebarCollapsed && "justify-center px-0",
                )}
                onClick={() => setActiveTab("files")}
              >
                <FolderTree className="h-4 w-4 shrink-0" />
                {!isSidebarCollapsed && <span>Files</span>}
              </Button>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start gap-3 h-11 transition-all",
                  activeTab === "screen"
                    ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/20"
                    : "text-slate-300 hover:text-white hover:bg-slate-800",
                  isSidebarCollapsed && "justify-center px-0",
                )}
                onClick={() => setActiveTab("screen")}
              >
                <Eye className="h-4 w-4 shrink-0" />
                {!isSidebarCollapsed && <span>Screen</span>}
              </Button>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start gap-3 h-11 transition-all",
                  activeTab === "shell"
                    ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/20"
                    : "text-slate-300 hover:text-white hover:bg-slate-800",
                  isSidebarCollapsed && "justify-center px-0",
                )}
                onClick={() => setActiveTab("shell")}
              >
                <Terminal className="h-4 w-4 shrink-0" />
                {!isSidebarCollapsed && <span>Shell</span>}
              </Button>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start gap-3 h-11 transition-all",
                  activeTab === "services"
                    ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/20"
                    : "text-slate-300 hover:text-white hover:bg-slate-800",
                  isSidebarCollapsed && "justify-center px-0",
                )}
                onClick={() => setActiveTab("services")}
              >
                <Settings className="h-4 w-4 shrink-0" />
                {!isSidebarCollapsed && <span>Services</span>}
              </Button>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start gap-3 h-11 transition-all",
                  activeTab === "software"
                    ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/20"
                    : "text-slate-300 hover:text-white hover:bg-slate-800",
                  isSidebarCollapsed && "justify-center px-0",
                )}
                onClick={() => setActiveTab("software")}
              >
                <Package className="h-4 w-4 shrink-0" />
                {!isSidebarCollapsed && <span>Software</span>}
              </Button>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start gap-3 h-11 transition-all",
                  activeTab === "tasks"
                    ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/20"
                    : "text-slate-300 hover:text-white hover:bg-slate-800",
                  isSidebarCollapsed && "justify-center px-0",
                )}
                onClick={() => setActiveTab("tasks")}
              >
                <ListTodo className="h-4 w-4 shrink-0" />
                {!isSidebarCollapsed && <span>Task Manager</span>}
              </Button>
            </div>
          </div>

          {/* Main Content Area - Flexible width */}
          <div className="flex-1 h-[85vh] overflow-y-auto scrollbar-hide">
            {activeTab === "overview" && (
              <div className="space-y-6">
                {!isConnected && (
                  <div className="mb-4 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3">
                    <p className="text-sm text-yellow-400">⚠️ Connecting to device...</p>
                  </div>
                )}
                
                <div className="grid gap-6 md:grid-cols-3">
                  <Card className="border-slate-800 bg-black">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-600/20 ring-1 ring-green-500/30">
                          <Cpu className="h-5 w-5 text-green-400" />
                        </div>
                        <span className="text-2xl font-bold text-white">
                          {systemInfo ? Math.round(systemInfo.cpu_usage) : '--'}%
                        </span>
                      </div>
                      <h3 className="text-sm font-medium text-slate-300">CPU Usage</h3>
                      <p className="text-xs text-slate-500 mt-1">
                        {systemInfo ? `${systemInfo.cpu_cores} cores` : 'Loading...'}
                      </p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-green-500 to-green-400 transition-all"
                          style={{ width: `${systemInfo ? systemInfo.cpu_usage : 0}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-800 bg-black">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/20 ring-1 ring-blue-500/30">
                          <MemoryStick className="h-5 w-5 text-blue-400" />
                        </div>
                        <span className="text-2xl font-bold text-white">
                          {systemInfo ? Math.round(systemInfo.ram_percent) : '--'}%
                        </span>
                      </div>
                      <h3 className="text-sm font-medium text-slate-300">Memory Usage</h3>
                      <p className="text-xs text-slate-500 mt-1">
                        {systemInfo 
                          ? `${(systemInfo.ram_used / 1024 / 1024 / 1024).toFixed(1)} GB / ${(systemInfo.ram_total / 1024 / 1024 / 1024).toFixed(1)} GB`
                          : 'Loading...'}
                      </p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all"
                          style={{ width: `${systemInfo ? systemInfo.ram_percent : 0}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-800 bg-black">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-600/20 ring-1 ring-purple-500/30">
                          <HardDrive className="h-5 w-5 text-purple-400" />
                        </div>
                        <span className="text-2xl font-bold text-white">
                          {systemInfo ? Math.round(systemInfo.disk_percent) : '--'}%
                        </span>
                      </div>
                      <h3 className="text-sm font-medium text-slate-300">Disk Usage</h3>
                      <p className="text-xs text-slate-500 mt-1">
                        {systemInfo 
                          ? `${(systemInfo.disk_used / 1024 / 1024 / 1024).toFixed(0)} GB / ${(systemInfo.disk_total / 1024 / 1024 / 1024).toFixed(0)} GB (C:)`
                          : 'Loading...'}
                      </p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all"
                          style={{ width: `${systemInfo ? systemInfo.disk_percent : 0}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <Card className="border-slate-800 bg-slate-900/50">
                    <CardContent className="p-6">
                      <h3 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
                        <Server className="h-5 w-5 text-blue-400" />
                        System Information
                      </h3>
                      <div className="space-y-4">
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-950/50">
                          <Monitor className="h-5 w-5 text-blue-400 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm text-slate-400">Operating System</p>
                            <p className="text-base font-medium text-white">
                              {systemInfo?.platform || device.os_version || "Loading..."}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              {systemInfo?.hostname || device.hostname || "Loading..."}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-950/50">
                          <User className="h-5 w-5 text-green-400 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm text-slate-400">Windows User</p>
                            <p className="text-base font-medium text-white">
                              {systemInfo?.username || device.windows_username || "Loading..."}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">Current logged in user</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-950/50">
                          <MapPin className="h-5 w-5 text-purple-400 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm text-slate-400">Network Address</p>
                            <p className="text-base font-medium text-white font-mono">
                              {systemInfo?.ip_address || device.ip_address || "Loading..."}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">Local IP address</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-800 bg-slate-900/50">
                    <CardContent className="p-6">
                      <h3 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
                        <Activity className="h-5 w-5 text-green-400" />
                        Device Status
                      </h3>
                      <div className="space-y-4">
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-950/50">
                          <Clock className="h-5 w-5 text-yellow-400 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm text-slate-400">Last Seen</p>
                            <p className="text-base font-medium text-white">
                              {new Date(device.last_seen).toLocaleString()}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">Active connection</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-950/50">
                          <Calendar className="h-5 w-5 text-cyan-400 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm text-slate-400">Uptime</p>
                            <p className="text-base font-medium text-white">
                              {systemInfo ? formatUptime(systemInfo.uptime) : '7 days, 14 hours'}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              {systemInfo ? 'System running' : 'Last reboot: Jan 13, 2024'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-950/50">
                          <Wifi className="h-5 w-5 text-emerald-400 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm text-slate-400">Connection Status</p>
                            <p className="text-base font-medium text-white capitalize">{device.connection_status}</p>
                            <p className="text-xs text-slate-500 mt-1">Latency: 12ms</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-slate-800 bg-slate-900/50">
                  <CardContent className="p-6">
                    <h3 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
                      <HardDrive className="h-5 w-5 text-indigo-400" />
                      Storage Volumes
                    </h3>
                    <div className="space-y-3">
                      <div className="p-4 rounded-lg bg-slate-950/50 border border-slate-800">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/20 ring-1 ring-blue-500/30">
                              <span className="font-bold text-blue-400">C:</span>
                            </div>
                            <div>
                              <p className="font-medium text-white">System Drive (C:)</p>
                              <p className="text-xs text-slate-500">NTFS - Primary Partition</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-white">730 GB / 1 TB</p>
                            <p className="text-xs text-slate-500">73% Used</p>
                          </div>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                            style={{ width: "73%" }}
                          />
                        </div>
                      </div>
                      <div className="p-4 rounded-lg bg-slate-950/50 border border-slate-800">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-600/20 ring-1 ring-green-500/30">
                              <span className="font-bold text-green-400">D:</span>
                            </div>
                            <div>
                              <p className="font-medium text-white">Data Drive (D:)</p>
                              <p className="text-xs text-slate-500">NTFS - Secondary Storage</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-white">1.2 TB / 2 TB</p>
                            <p className="text-xs text-slate-500">60% Used</p>
                          </div>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-500"
                            style={{ width: "60%" }}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "files" && <FileManager deviceId={device.id} userId={userId} />}
            {activeTab === "screen" && <ScreenViewer deviceId={device.id} deviceName={device.name} />}
            {activeTab === "shell" && <ProfessionalTerminal deviceId={device.id} userId={userId} />}
            {activeTab === "services" && <ServicesManager deviceId={device.id} userId={userId} />}
            {activeTab === "software" && <SoftwareManager deviceId={device.id} userId={userId} />}
            {activeTab === "tasks" && <TaskManager deviceId={device.id} userId={userId} />}
          </div>
        </div>
      </div>
    </div>
  )
}
