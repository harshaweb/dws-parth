"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, FolderOpen, Filter, X } from "lucide-react"
import type { Device } from "@/lib/types"
import { updateDeviceGroup } from "@/lib/api-client"
import { useToast } from "@/hooks/use-toast"
import type { Group } from "@/lib/types"

interface DeviceGroupsProps {
  devices: Device[]
  groups: Group[]
  selectedGroup: string | null
  onGroupSelect: (group: string | null) => void
  onDeviceUpdate: () => void
}

export function DeviceGroups({ devices, groups, selectedGroup, onGroupSelect, onDeviceUpdate }: DeviceGroupsProps) {
  const [newGroupName, setNewGroupName] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState<string | null>(null)
  const [selectedDeviceForGroup, setSelectedDeviceForGroup] = useState<Device | null>(null)
  const { toast } = useToast()

  const getDeviceCountByGroup = (groupName: string) => {
    return devices.filter((d) => d.group_name === groupName).length
  }

  const handleAssignToGroup = async (device: Device, groupName: string) => {
    try {
      await updateDeviceGroup(device.id, groupName)
      toast({
        title: "Group Updated",
        description: `${device.name} has been added to ${groupName}`,
      })
      onDeviceUpdate()
      setIsDialogOpen(null)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update device group",
        variant: "destructive",
      })
    }
  }

  const handleCreateAndAssign = async () => {
    if (!newGroupName.trim() || !selectedDeviceForGroup) return

    try {
      await updateDeviceGroup(selectedDeviceForGroup.id, newGroupName.trim())
      toast({
        title: "Group Created",
        description: `${selectedDeviceForGroup.name} has been added to ${newGroupName}`,
      })
      onDeviceUpdate()
      setNewGroupName("")
      setIsDialogOpen(null)
      setSelectedDeviceForGroup(null)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create group",
        variant: "destructive",
      })
    }
  }

  const openAssignDialog = (device: Device) => {
    setSelectedDeviceForGroup(device)
    setIsDialogOpen(device.id)
  }

  return (
    <div className="mb-6 space-y-4">
      {/* Group Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={selectedGroup === null ? "default" : "outline"}
          size="sm"
          onClick={() => onGroupSelect(null)}
          className={
            selectedGroup === null
              ? "bg-blue-600 hover:bg-blue-700"
              : "border-slate-700 bg-slate-800/50 hover:bg-slate-800"
          }
        >
          <FolderOpen className="mr-2 h-4 w-4" />
          All Devices ({devices.length})
        </Button>

        {groups.map((group) => (
          <Button
            key={group.id}
            variant={selectedGroup === group.name ? "default" : "outline"}
            size="sm"
            onClick={() => onGroupSelect(group.name)}
            className={
              selectedGroup === group.name
                ? "bg-purple-600 hover:bg-purple-700"
                : "border-slate-700 bg-slate-800/50 hover:bg-slate-800"
            }
          >
            {group.name} ({getDeviceCountByGroup(group.name)})
            {selectedGroup === group.name && (
              <X
                className="ml-2 h-3 w-3"
                onClick={(e) => {
                  e.stopPropagation()
                  onGroupSelect(null)
                }}
              />
            )}
          </Button>
        ))}
      </div>

      {/* Device Group Assignment */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-slate-500" />
        <span className="text-sm text-slate-400">Assign devices to groups:</span>
        <div className="flex gap-2 flex-wrap">
          {devices.map((device) => (
            <Dialog
              key={device.id}
              open={isDialogOpen === device.id}
              onOpenChange={(open) => setIsDialogOpen(open ? device.id : null)}
            >
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-700 bg-slate-800/50 hover:bg-slate-800"
                  onClick={() => openAssignDialog(device)}
                >
                  {device.name}
                  {device.group_name && (
                    <Badge
                      variant="outline"
                      className="ml-2 border-purple-500/30 bg-purple-500/10 text-purple-400 text-xs"
                    >
                      {device.group_name}
                    </Badge>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="border-slate-800 bg-slate-900 text-white">
                <DialogHeader>
                  <DialogTitle>Assign {device.name} to Group</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Select an existing group or create a new one
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  {groups.length > 0 && (
                    <div>
                      <p className="text-sm text-slate-400 mb-2">Existing Groups:</p>
                      <div className="flex flex-wrap gap-2">
                        {groups.map((group) => (
                          <Button
                            key={group.id}
                            variant="outline"
                            size="sm"
                            onClick={() => handleAssignToGroup(device, group.name)}
                            className={
                              device.group_name === group.name
                                ? "border-purple-500 bg-purple-500/20 text-purple-300"
                                : "border-slate-700 bg-slate-800 hover:bg-slate-700"
                            }
                          >
                            {group.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-sm text-slate-400 mb-2">Create New Group:</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter group name..."
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        className="bg-slate-800 border-slate-700"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleCreateAndAssign()
                          }
                        }}
                      />
                      <Button
                        onClick={handleCreateAndAssign}
                        disabled={!newGroupName.trim()}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Create
                      </Button>
                    </div>
                  </div>

                  {device.group_name && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAssignToGroup(device, "")}
                      className="w-full border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                    >
                      Remove from Group
                    </Button>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          ))}
        </div>
      </div>
    </div>
  )
}
