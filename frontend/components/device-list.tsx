"use client"

import type React from "react"
import { useState } from "react"

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

interface DeviceListProps {
  devices: Device[]
  groups?: Group[]
  onDelete?: (id: string) => void
  onArchive?: (id: string) => void
  onLabelUpdate?: (id: string, label: string) => void
  onMoveToGroup?: (deviceId: string, groupName: string) => void
}

export function DeviceList({ devices, groups = [], onDelete, onArchive, onLabelUpdate, onMoveToGroup }: DeviceListProps) {
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
      <div className="border border-slate-800 bg-slate-900/50 rounded-lg p-12 text-center">
        <Monitor className="h-16 w-16 text-slate-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-slate-300 mb-2">No Devices Found</h3>
        <p className="text-sm text-slate-500">Add your first Windows device to get started</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {devices.map((device) => (
        <div
          key={device.id}
          className="group cursor-pointer border border-slate-800 bg-slate-900/50 rounded-lg p-4 transition-all hover:border-blue-500/50 hover:bg-slate-900"
          onClick={() => router.push(`/dashboard/device/${device.id}`)}
        >
          <div className="flex items-center gap-4">
            {/* Device Icon */}
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600/10 ring-1 ring-blue-500/20 group-hover:bg-blue-600/20">
              <Monitor className="h-6 w-6 text-blue-500" />
            </div>

            {/* Device Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-semibold text-white truncate">{device.name}</h3>
                <Badge
                  variant="outline"
                  className={cn(
                    "border font-medium text-xs px-1.5 py-0",
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
                  <Wifi className="h-4 w-4 text-green-400" />
                ) : (
                  <WifiOff className="h-4 w-4 text-slate-400" />
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-slate-400">
                <span className="truncate">{device.hostname}</span>
                <span>•</span>
                <span>{device.ip_address}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {device.windows_username}
                </span>
              </div>
            </div>

            {/* Label */}
            <div className="flex items-center gap-2 min-w-[200px]">
              {editingLabel === device.id ? (
                <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                  <Input
                    value={labelValue}
                    onChange={(e) => setLabelValue(e.target.value)}
                    className="h-7 text-xs bg-slate-900 border-slate-700 text-white"
                    placeholder="Enter label..."
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-green-400 hover:text-green-300"
                    onClick={(e) => saveLabel(e, device.id, device.name)}
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-red-400 hover:text-red-300"
                    onClick={(e) => cancelEditingLabel(e)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-1">
                  <Tag className="h-3 w-3 text-slate-500" />
                  <span className="text-sm text-slate-300 truncate">
                    {device.label || <span className="text-slate-500 italic">No label</span>}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-blue-400 hover:text-blue-300"
                    onClick={(e) => startEditingLabel(e, device.id, device.label)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* Group Badge */}
            {device.group_name && (
              <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-400 text-xs px-2 py-0">
                {device.group_name}
              </Badge>
            )}

            {/* Last Seen */}
            <div className="text-xs text-slate-400 min-w-[100px] text-right">
              {new Date(device.last_seen).toLocaleDateString()}
            </div>

            {/* Actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 hover:text-white"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 border-slate-800 bg-slate-900">
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
      ))}
    </div>
  )
}
