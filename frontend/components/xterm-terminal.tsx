"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Terminal as TerminalIcon, Trash2, Power, Maximize2, Minimize2, Expand, Send, Code } from "lucide-react"
import { API_ENDPOINTS } from "@/lib/api-config"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { SearchAddon } from "@xterm/addon-search"
import "@xterm/xterm/css/xterm.css"

interface XtermTerminalProps {
  deviceId: string
  userId: string
}

export function XtermTerminal({ deviceId, userId }: XtermTerminalProps) {
  const [shellType, setShellType] = useState<"powershell" | "cmd">("powershell")
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isMaximized, setIsMaximized] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [showScriptInput, setShowScriptInput] = useState(false)
  const [scriptInput, setScriptInput] = useState("")
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const commandBufferRef = useRef<string>("")

  useEffect(() => {
    if (!terminalRef.current) return

    // Initialize XTerm with best configuration
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Consolas", "Courier New", monospace',
      fontWeight: "normal",
      fontWeightBold: "bold",
      lineHeight: 1.2,
      letterSpacing: 0,
      scrollback: 10000,
      tabStopWidth: 4,
      allowProposedApi: true,
      theme: shellType === "powershell" ? {
        background: "#012456",
        foreground: "#CCCCCC",
        cursor: "#FFFFFF",
        cursorAccent: "#000000",
        selection: "rgba(255, 255, 255, 0.3)",
        black: "#0C0C0C",
        red: "#C50F1F",
        green: "#13A10E",
        yellow: "#C19C00",
        blue: "#0037DA",
        magenta: "#881798",
        cyan: "#3A96DD",
        white: "#CCCCCC",
        brightBlack: "#767676",
        brightRed: "#E74856",
        brightGreen: "#16C60C",
        brightYellow: "#F9F1A5",
        brightBlue: "#3B78FF",
        brightMagenta: "#B4009E",
        brightCyan: "#61D6D6",
        brightWhite: "#F2F2F2"
      } : {
        background: "#0C0C0C",
        foreground: "#CCCCCC",
        cursor: "#FFFFFF",
        cursorAccent: "#000000",
        selection: "rgba(255, 255, 255, 0.3)",
        black: "#0C0C0C",
        red: "#C50F1F",
        green: "#13A10E",
        yellow: "#C19C00",
        blue: "#0037DA",
        magenta: "#881798",
        cyan: "#3A96DD",
        white: "#CCCCCC",
        brightBlack: "#767676",
        brightRed: "#E74856",
        brightGreen: "#16C60C",
        brightYellow: "#F9F1A5",
        brightBlue: "#3B78FF",
        brightMagenta: "#B4009E",
        brightCyan: "#61D6D6",
        brightWhite: "#F2F2F2"
      },
      cols: 120,
      rows: 20,
      convertEol: true,
      windowsMode: true
    })

    // Add addons
    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    const searchAddon = new SearchAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.loadAddon(searchAddon)
    term.open(terminalRef.current)
    fitAddon.fit()

    xtermRef.current = term
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon

    // Modern welcome banner
    if (shellType === "powershell") {
      term.writeln("")
      term.writeln("  ")
      term.writeln("    \x1b[1;96m⚡ PowerShell 7.4.0\x1b[0m")
      term.writeln("    \x1b[90m─────────────────────────────────────────\x1b[0m")
      term.writeln("    \x1b[36mRemote Shell Session\x1b[0m \x1b[90m│\x1b[0m \x1b[32mSecure Connection\x1b[0m")
      term.writeln("  ")
      term.writeln("")
    } else {
      term.writeln("")
      term.writeln("  ")
      term.writeln("    \x1b[1;37m⚡ Command Prompt\x1b[0m")
      term.writeln("    \x1b[90m─────────────────────────────────────────\x1b[0m")
      term.writeln("    \x1b[36mRemote Shell Session\x1b[0m \x1b[90m│\x1b[0m \x1b[32mSecure Connection\x1b[0m")
      term.writeln("  ")
      term.writeln("")
    }

    // Show initial prompt immediately
    const initialPrompt = shellType === "powershell" ? "\x1b[32mPS C:\\>\x1b[0m " : "\x1b[37mC:\\>\x1b[0m "
    term.write(initialPrompt)

    // Handle user input in terminal
    term.onData((data) => {
      if (data === "\r") {
        // Enter key
        term.write("\r\n")
        const command = commandBufferRef.current
        if (command.trim() && wsRef.current?.readyState === WebSocket.OPEN) {
          executeCommand(command)
        }
        commandBufferRef.current = ""
        term.write(getPrompt())
      } else if (data === "\x7f" || data === "\b") {
        // Backspace
        if (commandBufferRef.current.length > 0) {
          commandBufferRef.current = commandBufferRef.current.slice(0, -1)
          term.write("\b \b")
        }
      } else if (data === "\x03") {
        // Ctrl+C
        term.write("^C\r\n")
        commandBufferRef.current = ""
        term.write(getPrompt())
      } else if (data === "\x1b[A") {
        // Arrow up - history (can be implemented)
      } else if (data === "\x1b[B") {
        // Arrow down - history
      } else if (data.charCodeAt(0) >= 32 || data === "\t") {
        // Regular printable character or tab
        commandBufferRef.current += data
        term.write(data)
      }
    })

    // Resize handler
    const handleResize = () => {
      fitAddon.fit()
    }
    window.addEventListener("resize", handleResize)

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize)
      term.dispose()
    }
  }, [terminalRef.current, shellType])

  useEffect(() => {
    // Connect to WebSocket
    const websocket = new WebSocket(API_ENDPOINTS.ws)
    wsRef.current = websocket

    websocket.onopen = () => {
      console.log("💻 Shell terminal WebSocket connected")
      setIsConnected(true)
      setIsLoading(false)
    }

    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data)

      if (message.type === "shell_response") {
        if (message.data?.success && message.data?.data?.output) {
          const output = message.data.data.output
          if (xtermRef.current) {
            // Write output with proper formatting
            const lines = output.split(/\r?\n/)
            lines.forEach((line: string, index: number) => {
              // Skip empty last line
              if (index === lines.length - 1 && line === '') return
              xtermRef.current!.writeln(line)
            })
            
            // Get the correct prompt based on shell type in the response
            const responseShellType = message.data?.data?.shell_type || shellType
            const prompt = responseShellType === "powershell" 
              ? "\x1b[32mPS C:\\>\x1b[0m " 
              : "\x1b[37mC:\\>\x1b[0m "
            xtermRef.current.write(prompt)
          }
        } else if (message.data?.error) {
          if (xtermRef.current) {
            xtermRef.current.writeln(`\x1b[31mError: ${message.data.error}\x1b[0m`)
            
            // Get the correct prompt based on shell type
            const responseShellType = message.data?.data?.shell_type || shellType
            const prompt = responseShellType === "powershell" 
              ? "\x1b[32mPS C:\\>\x1b[0m " 
              : "\x1b[37mC:\\>\x1b[0m "
            xtermRef.current.write(prompt)
          }
        }
      }
    }

    websocket.onerror = (error) => {
      console.error("Shell WebSocket error:", error)
      if (xtermRef.current) {
        xtermRef.current.writeln("\r\n\x1b[31m✗ Connection error\x1b[0m")
      }
      setIsConnected(false)
    }

    websocket.onclose = () => {
      console.log("🔌 WebSocket disconnected")
      if (xtermRef.current) {
        xtermRef.current.writeln("\r\n\x1b[33m✗ Connection closed\x1b[0m")
      }
      setIsConnected(false)
    }

    return () => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.close()
      }
    }
  }, [])

  const getPrompt = () => {
    if (shellType === "powershell") {
      return "\x1b[32mPS C:\\>\x1b[0m "
    } else {
      return "\x1b[37mC:\\>\x1b[0m "
    }
  }

  const executeCommand = (command: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      if (xtermRef.current) {
        xtermRef.current.writeln("\x1b[31mError: Not connected to server\x1b[0m")
        xtermRef.current.write(getPrompt())
      }
      return
    }

    wsRef.current.send(JSON.stringify({
      type: "shell_command",
      device_id: deviceId,
      data: {
        command: command,
        shell_type: shellType
      }
    }))
  }

  const executeScript = () => {
    if (!scriptInput.trim() || !isConnected) return
    
    if (xtermRef.current) {
      xtermRef.current.writeln(`\x1b[36m[Executing multi-line script...]\x1b[0m`)
    }
    
    executeCommand(scriptInput)
    setScriptInput("")
    setShowScriptInput(false)
  }

  const handleClear = () => {
    if (xtermRef.current) {
      xtermRef.current.clear()
      xtermRef.current.write(getPrompt())
    }
  }

  const handleShellChange = (type: "powershell" | "cmd") => {
    setShellType(type)
  }

  const toggleMaximize = () => {
    setIsMaximized(!isMaximized)
    if (isFullScreen) setIsFullScreen(false)
    setTimeout(() => fitAddonRef.current?.fit(), 100)
  }

  const toggleFullScreen = () => {
    setIsFullScreen(!isFullScreen)
    if (isMaximized) setIsMaximized(false)
    setTimeout(() => fitAddonRef.current?.fit(), 100)
  }

  return (
    <div className={`${shellType === 'powershell' ? 'bg-[#012456]' : 'bg-black'} ${isFullScreen ? 'fixed inset-0 z-50' : isMaximized ? 'fixed inset-4 z-50' : ''} rounded-xl overflow-hidden shadow-2xl border border-slate-700/50`}>
      {/* macOS-style Top Bar */}
      <div className={`h-12 ${shellType === 'powershell' ? 'bg-gradient-to-b from-[#1e3a5f] to-[#012456]' : 'bg-gradient-to-b from-gray-900 to-black'} border-b border-slate-700/50 flex items-center justify-between px-4`}>
        {/* Left: Traffic Lights + Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button 
              onClick={handleClear}
              className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-all shadow-md hover:shadow-lg"
              title="Clear"
            />
            <button 
              onClick={toggleMaximize}
              className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-all shadow-md hover:shadow-lg"
              title={isMaximized ? "Restore" : "Maximize"}
            />
            <button 
              onClick={toggleFullScreen}
              className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-all shadow-md hover:shadow-lg"
              title={isFullScreen ? "Exit Fullscreen" : "Fullscreen"}
            />
          </div>
          
          <div className="flex items-center gap-2 ml-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/30">
              <button
                onClick={() => handleShellChange("powershell")}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${shellType === 'powershell' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
              >
                PS
              </button>
              <button
                onClick={() => handleShellChange("cmd")}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${shellType === 'cmd' ? 'bg-gray-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
              >
                CMD
              </button>
            </div>
          </div>
        </div>

        {/* Center: Title */}
        <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-2 text-slate-300">
          <TerminalIcon className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">
            {shellType === "powershell" ? "PowerShell" : "Command Prompt"}
          </span>
        </div>

        {/* Right: Status + Actions */}
        <div className="flex items-center gap-2">
          {isConnected && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-green-500/10 border border-green-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-green-400 font-medium">Live</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 px-2 text-xs ${showScriptInput ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
            onClick={() => setShowScriptInput(!showScriptInput)}
            title="Batch Script"
          >
            <Code className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Terminal Content */}
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm z-10">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="h-16 w-16 rounded-full border-4 border-slate-700 border-t-blue-500 animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-slate-300 font-medium mb-1">Connecting to server...</p>
                <p className="text-slate-500 text-sm">Establishing secure connection</p>
              </div>
            </div>
          </div>
        )}
        <div
          ref={terminalRef}
          className="w-full"
          style={{ 
            height: showScriptInput 
              ? (isFullScreen ? "calc(100vh - 220px)" : isMaximized ? "calc(100vh - 280px)" : "calc(75vh - 200px)")
              : (isFullScreen ? "calc(100vh - 48px)" : isMaximized ? "calc(100vh - 96px)" : "75vh"),
            minHeight: showScriptInput ? "350px" : "400px"
          }}
        />

        {showScriptInput && (
          <div className={`border-t border-slate-700/50 p-4 ${shellType === 'powershell' ? 'bg-[#001d3d]' : 'bg-gray-900'}`}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-xs text-slate-300 font-medium">
                    Script Editor
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  {scriptInput.split('\n').length} lines • {scriptInput.length} chars
                </span>
              </div>
              <Textarea
                value={scriptInput}
                onChange={(e) => setScriptInput(e.target.value)}
                placeholder={shellType === "cmd" 
                  ? "@echo off\nrmdir /Q /S \"C:\\temp\"\nNet Stop \"ServiceName\"\nXcopy /E /I \"C:\\source\" \"C:\\dest\"\nexit" 
                  : "# PowerShell Script\nGet-Process | Select-Object -First 5\nWrite-Host 'Completed'"}
                className={`min-h-[150px] border-slate-600 ${shellType === 'powershell' ? 'bg-[#012456]' : 'bg-black'} text-white font-mono text-sm focus-visible:ring-blue-500 placeholder:text-slate-600 resize-y rounded-lg`}
                onKeyDown={(e) => {
                  if (e.ctrlKey && e.key === 'Enter') {
                    e.preventDefault()
                    executeScript()
                  }
                }}
              />
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">
                  Ctrl+Enter to execute
                </span>
                <Button
                  onClick={executeScript}
                  disabled={!scriptInput.trim() || !isConnected}
                  className="bg-blue-600 hover:bg-blue-700 shadow-lg"
                  size="sm"
                >
                  <Send className="mr-2 h-3 w-3" />
                  Execute
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
