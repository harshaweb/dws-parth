"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  RefreshCw,
  Search,
  XCircle,
  Maximize2,
  Minimize2,
  Expand,
  Info,
  FolderOpen,
  Gauge,
  ArrowUpDown,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { wsService } from "@/lib/websocket-service"

interface TaskManagerProps {
  deviceId: string
  userId: string
}

interface ProcessInfo {
  pid: number
  name: string
  status: string
  cpu_percent: number
  memory_mb: number
  memory_percent: number
  username: string
  command_line?: string
  create_time: number
  num_threads: number
  io_read?: number
  io_write?: number
  parent_pid: number
  exe_path?: string
}

type SortField = "name" | "pid" | "cpu_percent" | "memory_mb" | "status"
type SortOrder = "asc" | "desc"

export function TaskManager({ deviceId, userId }: TaskManagerProps) {
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [filteredProcesses, setFilteredProcesses] = useState<ProcessInfo[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [killDialogOpen, setKillDialogOpen] = useState(false)
  const [processToKill, setProcessToKill] = useState<ProcessInfo | null>(null)
  const [sortField, setSortField] = useState<SortField>("memory_mb")
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")
  const [autoRefresh, setAutoRefresh] = useState(false)
  const { toast } = useToast()

  const loadProcesses = useCallback(() => {
    if (!wsService.isConnected()) {
      toast({
        title: "Not Connected",
        description: "WebSocket is not connected",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    wsService.send({
      type: "task_manager",
      device_id: deviceId,
      data: {
        action: "list"
      }
    })
  }, [deviceId, wsService, toast])

  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === "task_manager_response") {
        setIsLoading(false)
        if (message.data?.success && message.data?.processes) {
          setProcesses(message.data.processes)
        } else if (message.data?.message) {
          // Check if it's a kill confirmation
          if (message.data.message.includes("terminated")) {
            toast({
              title: "Process Terminated",
              description: message.data.message,
            })
            loadProcesses()
          } else if (!message.data.success) {
            toast({
              title: "Error",
              description: message.data.message,
              variant: "destructive",
            })
          }
        }
      }
    }

    const cleanup = wsService.addMessageHandler(handleMessage)
    loadProcesses()

    return cleanup
  }, [loadProcesses, toast])

  // Auto refresh every 5 seconds if enabled
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      loadProcesses()
    }, 5000)

    return () => clearInterval(interval)
  }, [autoRefresh, loadProcesses])

  // Filter and sort processes
  useEffect(() => {
    let filtered = processes.filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.pid.toString().includes(searchQuery) ||
      (p.username && p.username.toLowerCase().includes(searchQuery.toLowerCase()))
    )

    // Sort
    filtered.sort((a, b) => {
      let aVal: any = a[sortField]
      let bVal: any = b[sortField]

      if (typeof aVal === "string") {
        aVal = aVal.toLowerCase()
        bVal = bVal?.toLowerCase() || ""
      }

      if (sortOrder === "asc") {
        return aVal > bVal ? 1 : -1
      } else {
        return aVal < bVal ? 1 : -1
      }
    })

    setFilteredProcesses(filtered)
  }, [processes, searchQuery, sortField, sortOrder])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortOrder("desc")
    }
  }

  const handleEndTask = (process: ProcessInfo) => {
    setProcessToKill(process)
    setKillDialogOpen(true)
  }

  const confirmKillProcess = () => {
    if (!processToKill || !wsService.isConnected()) return

    wsService.send({
      type: "task_manager",
      device_id: deviceId,
      data: {
        action: "kill",
        pid: processToKill.pid
      }
    })

    setKillDialogOpen(false)
    setProcessToKill(null)
  }

  const handleViewDetails = (process: ProcessInfo) => {
    setSelectedProcess(process)
    setDetailsDialogOpen(true)

    // Request detailed info
    wsService.send({
      type: "task_manager",
      device_id: deviceId,
      data: {
        action: "details",
        pid: process.pid
      }
    })
  }

  const handleOpenFileLocation = (process: ProcessInfo) => {
    wsService.send({
      type: "task_manager",
      device_id: deviceId,
      data: {
        action: "open_location",
        pid: process.pid
      }
    })
  }

  const handleSetPriority = (process: ProcessInfo, priority: string) => {
    wsService.send({
      type: "task_manager",
      device_id: deviceId,
      data: {
        action: "set_priority",
        pid: process.pid,
        priority: priority
      }
    })

    toast({
      title: "Priority Changed",
      description: `Setting ${process.name} priority to ${priority}`,
    })
  }

  const formatMemory = (mb: number) => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB`
    }
    return `${mb.toFixed(1)} MB`
  }

  const formatUptime = (createTime: number) => {
    if (!createTime) return "-"
    const now = Date.now()
    const diff = now - createTime
    const hours = Math.floor(diff / 3600000)
    const minutes = Math.floor((diff % 3600000) / 60000)
    
    if (hours > 24) {
      const days = Math.floor(hours / 24)
      return `${days}d ${hours % 24}h`
    }
    return `${hours}h ${minutes}m`
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "running":
        return "bg-green-500/20 text-green-400 border-green-500/30"
      case "sleeping":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30"
      case "stopped":
        return "bg-red-500/20 text-red-400 border-red-500/30"
      case "zombie":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30"
      default:
        return "bg-slate-500/20 text-slate-400 border-slate-500/30"
    }
  }

  const totalCPU = processes.reduce((sum, p) => sum + p.cpu_percent, 0)
  const totalMemory = processes.reduce((sum, p) => sum + p.memory_mb, 0)

  return (
    <>
      <Card className={`border-slate-800 bg-slate-900/50 ${isFullScreen ? 'fixed inset-0 z-50 rounded-none overflow-auto' : isMaximized ? 'fixed inset-4 z-50 overflow-auto' : ''}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Task Manager
              <Badge variant="outline" className="ml-2 border-slate-700 text-slate-400">
                {processes.length} processes
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* Stats */}
              <div className="flex items-center gap-4 mr-4 text-sm">
                <div className="flex items-center gap-1 text-slate-400">
                  <Cpu className="h-4 w-4" />
                  <span>{totalCPU.toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-1 text-slate-400">
                  <MemoryStick className="h-4 w-4" />
                  <span>{formatMemory(totalMemory)}</span>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                className={`border-slate-700 text-white hover:bg-slate-700 ${autoRefresh ? 'bg-green-600 border-green-600' : 'bg-slate-800'}`}
                onClick={() => setAutoRefresh(!autoRefresh)}
                title={autoRefresh ? "Stop Auto Refresh" : "Auto Refresh (5s)"}
              >
                <RefreshCw className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
                onClick={loadProcesses}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
                onClick={() => { setIsMaximized(!isMaximized); if (isFullScreen) setIsFullScreen(false); }}
              >
                {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={`border-slate-700 text-white hover:bg-slate-700 ${isFullScreen ? 'bg-blue-600 border-blue-600' : 'bg-slate-800'}`}
                onClick={() => { setIsFullScreen(!isFullScreen); if (isMaximized) setIsMaximized(false); }}
              >
                <Expand className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Search processes by name, PID, or user..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-950 border-slate-700 text-white"
            />
          </div>

          {/* Process Table */}
          <div className={`overflow-auto border border-slate-800 rounded-lg ${isFullScreen ? 'max-h-[calc(100vh-200px)]' : isMaximized ? 'max-h-[calc(100vh-260px)]' : 'max-h-[500px]'}`}>
            <Table>
              <TableHeader className="sticky top-0 bg-slate-900 z-10">
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead 
                    className="text-slate-400 cursor-pointer hover:text-white"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center gap-1">
                      Name
                      {sortField === "name" && <ArrowUpDown className="h-3 w-3" />}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-slate-400 cursor-pointer hover:text-white w-20"
                    onClick={() => handleSort("pid")}
                  >
                    <div className="flex items-center gap-1">
                      PID
                      {sortField === "pid" && <ArrowUpDown className="h-3 w-3" />}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-slate-400 cursor-pointer hover:text-white w-20 text-right"
                    onClick={() => handleSort("cpu_percent")}
                  >
                    <div className="flex items-center gap-1 justify-end">
                      CPU
                      {sortField === "cpu_percent" && <ArrowUpDown className="h-3 w-3" />}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-slate-400 cursor-pointer hover:text-white w-24 text-right"
                    onClick={() => handleSort("memory_mb")}
                  >
                    <div className="flex items-center gap-1 justify-end">
                      Memory
                      {sortField === "memory_mb" && <ArrowUpDown className="h-3 w-3" />}
                    </div>
                  </TableHead>
                  <TableHead className="text-slate-400 w-32">User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProcesses.map((process) => (
                  <ContextMenu key={process.pid}>
                    <ContextMenuTrigger asChild>
                      <TableRow 
                        className="border-slate-800 hover:bg-slate-800/50 cursor-context-menu"
                        onClick={() => setSelectedProcess(process)}
                      >
                        <TableCell className="text-white font-medium">
                          {process.name}
                        </TableCell>
                        <TableCell className="text-slate-400 font-mono text-sm">
                          {process.pid}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono text-sm ${process.cpu_percent > 50 ? 'text-red-400' : process.cpu_percent > 20 ? 'text-yellow-400' : 'text-slate-300'}`}>
                            {process.cpu_percent.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono text-sm ${process.memory_mb > 1024 ? 'text-red-400' : process.memory_mb > 500 ? 'text-yellow-400' : 'text-slate-300'}`}>
                            {formatMemory(process.memory_mb)}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-400 text-sm truncate max-w-[120px]">
                          {process.username?.split("\\").pop() || "-"}
                        </TableCell>
                      </TableRow>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-56 bg-slate-900 border-slate-700">
                      <ContextMenuItem
                        className="text-white hover:bg-slate-800 cursor-pointer"
                        onClick={() => handleViewDetails(process)}
                      >
                        <Info className="mr-2 h-4 w-4" />
                        View Details
                      </ContextMenuItem>
                      <ContextMenuItem
                        className="text-white hover:bg-slate-800 cursor-pointer"
                        onClick={() => handleOpenFileLocation(process)}
                      >
                        <FolderOpen className="mr-2 h-4 w-4" />
                        Open File Location
                      </ContextMenuItem>
                      <ContextMenuSeparator className="bg-slate-700" />
                      <ContextMenuSub>
                        <ContextMenuSubTrigger className="text-white hover:bg-slate-800">
                          <Gauge className="mr-2 h-4 w-4" />
                          Set Priority
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="bg-slate-900 border-slate-700">
                          <ContextMenuItem
                            className="text-red-400 hover:bg-slate-800 cursor-pointer"
                            onClick={() => handleSetPriority(process, "realtime")}
                          >
                            Realtime
                          </ContextMenuItem>
                          <ContextMenuItem
                            className="text-orange-400 hover:bg-slate-800 cursor-pointer"
                            onClick={() => handleSetPriority(process, "high")}
                          >
                            High
                          </ContextMenuItem>
                          <ContextMenuItem
                            className="text-yellow-400 hover:bg-slate-800 cursor-pointer"
                            onClick={() => handleSetPriority(process, "above")}
                          >
                            Above Normal
                          </ContextMenuItem>
                          <ContextMenuItem
                            className="text-white hover:bg-slate-800 cursor-pointer"
                            onClick={() => handleSetPriority(process, "normal")}
                          >
                            Normal
                          </ContextMenuItem>
                          <ContextMenuItem
                            className="text-blue-400 hover:bg-slate-800 cursor-pointer"
                            onClick={() => handleSetPriority(process, "below")}
                          >
                            Below Normal
                          </ContextMenuItem>
                          <ContextMenuItem
                            className="text-slate-400 hover:bg-slate-800 cursor-pointer"
                            onClick={() => handleSetPriority(process, "low")}
                          >
                            Low
                          </ContextMenuItem>
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      <ContextMenuSeparator className="bg-slate-700" />
                      <ContextMenuItem
                        className="text-red-400 hover:bg-red-950 cursor-pointer"
                        onClick={() => handleEndTask(process)}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        End Task
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Process Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              {selectedProcess?.name}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Process ID: {selectedProcess?.pid}
            </DialogDescription>
          </DialogHeader>
          {selectedProcess && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">Status</div>
                  <Badge variant="outline" className={getStatusColor(selectedProcess.status)}>
                    {selectedProcess.status}
                  </Badge>
                </div>
                <div className="bg-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">Threads</div>
                  <div className="text-white font-mono">{selectedProcess.num_threads}</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">CPU Usage</div>
                  <div className="text-white font-mono">{selectedProcess.cpu_percent.toFixed(1)}%</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">Memory</div>
                  <div className="text-white font-mono">{formatMemory(selectedProcess.memory_mb)}</div>
                </div>
              </div>
              <div className="bg-slate-800 rounded-lg p-3">
                <div className="text-xs text-slate-500 mb-1">User</div>
                <div className="text-white">{selectedProcess.username || "-"}</div>
              </div>
              {selectedProcess.exe_path && (
                <div className="bg-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">Executable Path</div>
                  <div className="text-white text-sm break-all">{selectedProcess.exe_path}</div>
                </div>
              )}
              {selectedProcess.command_line && (
                <div className="bg-slate-800 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">Command Line</div>
                  <div className="text-white text-sm break-all font-mono">{selectedProcess.command_line}</div>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
                  onClick={() => handleOpenFileLocation(selectedProcess)}
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Open Location
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => {
                    setDetailsDialogOpen(false)
                    handleEndTask(selectedProcess)
                  }}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  End Task
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Kill Confirmation Dialog */}
      <AlertDialog open={killDialogOpen} onOpenChange={setKillDialogOpen}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">End Task?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to end <span className="text-white font-semibold">{processToKill?.name}</span> (PID: {processToKill?.pid})?
              This may cause unsaved data to be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white hover:bg-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={confirmKillProcess}
            >
              End Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
