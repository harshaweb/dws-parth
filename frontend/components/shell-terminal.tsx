"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Terminal, Trash2, Download, Maximize2, Minimize2, Expand, Send } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { API_ENDPOINTS } from "@/lib/api-config"

interface ShellTerminalProps {
  deviceId: string
  userId: string
}

interface ShellSession {
  id: string
  command: string
  output: string
  executed_at: string
  working_dir: string
}

export function ShellTerminal({ deviceId, userId }: ShellTerminalProps) {
  const [shellType, setShellType] = useState<"powershell" | "cmd">("powershell")
  const [command, setCommand] = useState("")
  const [history, setHistory] = useState<ShellSession[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [currentDir, setCurrentDir] = useState("")
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const terminalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingCommandRef = useRef<string>("")
  const { toast } = useToast()

  useEffect(() => {
    // Connect to WebSocket
    const websocket = new WebSocket(API_ENDPOINTS.ws)
    
    websocket.onopen = () => {
      console.log("💻 Shell terminal WebSocket connected")
      setWs(websocket)
    }

    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      
      if (message.type === "shell_response") {
        console.log("💻 Shell output received:", message.data)
        // Server returns response with success flag and data
        if (message.data && message.data.success && message.data.data) {
          const responseData = message.data.data
          const newSession: ShellSession = {
            id: Date.now().toString(),
            command: pendingCommandRef.current,
            output: responseData.output || "",
            executed_at: new Date().toISOString(),
            working_dir: responseData.working_dir || currentDir,
          }
          setHistory((prev) => [...prev, newSession])
          
          // Update current directory from response
          if (responseData.working_dir) {
            setCurrentDir(responseData.working_dir)
          }
        } else {
          const newSession: ShellSession = {
            id: Date.now().toString(),
            command: pendingCommandRef.current,
            output: message.data?.message || "Command execution failed",
            executed_at: new Date().toISOString(),
            working_dir: currentDir,
          }
          setHistory((prev) => [...prev, newSession])
        }
        setIsExecuting(false)
        pendingCommandRef.current = ""
      } else if (message.type === "switch_shell_response") {
        // Handle shell switch response
        if (message.data && message.data.success && message.data.data) {
          const responseData = message.data.data
          if (responseData.working_dir) {
            setCurrentDir(responseData.working_dir)
          }
        }
      } else if (message.type === "error") {
        // Only show error if there's a message
        if (message.data?.message) {
          toast({
            title: "Error",
            description: message.data.message,
            variant: "destructive",
          })
        }
        setIsExecuting(false)
      }
    }

    websocket.onerror = (error) => {
      console.error("Shell WebSocket error:", error)
      // Only show error on initial connection failure
      if (history.length === 0) {
        toast({
          title: "Connection Error",
          description: "Failed to connect to shell service",
          variant: "destructive",
        })
      }
    }

    return () => {
      websocket.close()
    }
  }, [])

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [history])

  // Focus input when clicking on terminal
  const handleTerminalClick = useCallback(() => {
    inputRef.current?.focus()
  }, [])

  const executeCommand = async () => {
    if (!command.trim() || !ws || ws.readyState !== WebSocket.OPEN) return

    const trimmedCommand = command.trim()
    
    // Handle clear/cls command locally
    if (trimmedCommand.toLowerCase() === "cls" || trimmedCommand.toLowerCase() === "clear") {
      setHistory([])
      setCommand("")
      return
    }

    setIsExecuting(true)
    pendingCommandRef.current = trimmedCommand
    
    // Add to command history for up/down navigation
    setCommandHistory(prev => {
      const newHistory = [...prev.filter(c => c !== trimmedCommand), trimmedCommand]
      return newHistory.slice(-50) // Keep last 50 commands
    })
    setHistoryIndex(-1)

    // Send command via WebSocket
    ws.send(JSON.stringify({
      type: "shell_command",
      data: {
        session_id: deviceId,
        command: trimmedCommand,
        shell_type: shellType
      }
    }))

    setCommand("")
  }

  const handleShellSwitch = (newShellType: "powershell" | "cmd") => {
    if (newShellType === shellType) return
    
    setShellType(newShellType)
    // Clear history when switching shells for a fresh start
    setHistory([])
    setCurrentDir("")
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "switch_shell",
        data: {
          session_id: deviceId,
          shell_type: newShellType
        }
      }))
    }
    
    toast({
      title: "Shell Switched",
      description: `Now using ${newShellType.toUpperCase()}`
    })
  }

  // Generate prompt string based on shell type and current directory
  const getPrompt = (dir?: string) => {
    const displayDir = dir || currentDir || "~"
    if (shellType === "powershell") {
      return `PS ${displayDir}>`
    } else {
      return `${displayDir}>`
    }
  }

  const clearHistory = () => {
    setHistory([])
    setCurrentDir("")
    toast({
      title: "Success",
      description: "Terminal history cleared",
    })
  }

  const toggleMaximize = () => {
    setIsMaximized(!isMaximized)
    if (isFullScreen) setIsFullScreen(false)
  }

  const toggleFullScreen = () => {
    setIsFullScreen(!isFullScreen)
    if (isMaximized) setIsMaximized(false)
  }

  const exportHistory = () => {
    const historyText = history
      .map((session) => {
        const prompt = shellType === "powershell" ? `PS ${session.working_dir}>` : `${session.working_dir}>`
        return `[${new Date(session.executed_at).toLocaleString()}] ${prompt} ${session.command}\n${session.output}\n\n`
      })
      .join("")

    const blob = new Blob([historyText], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `shell-history-${shellType}-${new Date().toISOString()}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isExecuting) {
      executeCommand()
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (commandHistory.length > 0) {
        const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex
        setHistoryIndex(newIndex)
        setCommand(commandHistory[commandHistory.length - 1 - newIndex] || "")
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setCommand(commandHistory[commandHistory.length - 1 - newIndex] || "")
      } else if (historyIndex === 0) {
        setHistoryIndex(-1)
        setCommand("")
      }
    } else if (e.key === "Tab") {
      e.preventDefault()
      // Tab completion could be added here in the future
    } else if (e.key === "c" && e.ctrlKey) {
      // Ctrl+C to cancel current input
      if (!isExecuting) {
        setCommand("")
      }
    } else if (e.key === "l" && e.ctrlKey) {
      // Ctrl+L to clear screen
      e.preventDefault()
      setHistory([])
    }
  }

  return (
    <Card className={`border-slate-800 bg-slate-900/50 ${isFullScreen ? 'fixed inset-0 z-50 rounded-none overflow-auto' : isMaximized ? 'fixed inset-4 z-50 overflow-auto' : ''}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Remote Shell
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
              onClick={toggleMaximize}
              title={isMaximized ? "Restore" : "Expand"}
            >
              {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`border-slate-700 text-white hover:bg-slate-700 ${isFullScreen ? 'bg-blue-600 border-blue-600' : 'bg-slate-800'}`}
              onClick={toggleFullScreen}
              title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
            >
              <Expand className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
              onClick={exportHistory}
              disabled={history.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-red-700 bg-red-950/20 text-red-400 hover:bg-red-950/40"
              onClick={clearHistory}
              disabled={history.length === 0}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={shellType} onValueChange={(value) => handleShellSwitch(value as "powershell" | "cmd")}>
          <TabsList className="mb-4 bg-slate-800 border border-slate-700">
            <TabsTrigger
              value="powershell"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-300"
            >
              <Terminal className="mr-2 h-4 w-4" />
              PowerShell
            </TabsTrigger>
            <TabsTrigger
              value="cmd"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-300"
            >
              <Terminal className="mr-2 h-4 w-4" />
              CMD
            </TabsTrigger>
          </TabsList>

          <TabsContent value={shellType} className="space-y-4">
            <div
              ref={terminalRef}
              onClick={handleTerminalClick}
              className={`font-mono text-sm bg-slate-950 border border-slate-800 rounded-lg p-4 overflow-y-auto cursor-text ${isFullScreen ? 'h-[calc(100vh-220px)]' : isMaximized ? 'h-[calc(100vh-280px)]' : 'h-96'}`}
            >
              {history.length === 0 ? (
                <div className="text-slate-500">
                  <p className="mb-2">{shellType === "powershell" ? "Windows PowerShell" : "Microsoft Windows [Version 10.0]"}</p>
                  <p className="mb-4">Copyright (c) Microsoft Corporation. All rights reserved.</p>
                  <p className="mb-2 text-slate-600">Type commands below. Use ↑↓ for history, Ctrl+L to clear.</p>
                  <div className="flex items-center gap-1 text-green-400">
                    <span>{getPrompt()}</span>
                    <span className="animate-pulse">_</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((session, index) => (
                    <div key={session.id} className="space-y-1">
                      <div className="flex items-start gap-1 flex-wrap">
                        <span className="text-green-400 font-semibold whitespace-nowrap">
                          {getPrompt(session.working_dir)}
                        </span>
                        <span className="text-yellow-300">{session.command}</span>
                      </div>
                      {session.output && (
                        <pre className="text-slate-300 whitespace-pre-wrap text-xs leading-relaxed ml-0">
                          {session.output}
                        </pre>
                      )}
                    </div>
                  ))}
                  {/* Current prompt line */}
                  {!isExecuting && (
                    <div className="flex items-center gap-1 text-green-400">
                      <span>{getPrompt()}</span>
                      <span className="animate-pulse">_</span>
                    </div>
                  )}
                  {isExecuting && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <span className="animate-spin">⠋</span>
                      <span>Executing...</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3">
              {/* Quick Commands */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-slate-500 mr-2 self-center">Quick:</span>
                {(shellType === "powershell" 
                  ? ["dir", "Get-Service", "Get-Process", "systeminfo", "ipconfig", "hostname"]
                  : ["dir", "tasklist", "systeminfo", "ipconfig", "hostname", "whoami"]
                ).map((cmd) => (
                  <Button
                    key={cmd}
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                    onClick={() => {
                      setCommand(cmd)
                    }}
                  >
                    {cmd}
                  </Button>
                ))}
              </div>

              {/* Command Input */}
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-1 bg-slate-950 border border-slate-700 rounded-lg p-3 focus-within:border-blue-500 transition-colors">
                  <span className="font-mono text-sm text-green-400 font-semibold whitespace-nowrap">
                    {getPrompt()}
                  </span>
                  <Input
                    ref={inputRef}
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type command..."
                    disabled={isExecuting}
                    className="border-0 bg-transparent text-yellow-300 font-mono text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-slate-600 h-6 p-0"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <Button
                  onClick={executeCommand}
                  disabled={!command.trim() || isExecuting}
                  className="bg-blue-600 hover:bg-blue-700 h-12 px-6"
                  size="lg"
                >
                  <Send className="mr-2 h-4 w-4" />
                  {isExecuting ? "Running..." : "Execute"}
                </Button>
              </div>
            </div>

            <div className="text-xs text-slate-500 space-y-1">
              <p>
                <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-400">↑</kbd>/<kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-400">↓</kbd> Navigate history • 
                <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-400 ml-2">Ctrl+L</kbd> Clear • 
                <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-400 ml-2">cls</kbd> or <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-400">clear</kbd> Clear screen
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
