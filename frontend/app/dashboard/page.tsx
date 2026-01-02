"use client"

import { useEffect, useState } from "react"
import { DeviceGrid } from "@/components/device-grid"
import { DeviceList } from "@/components/device-list"
import { DashboardHeader } from "@/components/dashboard-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { fetchDevices, fetchGroups, createGroup, deleteGroup, updateDeviceGroup } from "@/lib/api-client"
import type { Device, Group } from "@/lib/types"
import { wsService } from "@/lib/websocket-service"
import { 
  FolderPlus, 
  Trash2, 
  FolderOpen, 
  ChevronLeft, 
  ChevronRight,
  Monitor,
  Wifi,
  WifiOff,
  Layers,
  LayoutGrid,
  List,
  Search,
  RefreshCw,
  Plus,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

export default function DashboardPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState("")
  const [newGroupDescription, setNewGroupDescription] = useState("")
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const { toast } = useToast()
  const router = useRouter()

  useEffect(() => {
    loadDevices()
    loadGroups()
    
    const handleMessage = (message: any) => {
      if (message.type === 'device_connected') {
        console.log('📱 Device connected:', message.data)
        loadDevices()
      } else if (message.type === 'device_disconnected') {
        console.log('📱 Device disconnected:', message.device_id)
        setDevices(prevDevices => 
          prevDevices.map(device => 
            device.id === message.device_id 
              ? { ...device, status: 'offline', connection_status: 'disconnected' }
              : device
          )
        )
      } else if (message.type === 'device_list') {
        console.log('📋 Device list received:', message.data)
        if (Array.isArray(message.data)) {
          setDevices(message.data)
          setLoading(false)
        }
      } else if (message.type === 'update_label_response') {
        console.log('🏷️ Label update response:', message.data)
        loadDevices()
      }
    }

    const cleanup = wsService.addMessageHandler(handleMessage)
    const interval = setInterval(loadDevices, 30000)
    
    return () => {
      cleanup()
      clearInterval(interval)
    }
  }, [])

  async function loadDevices() {
    try {
      const data = await fetchDevices()
      setDevices(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load devices")
      console.error("Failed to load devices:", err)
    } finally {
      setLoading(false)
    }
  }

  async function loadGroups() {
    try {
      const data = await fetchGroups()
      setGroups(data)
    } catch (err) {
      console.error("Failed to load groups:", err)
    }
  }

  async function handleCreateGroup() {
    if (!newGroupName.trim()) return

    try {
      await createGroup(newGroupName.trim(), newGroupDescription.trim())
      toast({
        title: "Group Created",
        description: `Group "${newGroupName}" has been created successfully.`,
      })
      loadGroups()
      setIsCreateDialogOpen(false)
      setNewGroupName("")
      setNewGroupDescription("")
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create group",
        variant: "destructive",
      })
    }
  }

  async function handleDeleteGroup(groupId: string, groupName: string) {
    if (!confirm(`Delete group "${groupName}"? Devices will not be deleted.`)) return

    try {
      await deleteGroup(groupId)
      toast({
        title: "Group Deleted",
        description: `Group "${groupName}" has been deleted.`,
      })
      loadGroups()
      if (selectedGroup === groupName) {
        setSelectedGroup(null)
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete group",
        variant: "destructive",
      })
    }
  }

  const demoUser = {
    id: "user-1",
    email: "demo@devicedashboard.com",
  }

  // Filter by group and search
  const filteredDevices = devices
    .filter(device => selectedGroup ? device.group_name === selectedGroup : true)
    .filter(device => 
      searchQuery 
        ? device.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          device.hostname.toLowerCase().includes(searchQuery.toLowerCase()) ||
          device.label?.toLowerCase().includes(searchQuery.toLowerCase())
        : true
    )

  const getDeviceCountByGroup = (groupName: string) => {
    return devices.filter((d) => d.group_name === groupName).length
  }

  const onlineCount = devices.filter(d => d.connection_status === 'connected').length
  const offlineCount = devices.filter(d => d.connection_status !== 'connected').length

  const handleLabelUpdate = (id: string, label: string) => {
    setDevices((prevDevices) =>
      prevDevices.map((device) => (device.id === id ? { ...device, label } : device))
    )
  }

  const handleMoveToGroup = async (deviceId: string, groupName: string) => {
    try {
      console.log('Moving device:', deviceId, 'to group:', groupName)
      
      // Optimistically update local state
      setDevices((prevDevices) =>
        prevDevices.map((device) =>
          device.id === deviceId ? { ...device, group_name: groupName } : device
        )
      )
      
      // Save to server
      const result = await updateDeviceGroup(deviceId, groupName)
      console.log('Update result:', result)
      
      toast({
        title: "Device Moved",
        description: `Device moved to "${groupName}" group`,
      })
      
      loadGroups() // Refresh group counts
    } catch (error) {
      console.error('Error moving device to group:', error)
      // Revert on error
      loadDevices()
      toast({
        title: "Error",
        description: "Failed to move device to group",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <DashboardHeader user={demoUser} />
      
      <div className="container mx-auto px-6 pt-24 pb-8">
        <div className="flex gap-6">
          {/* Sidebar */}
          <div
            className={cn(
              "flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/50 p-4 backdrop-blur transition-all duration-300 h-fit sticky top-24",
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

            {/* All Devices Tab */}
            <Button
              variant="ghost"
              className={cn(
                "w-full justify-start gap-3 h-11 transition-all",
                selectedGroup === null
                  ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/20"
                  : "text-slate-300 hover:text-white hover:bg-slate-800",
                isSidebarCollapsed && "justify-center px-0",
              )}
              onClick={() => setSelectedGroup(null)}
            >
              <Layers className="h-4 w-4 shrink-0" />
              {!isSidebarCollapsed && (
                <span className="flex-1 text-left">All Devices</span>
              )}
              {!isSidebarCollapsed && (
                <span className="text-xs bg-slate-800/50 px-2 py-0.5 rounded-full">
                  {devices.length}
                </span>
              )}
            </Button>

            {/* Divider */}
            <div className="h-px bg-slate-800 my-2" />

            {/* Groups Header */}
            {!isSidebarCollapsed && (
              <div className="flex items-center justify-between px-2 mb-1">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Groups</span>
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-white">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="border-slate-800 bg-slate-900 text-white">
                    <DialogHeader>
                      <DialogTitle>Create New Group</DialogTitle>
                      <DialogDescription className="text-slate-400">
                        Organize your devices into groups
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <label className="text-sm text-slate-400 mb-2 block">Group Name</label>
                        <Input
                          placeholder="Enter group name..."
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                          className="bg-slate-800 border-slate-700"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-slate-400 mb-2 block">Description (optional)</label>
                        <Input
                          placeholder="Enter description..."
                          value={newGroupDescription}
                          onChange={(e) => setNewGroupDescription(e.target.value)}
                          className="bg-slate-800 border-slate-700"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={handleCreateGroup}
                        disabled={!newGroupName.trim()}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        Create Group
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}

            {/* Group List */}
            <div className="space-y-1">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg transition-all group",
                    selectedGroup === group.name
                      ? "bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-lg shadow-purple-500/20"
                      : "text-slate-300 hover:bg-slate-800",
                  )}
                >
                  <Button
                    variant="ghost"
                    className={cn(
                      "flex-1 justify-start gap-3 h-11 hover:bg-transparent",
                      isSidebarCollapsed && "justify-center px-0",
                    )}
                    onClick={() => setSelectedGroup(group.name)}
                  >
                    <FolderOpen className="h-4 w-4 shrink-0" />
                    {!isSidebarCollapsed && (
                      <span className="flex-1 text-left truncate">{group.name}</span>
                    )}
                    {!isSidebarCollapsed && (
                      <span className="text-xs bg-slate-800/50 px-2 py-0.5 rounded-full">
                        {getDeviceCountByGroup(group.name)}
                      </span>
                    )}
                  </Button>
                  {!isSidebarCollapsed && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteGroup(group.id, group.name)
                      }}
                      className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/20 rounded mr-1 transition-opacity"
                    >
                      <Trash2 className="h-3 w-3 text-red-400" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Create Group Button (when collapsed) */}
            {isSidebarCollapsed && (
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-center h-11 text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    <FolderPlus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
              </Dialog>
            )}
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {/* Header with Search and Actions */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-white">
                  {selectedGroup || "All Devices"}
                </h1>
                <p className="text-sm text-slate-400 mt-1">
                  {selectedGroup
                    ? `${filteredDevices.length} device${filteredDevices.length !== 1 ? 's' : ''} in this group`
                    : "Monitor and manage your Windows devices"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search devices..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-64 bg-slate-900/50 border-slate-700 focus:border-blue-500"
                  />
                </div>

                {/* View Toggle */}
                <div className="flex items-center bg-slate-900/50 rounded-lg p-1 border border-slate-700">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-8 w-8",
                      viewMode === "grid" ? "bg-slate-700 text-white" : "text-slate-400"
                    )}
                    onClick={() => setViewMode("grid")}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-8 w-8",
                      viewMode === "list" ? "bg-slate-700 text-white" : "text-slate-400"
                    )}
                    onClick={() => setViewMode("list")}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>

                {/* Refresh */}
                <Button
                  variant="outline"
                  size="icon"
                  className="border-slate-700 bg-slate-900/50 text-slate-400 hover:text-white"
                  onClick={() => {
                    loadDevices()
                    toast({ title: "Refreshed", description: "Device list updated" })
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Content Area */}
            <div className="h-[calc(100vh-240px)] overflow-y-auto scrollbar-hide">
              {loading && (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center">
                    <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
                    <p className="text-slate-400">Loading devices...</p>
                  </div>
                </div>
              )}

              {error && (
                <Card className="border-red-500/20 bg-red-500/10">
                  <CardContent className="p-6">
                    <p className="text-red-400 font-medium">⚠️ {error}</p>
                    <p className="mt-2 text-sm text-slate-400">
                      Make sure the backend server is running
                    </p>
                    <Button
                      variant="outline"
                      onClick={loadDevices}
                      className="mt-4 border-red-500/30 text-red-400 hover:bg-red-500/10"
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Retry
                    </Button>
                  </CardContent>
                </Card>
              )}

              {!loading && !error && filteredDevices.length === 0 && (
                <Card className="border-slate-700 bg-slate-900/30">
                  <CardContent className="p-12 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 mx-auto mb-4">
                      <Monitor className="h-8 w-8 text-slate-500" />
                    </div>
                    <p className="text-lg font-medium text-slate-300">No devices found</p>
                    <p className="mt-2 text-sm text-slate-500">
                      {searchQuery 
                        ? "Try adjusting your search query"
                        : selectedGroup 
                          ? "No devices in this group yet"
                          : "Start the agent on a device to register it"}
                    </p>
                  </CardContent>
                </Card>
              )}

              {!loading && !error && filteredDevices.length > 0 && (
                viewMode === "list" ? (
                  <DeviceList 
                    devices={filteredDevices} 
                    groups={groups}
                    onLabelUpdate={handleLabelUpdate}
                    onMoveToGroup={handleMoveToGroup}
                  />
                ) : (
                  <DeviceGrid 
                    devices={filteredDevices} 
                    groups={groups}
                    onLabelUpdate={handleLabelUpdate}
                    onMoveToGroup={handleMoveToGroup}
                  />
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
