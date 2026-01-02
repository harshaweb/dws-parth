"use client"

import type React from "react"
import { useState } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Monitor,
  User,
  WifiOff,
  Wifi,
  AlertTriangle,
  Activity,
  MoreVertical,
  Trash2,
  Archive,
  Edit,
  Power,
  Tag,
  Check,
  X,
  FolderInput,
} from "lucide-react"
import { useRouter } from "next/navigation"
import type { Device, Group } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { wsService } from "@/lib/websocket-service"

interface DeviceGridProps {
  devices: Device[]
  groups?: Group[]
  onDelete?: (id: string) => void
  onArchive?: (id: string) => void
  onLabelUpdate?: (id: string, label: string) => void
  onMoveToGroup?: (deviceId: string, groupName: string) => void
}

export function DeviceGrid({ devices, groups = [], onDelete, onArchive, onLabelUpdate, onMoveToGroup }: DeviceGridProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [editingLabel, setEditingLabel] = useState<string | null>(null)
  const [labelValue, setLabelValue] = useState("")

  const handleDelete = (e: React.MouseEvent, deviceId: string, deviceName: string) => {
    e.stopPropagation()
    if (confirm(`Are you sure you want to delete ${deviceName}?`)) {
      onDelete?.(deviceId)
      toast({
        title: "Device Deleted",
        description: `${deviceName} has been removed from your dashboard.`,
      })
    }
  }

  const handleArchive = (e: React.MouseEvent, deviceId: string, deviceName: string) => {
    e.stopPropagation()
    onArchive?.(deviceId)
    toast({
      title: "Device Archived",
      description: `${deviceName} has been archived.`,
    })
  }

  const handleShutdown = (e: React.MouseEvent, deviceId: string, deviceName: string) => {
    e.stopPropagation()
    if (confirm(`Are you sure you want to shutdown ${deviceName}?`)) {
      wsService.send({
        type: "system_shutdown",
        device_id: deviceId,
        data: {
          force: true
        }
      })
      toast({
        title: "Shutdown Command Sent",
        description: `Force shutting down ${deviceName}...`,
      })
    }
  }

  const handleRestart = (e: React.MouseEvent, deviceId: string, deviceName: string) => {
    e.stopPropagation()
    if (confirm(`Are you sure you want to restart ${deviceName}?`)) {
      wsService.send({
        type: "system_restart",
        device_id: deviceId,
        data: {
          force: true
        }
      })
      toast({
        title: "Restart Command Sent",
        description: `Force restarting ${deviceName}...`,
      })
    }
  }

  const startEditingLabel = (e: React.MouseEvent, deviceId: string, currentLabel: string) => {
    e.stopPropagation()
    setEditingLabel(deviceId)
    setLabelValue(currentLabel || "")
  }

  const cancelEditingLabel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingLabel(null)
    setLabelValue("")
  }

  const saveLabel = async (e: React.MouseEvent, deviceId: string, deviceName: string) => {
    e.stopPropagation()
    try {
      // Send label update via WebSocket to the agent
      const sent = wsService.send({
        type: "update_label",
        device_id: deviceId,
        data: {
          label: labelValue
        }
      })
      
      if (!sent) {
        throw new Error("WebSocket not connected")
      }
      
      // Optimistically update UI
      onLabelUpdate?.(deviceId, labelValue)
      
      toast({
        title: "Label Updated",
        description: `Label for ${deviceName} has been updated.`,
      })
      setEditingLabel(null)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update label. Make sure the device is connected.",
        variant: "destructive",
      })
    }
  }

  if (devices.length === 0) {
    return (
      <Card className="border-slate-800 bg-slate-900/50">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Monitor className="mb-4 h-16 w-16 text-slate-600" />
          <h3 className="mb-2 text-xl font-semibold text-slate-300">No Devices Found</h3>
          <p className="text-sm text-slate-500">Add your first Windows device to get started</p>
          <Button className="mt-4 bg-blue-600 hover:bg-blue-700">Add Device</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {devices.map((device) => (
        <Card
          key={device.id}
          className="group cursor-pointer overflow-hidden border-slate-800 bg-slate-900/50 transition-all hover:border-blue-500/50 hover:bg-slate-900"
          onClick={() => router.push(`/dashboard/device/${device.id}`)}
        >
          <div className="relative h-32 w-full overflow-hidden bg-slate-800">
            <img
              src={device.wallpaper_url || "/placeholder.svg"}
              alt={`${device.name} wallpaper`}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent" />

            <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
              <Badge
                variant="outline"
                className={cn(
                  "border font-medium backdrop-blur-sm text-xs px-1.5 py-0",
                  device.status === "online"
                    ? "border-green-500/30 bg-green-500/20 text-green-400"
                    : device.status === "maintenance"
                      ? "border-yellow-500/30 bg-yellow-500/20 text-yellow-400"
                      : "border-slate-600/30 bg-slate-600/20 text-slate-400",
                )}
              >
                {device.status === "online" ? (
                  <Activity className="mr-0.5 h-2.5 w-2.5" />
                ) : device.status === "maintenance" ? (
                  <AlertTriangle className="mr-0.5 h-2.5 w-2.5" />
                ) : (
                  <WifiOff className="mr-0.5 h-2.5 w-2.5" />
                )}
                {device.status}
              </Badge>
              {device.connection_status === "connected" ? (
                <div className="rounded-full bg-green-500/20 p-1 backdrop-blur-sm">
                  <Wifi className="h-3 w-3 text-green-400" />
                </div>
              ) : (
                <div className="rounded-full bg-slate-600/20 p-1 backdrop-blur-sm">
                  <WifiOff className="h-3 w-3 text-slate-400" />
                </div>
              )}
            </div>

            <div className="absolute left-2 top-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full bg-slate-900/50 backdrop-blur-sm text-white hover:bg-slate-900/80"
                  >
                    <MoreVertical className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48 border-slate-800 bg-slate-900">
                  <DropdownMenuItem
                    className="text-slate-300 focus:bg-slate-800 focus:text-white"
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push(`/dashboard/device/${device.id}`)
                    }}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Manage Device
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-slate-300 focus:bg-slate-800 focus:text-white"
                    onClick={(e) => handleRestart(e, device.id, device.name)}
                  >
                    <Power className="mr-2 h-4 w-4" />
                    Restart
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-slate-300 focus:bg-slate-800 focus:text-white"
                    onClick={(e) => handleShutdown(e, device.id, device.name)}
                  >
                    <Power className="mr-2 h-4 w-4" />
                    Shutdown
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-slate-800" />
                  {groups.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <DropdownMenuItem
                          className="text-slate-300 focus:bg-slate-800 focus:text-white"
                          onClick={(e) => e.stopPropagation()}
                          onSelect={(e) => e.preventDefault()}
                        >
                          <FolderInput className="mr-2 h-4 w-4" />
                          Move to Group
                        </DropdownMenuItem>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" className="border-slate-800 bg-slate-900">
                        {groups.map((group) => (
                          <DropdownMenuItem
                            key={group.id}
                            className="text-slate-300 focus:bg-slate-800 focus:text-white"
                            onClick={(e) => {
                              e.stopPropagation()
                              console.log('Clicking group:', group.name, 'for device:', device.id)
                              onMoveToGroup?.(device.id, group.name)
                            }}
                          >
                            {group.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <DropdownMenuSeparator className="bg-slate-800" />
                  <DropdownMenuItem
                    className="text-yellow-400 focus:bg-yellow-950/20 focus:text-yellow-400"
                    onClick={(e) => handleArchive(e, device.id, device.name)}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Archive
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-red-400 focus:bg-red-950/20 focus:text-red-400"
                    onClick={(e) => handleDelete(e, device.id, device.name)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <CardContent className="p-3">
            <div className="mb-2 flex items-start gap-2">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600/10 ring-1 ring-blue-500/20 group-hover:bg-blue-600/20">
                <Monitor className="h-4 w-4 text-blue-500" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="mb-0.5 truncate text-sm font-semibold text-white">{device.name}</h3>
                <p className="truncate text-xs text-slate-400">{device.hostname}</p>
              </div>
            </div>

            {/* Label Section */}
            <div className="mb-2 rounded-lg bg-slate-800/50 p-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <Tag className="h-2.5 w-2.5" />
                  <span className="text-xs">Label</span>
                </div>
                {editingLabel !== device.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 px-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-slate-800"
                    onClick={(e) => startEditingLabel(e, device.id, device.label)}
                  >
                    <Edit className="h-2.5 w-2.5" />
                  </Button>
                )}
              </div>
              {editingLabel === device.id ? (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Input
                    value={labelValue}
                    onChange={(e) => setLabelValue(e.target.value)}
                    className="h-6 text-xs bg-slate-900 border-slate-700 text-white"
                    placeholder="Enter label..."
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-green-400 hover:text-green-300 hover:bg-slate-800"
                    onClick={(e) => saveLabel(e, device.id, device.name)}
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-slate-800"
                    onClick={(e) => cancelEditingLabel(e)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <p className="text-xs font-medium text-slate-200 truncate">
                  {device.label || <span className="text-slate-500 italic">No label</span>}
                </p>
              )}
            </div>

            {/* Group Badge */}
            {device.group_name && (
              <div className="mb-2">
                <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-400 text-xs px-1.5 py-0">
                  {device.group_name}
                </Badge>
              </div>
            )}

            <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-800/50 p-2">
              <User className="h-3 w-3 text-blue-400" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500">Windows User</p>
                <p className="truncate text-xs font-medium text-slate-200">{device.windows_username}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
