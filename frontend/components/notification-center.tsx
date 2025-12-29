"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Bell, X, Monitor, Wifi, WifiOff, AlertTriangle, CheckCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { wsService } from "@/lib/websocket-service"

interface Notification {
  id: string
  type: "device-online" | "device-offline" | "alert" | "success"
  title: string
  message: string
  deviceName?: string
  timestamp: Date
  read: boolean
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [toasts, setToasts] = useState<Notification[]>([])

  const playNotificationSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

      const oscillator1 = audioContext.createOscillator()
      const oscillator2 = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator1.connect(gainNode)
      oscillator2.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator1.frequency.value = 800
      oscillator2.frequency.value = 600

      oscillator1.type = "sine"
      oscillator2.type = "sine"

      gainNode.gain.setValueAtTime(0, audioContext.currentTime)
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)

      oscillator1.start(audioContext.currentTime)
      oscillator2.start(audioContext.currentTime)

      oscillator1.stop(audioContext.currentTime + 0.5)
      oscillator2.stop(audioContext.currentTime + 0.5)
    } catch (error) {
      console.log("[v0] Audio playback blocked or unavailable")
    }
  }

  const showToast = (notification: Notification) => {
    setToasts((prev) => [...prev, notification])

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== notification.id))
    }, 10000)
  }

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  useEffect(() => {
    // Listen for real-time device connection/disconnection events
    const handleMessage = (message: any) => {
      if (message.type === 'device_connected') {
        const newNotification: Notification = {
          id: Date.now().toString(),
          type: "device-online",
          title: "Device Connected",
          message: `${message.data?.name || 'A device'} is now online`,
          deviceName: message.data?.name,
          timestamp: new Date(),
          read: false,
        }
        setNotifications((prev) => [newNotification, ...prev])
        setUnreadCount((prev) => prev + 1)
        showToast(newNotification)
        playNotificationSound()
      } else if (message.type === 'device_disconnected') {
        const newNotification: Notification = {
          id: Date.now().toString(),
          type: "device-offline",
          title: "Device Disconnected",
          message: `${message.device_name || 'A device'} has gone offline`,
          deviceName: message.device_name,
          timestamp: new Date(),
          read: false,
        }
        setNotifications((prev) => [newNotification, ...prev])
        setUnreadCount((prev) => prev + 1)
        showToast(newNotification)
        playNotificationSound()
      }
    }

    const cleanup = wsService.addMessageHandler(handleMessage)

    return () => {
      cleanup()
    }
  }, [])

  const markAsRead = (id: string) => {
    setNotifications((prev) => prev.map((notif) => (notif.id === id ? { ...notif, read: true } : notif)))
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((notif) => ({ ...notif, read: true })))
    setUnreadCount(0)
  }

  const removeNotification = (id: string) => {
    const notification = notifications.find((n) => n.id === id)
    if (notification && !notification.read) {
      setUnreadCount((prev) => Math.max(0, prev - 1))
    }
    setNotifications((prev) => prev.filter((notif) => notif.id !== id))
  }

  const getIcon = (type: Notification["type"]) => {
    switch (type) {
      case "device-online":
        return <Wifi className="h-4 w-4 text-green-400" />
      case "device-offline":
        return <WifiOff className="h-4 w-4 text-red-400" />
      case "alert":
        return <AlertTriangle className="h-4 w-4 text-yellow-400" />
      case "success":
        return <CheckCircle className="h-4 w-4 text-blue-400" />
    }
  }

  const getColorClass = (type: Notification["type"]) => {
    switch (type) {
      case "device-online":
        return "border-green-500/30 bg-green-500/10"
      case "device-offline":
        return "border-red-500/30 bg-red-500/10"
      case "alert":
        return "border-yellow-500/30 bg-yellow-500/10"
      case "success":
        return "border-blue-500/30 bg-blue-500/10"
    }
  }

  const getToastBgClass = (type: Notification["type"]) => {
    switch (type) {
      case "device-online":
        return "bg-green-500/95 border-green-400"
      case "device-offline":
        return "bg-red-500/95 border-red-400"
      case "alert":
        return "bg-yellow-500/95 border-yellow-400"
      case "success":
        return "bg-blue-500/95 border-blue-400"
    }
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[9999] flex items-end justify-end p-6">
        {/* <div className="pointer-events-auto flex flex-col-reverse gap-3 w-full max-w-md">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={cn(
                "w-full rounded-lg border-2 p-4 shadow-2xl backdrop-blur-sm animate-in slide-in-from-right-full duration-300",
                getToastBgClass(toast.type),
              )}
            >
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/20">
                  {getIcon(toast.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold text-white text-sm">{toast.title}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-white/80 hover:text-white hover:bg-white/20 -mt-1 -mr-2"
                      onClick={() => removeToast(toast.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-white/90 mb-1">{toast.message}</p>
                  {toast.deviceName && (
                    <div className="flex items-center gap-1 text-xs text-white/80">
                      <Monitor className="h-3 w-3" />
                      {toast.deviceName}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div> */}
      </div>

      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10 text-slate-400 hover:text-white"
          onClick={() => setIsOpen(!isOpen)}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white animate-pulse">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <Card className="absolute right-0 top-12 z-50 w-96 border-slate-800 bg-slate-900 shadow-2xl">
              <div className="border-b border-slate-800 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-white">Notifications</h3>
                    <p className="text-xs text-slate-400">
                      {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={markAllAsRead}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      Mark all read
                    </Button>
                  )}
                </div>
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center">
                    <Bell className="mx-auto h-12 w-12 text-slate-600 mb-3" />
                    <p className="text-slate-400">No notifications yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={cn(
                          "p-4 transition-colors hover:bg-slate-800/50 relative",
                          !notification.read && "bg-slate-800/30",
                        )}
                        onClick={() => !notification.read && markAsRead(notification.id)}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 h-6 w-6 text-slate-500 hover:text-slate-300"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeNotification(notification.id)
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                        <div className="flex gap-3 pr-6">
                          <div
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                              getColorClass(notification.type),
                            )}
                          >
                            {getIcon(notification.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-white text-sm">{notification.title}</p>
                              {!notification.read && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                            </div>
                            <p className="text-sm text-slate-400 mb-1">{notification.message}</p>
                            {notification.deviceName && (
                              <div className="flex items-center gap-1 text-xs text-slate-500">
                                <Monitor className="h-3 w-3" />
                                {notification.deviceName}
                              </div>
                            )}
                            <p className="text-xs text-slate-600 mt-1">{notification.timestamp.toLocaleTimeString()}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </>
        )}
      </div>
    </>
  )
}
