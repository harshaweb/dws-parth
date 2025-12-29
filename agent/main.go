package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
)

const (
	SERVER_URL = "ws://localhost:8080/ws/client" // Local testing
	// For production, use: "wss://dws-parth.daucu.com/ws/client"
)

type ClientMessage struct {
	Type     string      `json:"type"`
	DeviceID string      `json:"device_id"`
	Data     interface{} `json:"data"`
}

type SystemInfo struct {
	CPUUsage    float64 `json:"cpu_usage"`
	CPUCores    int     `json:"cpu_cores"`
	RAMTotal    uint64  `json:"ram_total"`
	RAMUsed     uint64  `json:"ram_used"`
	RAMPercent  float64 `json:"ram_percent"`
	DiskTotal   uint64  `json:"disk_total"`
	DiskUsed    uint64  `json:"disk_used"`
	DiskPercent float64 `json:"disk_percent"`
	OS          string  `json:"os"`
	Platform    string  `json:"platform"`
	Hostname    string  `json:"hostname"`
	Username    string  `json:"username"`
	IPAddress   string  `json:"ip_address"`
	Uptime      uint64  `json:"uptime"`
}

type DeviceInfo struct {
	DeviceID  string `json:"device_id"`
	Hostname  string `json:"hostname"`
	OS        string `json:"os"`
	Platform  string `json:"platform"`
	Username  string `json:"username"`
	IPAddress string `json:"ip_address"`
	Wallpaper string `json:"wallpaper_url"`
	Label     string `json:"label"`      // Device label stored locally
	GroupName string `json:"group_name"` // Device group stored locally
}

type LocalConfig struct {
	Label     string `json:"label"`
	GroupName string `json:"group_name"`
}

type Agent struct {
	conn        *websocket.Conn
	deviceID    string
	writeMux    sync.Mutex // Protect concurrent writes to WebSocket
	configPath  string
	localConfig LocalConfig
}

func NewAgent() *Agent {
	hostname, _ := os.Hostname()

	// Get config directory path
	configDir, _ := os.UserConfigDir()
	agentConfigDir := filepath.Join(configDir, "dws-agent")
	os.MkdirAll(agentConfigDir, 0755)

	agent := &Agent{
		deviceID:   hostname, // Use hostname as device ID
		configPath: filepath.Join(agentConfigDir, "config.json"),
	}

	// Load local config (label)
	agent.loadLocalConfig()

	return agent
}

func (a *Agent) loadLocalConfig() {
	data, err := ioutil.ReadFile(a.configPath)
	if err != nil {
		// If file doesn't exist, create with empty values
		a.localConfig = LocalConfig{Label: "", GroupName: ""}
		a.saveLocalConfig()
		return
	}

	err = json.Unmarshal(data, &a.localConfig)
	if err != nil {
		log.Printf("⚠️  Failed to parse config file: %v", err)
		a.localConfig = LocalConfig{Label: "", GroupName: ""}
	}
	log.Printf("📋 Loaded local config: label=%s, group=%s", a.localConfig.Label, a.localConfig.GroupName)
}

func (a *Agent) saveLocalConfig() error {
	data, err := json.MarshalIndent(a.localConfig, "", "  ")
	if err != nil {
		return err
	}

	err = ioutil.WriteFile(a.configPath, data, 0644)
	if err != nil {
		return err
	}

	log.Printf("💾 Saved local config: label=%s, group=%s", a.localConfig.Label, a.localConfig.GroupName)
	return nil
}

func (a *Agent) updateLabel(newLabel string) error {
	a.localConfig.Label = newLabel
	return a.saveLocalConfig()
}

func (a *Agent) updateGroupName(newGroup string) error {
	a.localConfig.GroupName = newGroup
	return a.saveLocalConfig()
}

func (a *Agent) Connect() error {
	conn, _, err := websocket.DefaultDialer.Dial(SERVER_URL, nil)
	if err != nil {
		return fmt.Errorf("failed to connect to server: %v", err)
	}
	a.conn = conn
	log.Println("✅ Connected to central server")
	return nil
}

func (a *Agent) RegisterDevice() error {
	hostInfo, _ := host.Info()
	username := os.Getenv("USERNAME")
	if username == "" {
		username = os.Getenv("USER")
	}

	deviceInfo := DeviceInfo{
		DeviceID:  a.deviceID,
		Hostname:  hostInfo.Hostname,
		OS:        runtime.GOOS,
		Platform:  hostInfo.Platform + " " + hostInfo.PlatformVersion,
		Username:  username,
		IPAddress: getLocalIP(),
		Wallpaper: getWallpaperPath(),
		Label:     a.localConfig.Label,     // Include local label
		GroupName: a.localConfig.GroupName, // Include local group
	}

	msg := ClientMessage{
		Type:     "device_register",
		DeviceID: a.deviceID,
		Data:     deviceInfo,
	}

	a.writeMux.Lock()
	err := a.conn.WriteJSON(msg)
	a.writeMux.Unlock()
	if err != nil {
		return fmt.Errorf("failed to register device: %v", err)
	}

	log.Println("📝 Device registered with server")
	return nil
}

func (a *Agent) SendSystemInfo() error {
	info := &SystemInfo{
		CPUCores: runtime.NumCPU(),
		OS:       runtime.GOOS,
	}

	// CPU Usage
	cpuPercent, err := cpu.Percent(time.Second, false)
	if err == nil && len(cpuPercent) > 0 {
		info.CPUUsage = cpuPercent[0]
	}

	// RAM Info
	vmem, err := mem.VirtualMemory()
	if err == nil {
		info.RAMTotal = vmem.Total
		info.RAMUsed = vmem.Used
		info.RAMPercent = vmem.UsedPercent
	}

	// Disk Info (C: drive on Windows)
	diskPath := "/"
	if runtime.GOOS == "windows" {
		diskPath = "C:\\"
	}
	diskStat, err := disk.Usage(diskPath)
	if err == nil {
		info.DiskTotal = diskStat.Total
		info.DiskUsed = diskStat.Used
		info.DiskPercent = diskStat.UsedPercent
	}

	// Host Info
	hostInfo, err := host.Info()
	if err == nil {
		info.Hostname = hostInfo.Hostname
		info.Uptime = hostInfo.Uptime
		info.Platform = hostInfo.Platform + " " + hostInfo.PlatformVersion
	}

	// Username
	if username := os.Getenv("USERNAME"); username != "" {
		info.Username = username
	} else if username := os.Getenv("USER"); username != "" {
		info.Username = username
	}

	// IP Address
	info.IPAddress = getLocalIP()

	msg := ClientMessage{
		Type:     "system_update",
		DeviceID: a.deviceID,
		Data:     info,
	}

	a.writeMux.Lock()
	defer a.writeMux.Unlock()
	return a.conn.WriteJSON(msg)
}

func (a *Agent) SendHeartbeat() error {
	msg := ClientMessage{
		Type:     "heartbeat",
		DeviceID: a.deviceID,
		Data: map[string]interface{}{
			"timestamp": time.Now().Unix(),
			"status":    "online",
		},
	}

	a.writeMux.Lock()
	defer a.writeMux.Unlock()
	return a.conn.WriteJSON(msg)
}

func (a *Agent) ListenForCommands() {
	for {
		var msg map[string]interface{}
		err := a.conn.ReadJSON(&msg)
		if err != nil {
			log.Printf("❌ Connection lost: %v", err)
			break
		}

		// Handle commands from server
		msgType, ok := msg["type"].(string)
		if !ok {
			continue
		}

		// If type is "command", extract the actual command from "command" field
		cmdType := msgType
		if msgType == "command" {
			if command, ok := msg["command"].(string); ok {
				cmdType = command
			}
		}

		log.Printf("📩 Received command: %s", cmdType)

		// Process command and send response
		response := a.HandleCommand(cmdType, msg["data"])
		if response != nil {
			// Map command types to response types expected by frontend
			responseType := cmdType + "_response"
			switch cmdType {
			case "file_operation":
				responseType = "file_response"
			case "service_operation":
				responseType = "service_response"
			case "software_operation":
				responseType = "software_response"
			case "shell_command":
				responseType = "shell_response"
			case "screen_capture":
				responseType = "screen_capture"
			}

			responseMsg := ClientMessage{
				Type:     responseType,
				DeviceID: a.deviceID,
				Data:     response,
			}
			a.writeMux.Lock()
			a.conn.WriteJSON(responseMsg)
			a.writeMux.Unlock()
		}
	}
}

func (a *Agent) HandleCommand(cmdType string, data interface{}) interface{} {
	log.Printf("🔧 Handling command: %s", cmdType)

	// Convert data to JSON for handlers
	dataJSON, err := json.Marshal(data)
	if err != nil {
		return map[string]interface{}{
			"success": false,
			"message": fmt.Sprintf("Failed to parse command data: %v", err),
		}
	}

	switch cmdType {
	case "update_label":
		// Handle label update command
		var labelData map[string]interface{}
		json.Unmarshal(dataJSON, &labelData)
		if label, ok := labelData["label"].(string); ok {
			err := a.updateLabel(label)
			if err != nil {
				return map[string]interface{}{
					"success": false,
					"message": fmt.Sprintf("Failed to update label: %v", err),
				}
			}
			return map[string]interface{}{
				"success": true,
				"message": "Label updated successfully",
				"label":   label,
			}
		}
		return map[string]interface{}{
			"success": false,
			"message": "Invalid label data",
		}

	case "update_group":
		// Handle group update command
		var groupData map[string]interface{}
		json.Unmarshal(dataJSON, &groupData)
		if groupName, ok := groupData["group_name"].(string); ok {
			err := a.updateGroupName(groupName)
			if err != nil {
				return map[string]interface{}{
					"success": false,
					"message": fmt.Sprintf("Failed to update group: %v", err),
				}
			}
			log.Printf("✅ Group updated successfully: %s", groupName)

			return map[string]interface{}{
				"success":    true,
				"message":    "Group updated successfully",
				"group_name": groupName,
			}
		}
		return map[string]interface{}{
			"success": false,
			"message": "Invalid group data",
		}

	case "file_operation":
		response, err := HandleFileOperationJSON(dataJSON)
		if err != nil {
			return map[string]interface{}{
				"success": false,
				"message": err.Error(),
			}
		}
		var result interface{}
		json.Unmarshal(response, &result)
		return result

	case "service_operation":
		response, err := HandleServiceOperationJSON(dataJSON)
		if err != nil {
			return map[string]interface{}{
				"success": false,
				"message": err.Error(),
			}
		}
		var result interface{}
		json.Unmarshal(response, &result)
		return result

	case "software_operation":
		response, err := HandleSoftwareOperationJSON(dataJSON)
		if err != nil {
			return map[string]interface{}{
				"success": false,
				"message": err.Error(),
			}
		}
		var result interface{}
		json.Unmarshal(response, &result)
		return result

	case "screen_capture":
		capture, err := CaptureScreen()
		if err != nil {
			return map[string]interface{}{
				"success": false,
				"message": err.Error(),
			}
		}
		return map[string]interface{}{
			"success": true,
			"image":   capture.Image,
			"width":   capture.Width,
			"height":  capture.Height,
		}

	case "shell_command":
		response := HandleShellCommand(dataJSON)
		return map[string]interface{}{
			"success": response.Success,
			"message": response.Message,
			"data":    response.Data,
		}

	case "mouse_control":
		var ctrl MouseControl
		if err := json.Unmarshal(dataJSON, &ctrl); err != nil {
			return map[string]interface{}{
				"success": false,
				"message": err.Error(),
			}
		}
		err := HandleMouseControl(ctrl)
		if err != nil {
			return map[string]interface{}{
				"success": false,
				"message": err.Error(),
			}
		}
		return map[string]interface{}{
			"success": true,
			"message": "Mouse control executed",
		}

	case "keyboard_control":
		var ctrl KeyboardControl
		if err := json.Unmarshal(dataJSON, &ctrl); err != nil {
			return map[string]interface{}{
				"success": false,
				"message": err.Error(),
			}
		}
		err := HandleKeyboardControl(ctrl)
		if err != nil {
			return map[string]interface{}{
				"success": false,
				"message": err.Error(),
			}
		}
		return map[string]interface{}{
			"success": true,
			"message": "Keyboard control executed",
		}

	case "window_control":
		var ctrl WindowControl
		if err := json.Unmarshal(dataJSON, &ctrl); err != nil {
			return map[string]interface{}{
				"success": false,
				"message": err.Error(),
			}
		}
		err := HandleWindowControl(ctrl)
		if err != nil {
			return map[string]interface{}{
				"success": false,
				"message": err.Error(),
			}
		}
		return map[string]interface{}{
			"success": true,
			"message": "Window control executed",
		}

	default:
		return map[string]interface{}{
			"success": false,
			"message": fmt.Sprintf("Unknown command: %s", cmdType),
		}
	}
}

func (a *Agent) Run() {
	// Register device
	if err := a.RegisterDevice(); err != nil {
		log.Printf("⚠️  Failed to register: %v", err)
	}

	// Start heartbeat ticker
	heartbeatTicker := time.NewTicker(10 * time.Second)
	defer heartbeatTicker.Stop()

	// Start system info ticker
	systemInfoTicker := time.NewTicker(2 * time.Second)
	defer systemInfoTicker.Stop()

	// Listen for commands in a goroutine
	go a.ListenForCommands()

	log.Println("🚀 Agent running...")

	// Main loop
	for {
		select {
		case <-heartbeatTicker.C:
			if err := a.SendHeartbeat(); err != nil {
				log.Printf("❌ Heartbeat failed: %v", err)
			}

		case <-systemInfoTicker.C:
			if err := a.SendSystemInfo(); err != nil {
				log.Printf("❌ System info failed: %v", err)
			}
		}
	}
}

func getLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "0.0.0.0"
	}

	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String()
			}
		}
	}

	return "0.0.0.0"
}

func getWallpaperPath() string {
	// For now, return a default Windows 11 wallpaper URL
	// In production, you could read from registry or upload actual wallpaper
	return "https://images.unsplash.com/photo-1614624532983-4ce03382d63d?w=800&q=80"
}

func main() {
	log.Println("🖥️  Remote Admin Agent Starting...")
	log.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

	agent := NewAgent()

	// Connect to central server
	if err := agent.Connect(); err != nil {
		log.Fatalf("❌ Failed to connect: %v", err)
	}
	defer agent.conn.Close()

	// Run agent
	agent.Run()
}
