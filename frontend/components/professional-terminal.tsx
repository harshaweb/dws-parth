"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Terminal as TerminalIcon, 
  Trash2, 
  Download, 
  Maximize2, 
  Minimize2, 
  Expand, 
  Settings,
  Copy,
  Clipboard
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { API_ENDPOINTS } from "@/lib/api-config"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { SearchAddon } from "@xterm/addon-search"

interface ProfessionalTerminalProps {
  deviceId: string
  userId: string
}

export function ProfessionalTerminal({ deviceId, userId }: ProfessionalTerminalProps) {
  const [shellType, setShellType] = useState<"powershell" | "cmd">("powershell")
  const [isConnected, setIsConnected] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [currentDir, setCurrentDir] = useState("")
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalInstance = useRef<Terminal | null>(null)
  const fitAddon = useRef<FitAddon | null>(null)
  const currentDirRef = useRef<string>("")
  const { toast } = useToast()

  // Initialize Terminal
  useEffect(() => {
    if (!terminalRef.current) return

    // Create terminal instance
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Courier New', monospace",
      theme: {
        background: "#0a0e14",
        foreground: "#b3b1ad",
        cursor: "#f29718",
        cursorAccent: "#0a0e14",
        black: "#01060e",
        red: "#ea6c73",
        green: "#91b362",
        yellow: "#f9af4f",
        blue: "#53bdfa",
        magenta: "#fae994",
        cyan: "#90e1c6",
        white: "#c7c7c7",
        brightBlack: "#686868",
        brightRed: "#f07178",
        brightGreen: "#c2d94c",
        brightYellow: "#ffb454",
        brightBlue: "#59c2ff",
        brightMagenta: "#ffee99",
        brightCyan: "#95e6cb",
        brightWhite: "#ffffff",
      },
      cols: 80,
      rows: 24,
      scrollback: 10000,
      fontWeight: "normal",
      fontWeightBold: "bold",
      allowProposedApi: true,
      disableStdin: false,
      convertEol: true,
    })

    // Load addons
    const fit = new FitAddon()
    const webLinks = new WebLinksAddon()
    const search = new SearchAddon()

    term.loadAddon(fit)
    term.loadAddon(webLinks)
    term.loadAddon(search)

    term.open(terminalRef.current)
    fit.fit()

    terminalInstance.current = term
    fitAddon.current = fit

    // Welcome message
    term.writeln("\x1b[1;36m╔══════════════════════════════════════════════════════════╗\x1b[0m")
    term.writeln("\x1b[1;36m║         Remote Windows Terminal - Professional           ║\x1b[0m")
    term.writeln("\x1b[1;36m╚══════════════════════════════════════════════════════════╝\x1b[0m")
    term.writeln("")
    term.writeln("\x1b[33mConnecting to remote device...\x1b[0m")
    term.writeln("")

    // Handle resize
    const handleResize = () => {
      if (fit) {
        setTimeout(() => fit.fit(), 100)
      }
    }

    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      term.dispose()
    }
  }, [])

  // Sync currentDir to ref
  useEffect(() => {
    currentDirRef.current = currentDir
  }, [currentDir])

  // WebSocket connection
  useEffect(() => {
    const websocket = new WebSocket(API_ENDPOINTS.ws)
    
    websocket.onopen = () => {
      console.log("💻 Terminal WebSocket connected")
      setWs(websocket)
      setIsConnected(true)
      
      if (terminalInstance.current) {
        terminalInstance.current.writeln("\x1b[32m✓ Connected to device\x1b[0m")
        terminalInstance.current.writeln("")
        writePrompt()
      }
    }

    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      
      if (message.type === "shell_response") {
        handleShellResponse(message.data)
      } else if (message.type === "switch_shell_response") {
        if (message.data && message.data.success && message.data.data) {
          const responseData = message.data.data
          if (responseData.working_dir) {
            setCurrentDir(responseData.working_dir)
          }
        }
      } else if (message.type === "error") {
        if (terminalInstance.current && message.data?.message) {
          terminalInstance.current.writeln(`\r\n\x1b[31m✗ Error: ${message.data.message}\x1b[0m`)
          writePrompt()
        }
      }
    }

    websocket.onerror = (error) => {
      console.error("Terminal WebSocket error:", error)
      if (terminalInstance.current) {
        terminalInstance.current.writeln("\r\n\x1b[31m✗ Connection error\x1b[0m")
      }
    }

    websocket.onclose = () => {
      setIsConnected(false)
      if (terminalInstance.current) {
        terminalInstance.current.writeln("\r\n\x1b[33m⚠ Connection closed\x1b[0m")
      }
    }

    return () => {
      websocket.close()
    }
  }, [shellType])

  // Handle terminal input
  useEffect(() => {
    if (!terminalInstance.current) return

    let commandBuffer = ""

    const handleData = (data: string) => {
      const term = terminalInstance.current
      if (!term || !ws || ws.readyState !== WebSocket.OPEN) return

      const code = data.charCodeAt(0)

      // Handle special keys
      if (code === 13) { // Enter
        term.write("\r\n")
        executeCommand(commandBuffer.trim())
        commandBuffer = ""
      } else if (code === 127) { // Backspace
        if (commandBuffer.length > 0) {
          commandBuffer = commandBuffer.slice(0, -1)
          term.write("\b \b")
        }
      } else if (code === 3) { // Ctrl+C
        term.writeln("^C")
        commandBuffer = ""
        writePrompt()
      } else if (code === 12) { // Ctrl+L (clear)
        term.clear()
        writePrompt()
      } else if (code >= 32) { // Printable characters
        commandBuffer += data
        term.write(data)
      }
    }

    const disposable = terminalInstance.current.onData(handleData)
    
    return () => {
      disposable.dispose()
    }
  }, [ws, currentDir, shellType])

  const writePrompt = () => {
    if (!terminalInstance.current) return
    const dir = currentDirRef.current || "~"
    const prompt = shellType === "powershell" 
      ? `\x1b[32mPS\x1b[0m \x1b[36m${dir}\x1b[0m\x1b[33m>\x1b[0m `
      : `\x1b[36m${dir}\x1b[0m\x1b[33m>\x1b[0m `
    terminalInstance.current.write(prompt)
  }

  const handleShellResponse = (data: any) => {
    if (!terminalInstance.current) return
    const term = terminalInstance.current

    if (data && data.success && data.data) {
      const responseData = data.data
      
      // Update current directory
      if (responseData.working_dir) {
        setCurrentDir(responseData.working_dir)
      }

      // Write output
      if (responseData.output) {
        const output = responseData.output.trim()
        if (output) {
          // Split by lines and write each
          output.split('\n').forEach((line: string) => {
            term.writeln(line.replace(/\r/g, ''))
          })
        }
      }
    } else {
      term.writeln(`\x1b[31m✗ ${data?.message || 'Command failed'}\x1b[0m`)
    }

    writePrompt()
  }

  const executeCommand = (command: string) => {
    if (!command || !ws || ws.readyState !== WebSocket.OPEN) {
      writePrompt()
      return
    }

    // Handle local commands
    if (command.toLowerCase() === "clear" || command.toLowerCase() === "cls") {
      terminalInstance.current?.clear()
      writePrompt()
      return
    }

    // Send to remote
    ws.send(JSON.stringify({
      type: "shell_command",
      device_id: deviceId,
      data: {
        session_id: deviceId,
        command: command,
        shell_type: shellType
      }
    }))
  }

  const handleShellSwitch = (newShellType: "powershell" | "cmd") => {
    if (newShellType === shellType) return
    
    setShellType(newShellType)
    setCurrentDir("")
    
    if (terminalInstance.current) {
      terminalInstance.current.clear()
      terminalInstance.current.writeln(`\x1b[33m→ Switched to ${newShellType.toUpperCase()}\x1b[0m`)
      terminalInstance.current.writeln("")
      writePrompt()
    }
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "switch_shell",
        device_id: deviceId,
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

  const clearTerminal = () => {
    terminalInstance.current?.clear()
    writePrompt()
  }

  const toggleMaximize = () => {
    setIsMaximized(!isMaximized)
    if (isFullScreen) setIsFullScreen(false)
    setTimeout(() => fitAddon.current?.fit(), 100)
  }

  const toggleFullScreen = () => {
    setIsFullScreen(!isFullScreen)
    if (isMaximized) setIsMaximized(false)
    setTimeout(() => fitAddon.current?.fit(), 100)
  }

  const copySelection = () => {
    const selection = terminalInstance.current?.getSelection()
    if (selection) {
      navigator.clipboard.writeText(selection)
      toast({
        title: "Copied",
        description: "Selection copied to clipboard"
      })
    }
  }

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      terminalInstance.current?.paste(text)
    } catch (err) {
      console.error("Failed to paste:", err)
    }
  }

  return (
    <Card className={`border-slate-800 bg-slate-900/50 backdrop-blur-sm ${
      isFullScreen ? 'fixed inset-0 z-50 rounded-none' : 
      isMaximized ? 'fixed inset-4 z-50 shadow-2xl' : ''
    }`}>
      <CardHeader className="border-b border-slate-800/50 bg-slate-900/80 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TerminalIcon className="h-5 w-5 text-blue-400" />
            <CardTitle className="text-white font-semibold">
              Professional Terminal
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
              <span className="text-xs text-slate-400">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-800"
              onClick={copySelection}
              title="Copy Selection (Ctrl+Shift+C)"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-800"
              onClick={pasteFromClipboard}
              title="Paste (Ctrl+Shift+V)"
            >
              <Clipboard className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-800"
              onClick={toggleMaximize}
              title={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 w-8 p-0 hover:bg-slate-800 ${
                isFullScreen ? 'text-blue-400' : 'text-slate-400 hover:text-white'
              }`}
              onClick={toggleFullScreen}
              title={isFullScreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              <Expand className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-400 hover:text-red-400 hover:bg-slate-800"
              onClick={clearTerminal}
              title="Clear Terminal"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs value={shellType} onValueChange={(value) => handleShellSwitch(value as "powershell" | "cmd")} className="w-full">
          <div className="border-b border-slate-800/50 bg-slate-900/60 px-4 h-[8vh]">
            <TabsList className="bg-transparent h-full p-0 border-0">
              <TabsTrigger
                value="powershell"
                className="data-[state=active]:bg-transparent data-[state=active]:text-blue-400 data-[state=active]:border-b-2 data-[state=active]:border-blue-400 text-slate-400 rounded-none h-10 px-4"
              >
                <TerminalIcon className="mr-2 h-4 w-4" />
                PowerShell
              </TabsTrigger>
              <TabsTrigger
                value="cmd"
                className="data-[state=active]:bg-transparent data-[state=active]:text-blue-400 data-[state=active]:border-b-2 data-[state=active]:border-blue-400 text-slate-400 rounded-none h-10 px-4"
              >
                <TerminalIcon className="mr-2 h-4 w-4" />
                CMD
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={shellType} className="m-0 p-4 focus-visible:outline-none focus-visible:ring-0">
            <div 
              ref={terminalRef}
              className={`rounded-lg overflow-hidden border border-slate-800/50 ${
                isFullScreen ? 'h-[calc(100vh-28vh)]' : 
                isMaximized ? 'h-[calc(100vh-28vh)]' : 
                'h-[60vh]'
              }`}
              style={{ padding: '8px' }}
            />
            <div className="mt-3 text-xs text-slate-500 flex items-center justify-between border-t border-slate-800/50 pt-3 h-[8vh]">
              <div className="flex items-center gap-4">
                <kbd className="px-2 py-1 bg-slate-800/50 rounded border border-slate-700">Ctrl+C</kbd>
                <span>Cancel</span>
                <kbd className="px-2 py-1 bg-slate-800/50 rounded border border-slate-700">Ctrl+L</kbd>
                <span>Clear</span>
                <kbd className="px-2 py-1 bg-slate-800/50 rounded border border-slate-700">Ctrl+Shift+C/V</kbd>
                <span>Copy/Paste</span>
              </div>
              <div className="text-slate-600">
                {currentDir && `📁 ${currentDir}`}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
