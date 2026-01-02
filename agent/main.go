package main

import (
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"golang.org/x/sys/windows/svc"
)

// Server URL - can be overridden at build time using:
// go build -ldflags="-X main.SERVER_URL=wss://dws-parth.daucu.com/ws/client"
var SERVER_URL = "wss://dws-parth.daucu.com/ws/client"

// Production mode - set to "true" at build time to disable console logging
// go build -ldflags="-X main.PRODUCTION=true -H windowsgui"
var PRODUCTION = "false"

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

// ConnectWithRetry keeps trying to connect to the server until successful
func (a *Agent) ConnectWithRetry() {
	retryInterval := 5 * time.Second
	maxRetryInterval := 60 * time.Second

	for {
		err := a.Connect()
		if err == nil {
			return
		}

		log.Printf("🔄 Connection failed, retrying in %v...", retryInterval)
		time.Sleep(retryInterval)

		// Increase retry interval (exponential backoff) up to max
		retryInterval = retryInterval * 2
		if retryInterval > maxRetryInterval {
			retryInterval = maxRetryInterval
		}
	}
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
			log.Printf("🔄 Connection lost, reconnecting...")
			return // Return to trigger reconnection in Run()
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
			case "file_download":
				responseType = "file_download_response"
			case "file_upload":
				responseType = "file_upload_response"
			case "file_read":
				responseType = "file_read_response"
			case "file_write":
				responseType = "file_write_response"
			case "service_operation":
				responseType = "service_response"
			case "software_operation":
				responseType = "software_response"
			case "task_manager":
				responseType = "task_manager_response"
			case "shell_command":
				responseType = "shell_response"
			case "switch_shell":
				responseType = "switch_shell_response"
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

	case "file_download":
		// Handle file download request
		var downloadData map[string]interface{}
		json.Unmarshal(dataJSON, &downloadData)
		path, _ := downloadData["path"].(string)
		filename, _ := downloadData["filename"].(string)

		op := FileOperation{
			Action:   "download",
			Path:     path,
			Filename: filename,
		}
		response := HandleFileOperation(op)
		return response

	case "file_upload":
		// Handle file upload request
		var uploadData map[string]interface{}
		json.Unmarshal(dataJSON, &uploadData)
		path, _ := uploadData["path"].(string)
		filename, _ := uploadData["filename"].(string)
		content, _ := uploadData["content"].(string)

		op := FileOperation{
			Action:   "upload",
			Path:     path,
			Filename: filename,
			Content:  content,
		}
		response := HandleFileOperation(op)
		return response

	case "file_read":
		// Handle file read request (for viewing/editing)
		var readData map[string]interface{}
		json.Unmarshal(dataJSON, &readData)
		path, _ := readData["path"].(string)

		content, err := os.ReadFile(path)
		if err != nil {
			return map[string]interface{}{
				"success": false,
				"message": fmt.Sprintf("Failed to read file: %v", err),
			}
		}

		return map[string]interface{}{
			"success":  true,
			"data":     string(content),
			"path":     filepath.Dir(path),
			"filename": filepath.Base(path),
		}

	case "file_write":
		// Handle file write request (for saving edited files)
		var writeData map[string]interface{}
		json.Unmarshal(dataJSON, &writeData)
		path, _ := writeData["path"].(string)
		content, _ := writeData["content"].(string)

		err := os.WriteFile(path, []byte(content), 0644)
		if err != nil {
			return map[string]interface{}{
				"success": false,
				"message": fmt.Sprintf("Failed to write file: %v", err),
			}
		}

		return map[string]interface{}{
			"success":  true,
			"message":  "File saved successfully",
			"path":     filepath.Dir(path),
			"filename": filepath.Base(path),
		}

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

	case "task_manager":
		response := HandleTaskManagerAction(dataJSON)
		return map[string]interface{}{
			"success":   response.Success,
			"message":   response.Message,
			"processes": response.Processes,
		}

	case "screen_capture":
		// Parse screen capture options
		var captureData map[string]interface{}
		json.Unmarshal(dataJSON, &captureData)

		options := ScreenCaptureOptions{
			Quality:    60,   // Default quality
			ShowCursor: true, // Default to showing cursor
		}

		if q, ok := captureData["quality"].(float64); ok {
			options.Quality = int(q)
		}
		if sc, ok := captureData["show_cursor"].(bool); ok {
			options.ShowCursor = sc
		}

		capture, err := CaptureScreenWithOptions(options)
		if err != nil {
			return map[string]interface{}{
				"success": false,
				"message": err.Error(),
			}
		}
		return map[string]interface{}{
			"success":  true,
			"image":    capture.Image,
			"width":    capture.Width,
			"height":   capture.Height,
			"cursor_x": capture.CursorX,
			"cursor_y": capture.CursorY,
		}

	case "shell_command":
		response := HandleShellCommand(dataJSON)
		return map[string]interface{}{
			"success": response.Success,
			"message": response.Message,
			"data":    response.Data,
		}

	case "switch_shell":
		response := HandleSwitchShell(dataJSON)
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

	case "system_restart":
		// Execute system restart with force flag
		log.Println("⚠️ System restart requested")
		var restartData map[string]interface{}
		json.Unmarshal(dataJSON, &restartData)
		force := false
		if f, ok := restartData["force"].(bool); ok {
			force = f
		}

		go func() {
			time.Sleep(1 * time.Second) // Give time to send response
			var cmd *exec.Cmd
			if runtime.GOOS == "windows" {
				if force {
					cmd = exec.Command("shutdown", "/r", "/f", "/t", "0")
				} else {
					cmd = exec.Command("shutdown", "/r", "/t", "0")
				}
			} else {
				cmd = exec.Command("sudo", "reboot")
			}
			cmd.Run()
		}()

		return map[string]interface{}{
			"success": true,
			"message": "System restart initiated",
		}

	case "system_shutdown":
		// Execute system shutdown with force flag
		log.Println("⚠️ System shutdown requested")
		var shutdownData map[string]interface{}
		json.Unmarshal(dataJSON, &shutdownData)
		force := false
		if f, ok := shutdownData["force"].(bool); ok {
			force = f
		}

		go func() {
			time.Sleep(1 * time.Second) // Give time to send response
			var cmd *exec.Cmd
			if runtime.GOOS == "windows" {
				if force {
					cmd = exec.Command("shutdown", "/s", "/f", "/t", "0")
				} else {
					cmd = exec.Command("shutdown", "/s", "/t", "0")
				}
			} else {
				cmd = exec.Command("sudo", "shutdown", "-h", "now")
			}
			cmd.Run()
		}()

		return map[string]interface{}{
			"success": true,
			"message": "System shutdown initiated",
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

	// Channel to signal when ListenForCommands exits (connection lost)
	disconnected := make(chan struct{})

	// Listen for commands in a goroutine
	go func() {
		a.ListenForCommands()
		close(disconnected)
	}()

	log.Println("🚀 Agent running...")

	// Main loop
	for {
		select {
		case <-disconnected:
			// Connection lost, stop tickers and return to trigger reconnection
			return

		case <-heartbeatTicker.C:
			if err := a.SendHeartbeat(); err != nil {
				log.Printf("🔄 Heartbeat failed, connection may be lost")
			}

		case <-systemInfoTicker.C:
			if err := a.SendSystemInfo(); err != nil {
				log.Printf("🔄 System info failed, connection may be lost")
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

// Windows Service implementation
type agentService struct {
	agent *Agent
}

func (s *agentService) Execute(args []string, r <-chan svc.ChangeRequest, changes chan<- svc.Status) (ssec bool, errno uint32) {
	const cmdsAccepted = svc.AcceptStop | svc.AcceptShutdown
	changes <- svc.Status{State: svc.StartPending}

	// Channel to signal shutdown
	stopChan := make(chan struct{})

	// Start agent in a goroutine
	go func() {
		log.Println("🖥️  Remote Admin Agent Starting...")
		log.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

		s.agent = NewAgent()

		// Main connection loop - keeps reconnecting forever
		for {
			select {
			case <-stopChan:
				return
			default:
			}

			// Connect to central server with retry
			s.agent.ConnectWithRetry()

			// Run agent (will return if connection is lost)
			s.agent.Run()

			// Close old connection before reconnecting
			if s.agent.conn != nil {
				s.agent.conn.Close()
			}

			log.Println("🔄 Reconnecting to server...")
			time.Sleep(2 * time.Second)
		}
	}()

	changes <- svc.Status{State: svc.Running, Accepts: cmdsAccepted}

	// Wait for service stop/shutdown request
	for {
		select {
		case c := <-r:
			switch c.Cmd {
			case svc.Interrogate:
				changes <- c.CurrentStatus
			case svc.Stop, svc.Shutdown:
				changes <- svc.Status{State: svc.StopPending}
				close(stopChan)
				if s.agent != nil && s.agent.conn != nil {
					s.agent.conn.Close()
				}
				return false, 0
			}
		}
	}
}

func runService() error {
	return svc.Run("RemoteAdminAgent", &agentService{})
}

func main() {
	// Check if running as Windows service
	isService, err := svc.IsWindowsService()
	if err != nil {
		log.Fatalf("Failed to determine if running as service: %v", err)
	}

	if isService {
		// Running as Windows service - no console output visible
		// Setup log file
		logDir := filepath.Join(os.Getenv("ProgramData"), "Remote Admin Agent")
		os.MkdirAll(logDir, 0755)
		logFile, err := os.OpenFile(filepath.Join(logDir, "agent.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
		if err == nil {
			log.SetOutput(logFile)
			defer logFile.Close()
		}

		err = runService()
		if err != nil {
			log.Fatalf("Service failed: %v", err)
		}
	} else {
		// Running as console application
		// In production mode, disable all logging (silent background mode)
		if PRODUCTION == "true" {
			log.SetOutput(io.Discard)
		} else {
			log.Println("🖥️  Remote Admin Agent Starting...")
			log.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		}

		agent := NewAgent()

		// Main connection loop - keeps reconnecting forever
		for {
			// Connect to central server with retry
			agent.ConnectWithRetry()

			// Run agent (will return if connection is lost)
			agent.Run()

			// Close old connection before reconnecting
			if agent.conn != nil {
				agent.conn.Close()
			}

			if PRODUCTION != "true" {
				log.Println("🔄 Reconnecting to server...")
			}
			time.Sleep(2 * time.Second)
		}
	}
}
