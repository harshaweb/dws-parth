package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/rs/cors"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all connections
	},
}

// ClientConnection represents a connected agent
type ClientConnection struct {
	DeviceID     string
	Conn         *websocket.Conn
	LastSeen     time.Time
	SystemInfo   map[string]interface{}
	DeviceInfo   map[string]interface{}
	MessageQueue chan interface{}
}

// Hub manages all client connections
type Hub struct {
	clients       map[string]*ClientConnection // deviceID -> connection
	frontendConns map[*websocket.Conn]bool     // frontend connections
	mutex         sync.RWMutex
	broadcast     chan interface{} // broadcast to all frontends
}

var hub = &Hub{
	clients:       make(map[string]*ClientConnection),
	frontendConns: make(map[*websocket.Conn]bool),
	broadcast:     make(chan interface{}, 256),
}

type Message struct {
	Type     string          `json:"type"`
	DeviceID string          `json:"device_id"`
	Data     json.RawMessage `json:"data"`
}

// Handle agent connections (from Windows clients)
func handleAgentWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("❌ Agent WebSocket upgrade error:", err)
		return
	}
	defer conn.Close()

	log.Println("🔌 Agent connected:", r.RemoteAddr)

	var deviceID string

	for {
		var msg Message
		err := conn.ReadJSON(&msg)
		if err != nil {
			log.Printf("❌ Agent read error: %v", err)
			break
		}

		// Handle different message types from agent
		switch msg.Type {
		case "device_register":
			deviceID = msg.DeviceID
			hub.registerClient(deviceID, conn, msg.Data)
			log.Printf("📝 Device registered: %s", deviceID)

		case "system_update":
			if deviceID != "" {
				hub.updateSystemInfo(deviceID, msg.Data)
				// Broadcast to all frontends
				hub.broadcastToFrontends(map[string]interface{}{
					"type":      "system_update",
					"device_id": deviceID,
					"data":      msg.Data,
				})
			}

		case "heartbeat":
			if deviceID != "" {
				hub.updateLastSeen(deviceID)
			}

		case "update_label_response":
			// Label was updated on agent, update device info and broadcast
			if deviceID != "" {
				var responseData map[string]interface{}
				json.Unmarshal(msg.Data, &responseData)
				if label, ok := responseData["label"].(string); ok {
					hub.updateDeviceLabel(deviceID, label)
					// Broadcast updated device list
					hub.broadcastToFrontends(map[string]interface{}{
						"type": "device_list",
						"data": hub.getDeviceList(),
					})
				}
			}

		default:
			// Forward responses to frontend
			if deviceID != "" {
				log.Printf("📤 Forwarding response: type=%s from device=%s", msg.Type, deviceID)
				hub.broadcastToFrontends(map[string]interface{}{
					"type":      msg.Type,
					"device_id": deviceID,
					"data":      msg.Data,
				})
			}
		}
	}

	// Clean up on disconnect
	if deviceID != "" {
		hub.unregisterClient(deviceID)
		log.Printf("🔌 Device disconnected: %s", deviceID)
	}
}

// Handle frontend connections (from web dashboard)
func handleFrontendWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("❌ Frontend WebSocket upgrade error:", err)
		return
	}
	defer conn.Close()

	log.Println("🌐 Frontend connected:", r.RemoteAddr)

	// Register frontend connection
	hub.mutex.Lock()
	hub.frontendConns[conn] = true
	hub.mutex.Unlock()

	// Send current device list
	devices := hub.getDeviceList()
	conn.WriteJSON(map[string]interface{}{
		"type": "device_list",
		"data": devices,
	})

	// Listen for commands from frontend
	for {
		var msg Message
		err := conn.ReadJSON(&msg)
		if err != nil {
			log.Printf("❌ Frontend read error: %v", err)
			break
		}

		log.Printf("📨 Frontend command: type=%s, device_id=%s", msg.Type, msg.DeviceID)

		// Forward command to specific device
		if msg.DeviceID != "" {
			err := hub.sendToClient(msg.DeviceID, msg)
			if err != nil {
				log.Printf("⚠️  Failed to send to device %s: %v", msg.DeviceID, err)
				// Send error back to frontend
				conn.WriteJSON(map[string]interface{}{
					"type":      "error",
					"device_id": msg.DeviceID,
					"data": map[string]interface{}{
						"success": false,
						"message": fmt.Sprintf("Device not connected: %v", err),
					},
				})
			} else {
				log.Printf("✅ Command forwarded to device %s", msg.DeviceID)
			}
		}
	}

	// Clean up on disconnect
	hub.mutex.Lock()
	delete(hub.frontendConns, conn)
	hub.mutex.Unlock()

	log.Println("🌐 Frontend disconnected:", r.RemoteAddr)
}

// Hub methods
func (h *Hub) registerClient(deviceID string, conn *websocket.Conn, deviceInfo json.RawMessage) {
	var info map[string]interface{}
	json.Unmarshal(deviceInfo, &info)

	client := &ClientConnection{
		DeviceID:     deviceID,
		Conn:         conn,
		LastSeen:     time.Now(),
		DeviceInfo:   info,
		SystemInfo:   make(map[string]interface{}),
		MessageQueue: make(chan interface{}, 100),
	}

	h.mutex.Lock()
	h.clients[deviceID] = client
	h.mutex.Unlock()

	// Save device to database if connected
	if IsDatabaseConnected() {
		// Extract device info
		hostname := deviceID
		ipAddress := ""
		osVersion := ""
		windowsUsername := ""
		wallpaperURL := "/windows-11-gradient-purple.jpg"
		label := ""
		groupName := ""

		if h, ok := info["hostname"].(string); ok {
			hostname = h
		}
		if ip, ok := info["ip_address"].(string); ok {
			ipAddress = ip
		}
		if platform, ok := info["platform"].(string); ok {
			osVersion = platform
		}
		if username, ok := info["username"].(string); ok {
			windowsUsername = username
		}
		if wallpaper, ok := info["wallpaper_url"].(string); ok && wallpaper != "" {
			wallpaperURL = wallpaper
		}
		if lbl, ok := info["label"].(string); ok {
			label = lbl
		}
		if grp, ok := info["group_name"].(string); ok {
			groupName = grp
		}

		// Register or update device in database
		_, err := RegisterDeviceByHostname(hostname, deviceID, ipAddress, osVersion, windowsUsername, wallpaperURL, label, groupName)
		if err != nil {
			log.Printf("⚠️  Failed to save device to database: %v", err)
		} else {
			log.Printf("✅ Device saved to database: %s", deviceID)
		}
	}

	// Notify frontends (outside lock to avoid deadlock)
	h.broadcastToFrontends(map[string]interface{}{
		"type": "device_connected",
		"data": info,
	})
}

func (h *Hub) unregisterClient(deviceID string) {
	h.mutex.Lock()
	client, exists := h.clients[deviceID]
	if exists {
		close(client.MessageQueue)
		delete(h.clients, deviceID)
	}
	h.mutex.Unlock()

	// Update device status to offline in database
	if exists && IsDatabaseConnected() {
		err := UpdateDeviceStatusByHostname(deviceID, "offline", "disconnected")
		if err != nil {
			log.Printf("⚠️  Failed to update device status: %v", err)
		}
	}

	// Notify frontends (outside lock to avoid deadlock)
	if exists {
		h.broadcastToFrontends(map[string]interface{}{
			"type":      "device_disconnected",
			"device_id": deviceID,
		})
	}
}

func (h *Hub) updateSystemInfo(deviceID string, data json.RawMessage) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	if client, exists := h.clients[deviceID]; exists {
		var info map[string]interface{}
		json.Unmarshal(data, &info)
		client.SystemInfo = info
		client.LastSeen = time.Now()

		// Database update can be added here if needed
	}
}

func (h *Hub) updateLastSeen(deviceID string) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	if client, exists := h.clients[deviceID]; exists {
		client.LastSeen = time.Now()
	}
}

func (h *Hub) updateDeviceLabel(deviceID string, label string) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	if client, exists := h.clients[deviceID]; exists {
		if client.DeviceInfo == nil {
			client.DeviceInfo = make(map[string]interface{})
		}
		client.DeviceInfo["label"] = label
		log.Printf("📝 Updated label for device %s: %s", deviceID, label)
	}
}

func (h *Hub) sendToClient(deviceID string, msg Message) error {
	h.mutex.RLock()
	client, exists := h.clients[deviceID]
	h.mutex.RUnlock()

	if !exists {
		return fmt.Errorf("device not connected: %s", deviceID)
	}

	return client.Conn.WriteJSON(msg)
}

func (h *Hub) broadcastToFrontends(data interface{}) {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	for conn := range h.frontendConns {
		err := conn.WriteJSON(data)
		if err != nil {
			log.Printf("⚠️  Broadcast error: %v", err)
		}
	}
}

func (h *Hub) getDeviceList() []map[string]interface{} {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	// If database is connected, get all devices from DB and merge with live connections
	if IsDatabaseConnected() {
		dbDevices, err := GetAllDevices()
		if err != nil {
			log.Printf("⚠️  Failed to fetch devices from database: %v", err)
		} else {
			// Create map for quick device lookup
			devices := make([]map[string]interface{}, 0, len(dbDevices))
			for _, dbDevice := range dbDevices {
				// Check if device is currently connected
				client, isConnected := h.clients[dbDevice.Hostname]

				status := "offline"
				connectionStatus := "disconnected"
				lastSeen := dbDevice.LastSeen

				if isConnected {
					status = "online"
					connectionStatus = "connected"
					lastSeen = client.LastSeen

					// Update live data from connected client if available
					if client.DeviceInfo != nil {
						if ip, ok := client.DeviceInfo["ip_address"].(string); ok {
							dbDevice.IPAddress = ip
						}
						if lbl, ok := client.DeviceInfo["label"].(string); ok {
							dbDevice.Label = lbl
						}
					}
				}

				device := map[string]interface{}{
					"id":                dbDevice.Hostname, // Use hostname as ID for consistency
					"user_id":           dbDevice.UserID,
					"name":              dbDevice.Name,
					"hostname":          dbDevice.Hostname,
					"ip_address":        dbDevice.IPAddress,
					"os_version":        dbDevice.OSVersion,
					"status":            status,
					"connection_status": connectionStatus,
					"last_seen":         lastSeen.Format("2006-01-02T15:04:05Z"),
					"windows_username":  dbDevice.WindowsUsername,
					"wallpaper_url":     dbDevice.WallpaperURL,
					"label":             dbDevice.Label,
					"group_name":        dbDevice.GroupName,
					"created_at":        dbDevice.CreatedAt.Format("2006-01-02T15:04:05Z"),
					"updated_at":        dbDevice.UpdatedAt.Format("2006-01-02T15:04:05Z"),
				}
				devices = append(devices, device)
			}
			return devices
		}
	}

	// Fallback: If no database, return only connected devices
	devices := make([]map[string]interface{}, 0, len(h.clients))
	for deviceID, client := range h.clients {
		// Extract data from device_info
		hostname := deviceID
		ipAddress := ""
		osVersion := ""
		windowsUsername := ""
		wallpaperURL := "/windows-11-gradient-purple.jpg"
		label := ""
		groupName := ""

		if client.DeviceInfo != nil {
			if h, ok := client.DeviceInfo["hostname"].(string); ok {
				hostname = h
			}
			if ip, ok := client.DeviceInfo["ip_address"].(string); ok {
				ipAddress = ip
			}
			if platform, ok := client.DeviceInfo["platform"].(string); ok {
				osVersion = platform
			}
			if username, ok := client.DeviceInfo["username"].(string); ok {
				windowsUsername = username
			}
			if wallpaper, ok := client.DeviceInfo["wallpaper_url"].(string); ok && wallpaper != "" {
				wallpaperURL = wallpaper
			}
			if lbl, ok := client.DeviceInfo["label"].(string); ok {
				label = lbl
			}
			if grp, ok := client.DeviceInfo["group_name"].(string); ok {
				groupName = grp
			}
		}

		device := map[string]interface{}{
			"id":                deviceID,
			"user_id":           "system",
			"name":              hostname,
			"hostname":          hostname,
			"ip_address":        ipAddress,
			"os_version":        osVersion,
			"status":            "online",
			"connection_status": "connected",
			"last_seen":         client.LastSeen.Format("2006-01-02T15:04:05Z"),
			"windows_username":  windowsUsername,
			"wallpaper_url":     wallpaperURL,
			"label":             label,
			"group_name":        groupName,
			"created_at":        client.LastSeen.Format("2006-01-02T15:04:05Z"),
			"updated_at":        client.LastSeen.Format("2006-01-02T15:04:05Z"),
		}
		devices = append(devices, device)
	}

	return devices
}

// REST API handlers
func handleGetDevices(w http.ResponseWriter, r *http.Request) {
	devices := hub.getDeviceList()

	// Return connected devices wrapped in response object
	w.Header().Set("Content-Type", "application/json")
	response := map[string]interface{}{
		"success": true,
		"data":    devices,
	}
	json.NewEncoder(w).Encode(response)
}

func handleGetDevice(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	deviceID := vars["id"]

	hub.mutex.RLock()
	client, exists := hub.clients[deviceID]
	hub.mutex.RUnlock()

	if !exists {
		http.Error(w, "Device not found", http.StatusNotFound)
		return
	}

	device := map[string]interface{}{
		"device_id":   deviceID,
		"device_info": client.DeviceInfo,
		"system_info": client.SystemInfo,
		"last_seen":   client.LastSeen,
		"status":      "online",
	}

	w.Header().Set("Content-Type", "application/json")
	response := map[string]interface{}{
		"success": true,
		"data":    device,
	}
	json.NewEncoder(w).Encode(response)
}

// handleUpdateDeviceGroup updates the group for a device

func handleUpdateDeviceGroup(w http.ResponseWriter, r *http.Request) {
	// CORS headers (set for all responses, including errors)
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")

	// Handle preflight
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	vars := mux.Vars(r)
	deviceID := vars["id"]

	var req struct {
		GroupName string `json:"group_name"`
	}

	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error": "Invalid request body"}`))
		return
	}

	// Update in database first
	if devicesCollection != nil {
		if err := UpdateDeviceGroupByHostname(deviceID, req.GroupName); err != nil {
			log.Printf("⚠️ Failed to update device group in database: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": false,
				"error":   "Failed to update device group in database",
			})
			return
		}
		log.Printf("✅ Updated group in database for device %s: %s", deviceID, req.GroupName)
	}

	// Update in hub's in-memory store and send to agent
	hub.mutex.Lock()
	if client, exists := hub.clients[deviceID]; exists {
		if client.DeviceInfo == nil {
			client.DeviceInfo = make(map[string]interface{})
		}
		client.DeviceInfo["group_name"] = req.GroupName
		log.Printf("📁 Updated group in memory for device %s: %s", deviceID, req.GroupName)

		// Send update_group command to agent to store locally
		cmd := map[string]interface{}{
			"type":       "command",
			"command":    "update_group",
			"request_id": fmt.Sprintf("group_%d", time.Now().UnixNano()),
			"data": map[string]interface{}{
				"group_name": req.GroupName,
			},
		}
		client.Conn.WriteJSON(cmd)
		log.Printf("📤 Sent update_group command to agent %s", deviceID)
	}
	hub.mutex.Unlock()

	// Broadcast updated device list to all frontends
	hub.broadcastToFrontends(map[string]interface{}{
		"type": "device_list",
		"data": hub.getDeviceList(),
	})

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Device group updated successfully",
	})
}

func main() {
	log.Println("🚀 Remote Admin Server (Central Hub) Starting...")
	log.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

	// Initialize database (optional)
	if err := InitDatabase(); err != nil {
		log.Printf("⚠️  Database connection failed: %v", err)
		log.Println("📝 Running in LOCAL MODE (no database persistence)")
	}

	// Setup router
	router := mux.NewRouter()

	// Device endpoints - use hub's live device list
	router.HandleFunc("/api/devices", handleGetDevices).Methods("GET", "OPTIONS")
	router.HandleFunc("/api/devices/{id}", handleGetDevice).Methods("GET", "OPTIONS")
	router.HandleFunc("/api/devices/{id}/group", handleUpdateDeviceGroup).Methods("PATCH", "OPTIONS")

	// Group management endpoints (from api.go)
	router.HandleFunc("/api/groups", HandleAPIGetGroups).Methods("GET", "OPTIONS")
	router.HandleFunc("/api/groups", HandleAPICreateGroup).Methods("POST", "OPTIONS")
	router.HandleFunc("/api/groups/{id}", HandleAPIGetGroup).Methods("GET", "OPTIONS")
	router.HandleFunc("/api/groups/{id}", HandleAPIUpdateGroup).Methods("PUT", "OPTIONS")
	router.HandleFunc("/api/groups/{id}", HandleAPIDeleteGroup).Methods("DELETE", "OPTIONS")
	router.HandleFunc("/api/groups/{name}/devices", HandleAPIGetGroupDevices).Methods("GET", "OPTIONS")

	// WebSocket endpoints
	router.HandleFunc("/ws/client", handleAgentWebSocket)      // For Windows agents
	router.HandleFunc("/ws/frontend", handleFrontendWebSocket) // For web dashboard

	// Enable CORS
	handler := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization", "*"},
		AllowCredentials: true,
		MaxAge:           3600,
	}).Handler(router)

	// Start server
	server := &http.Server{
		Addr:    ":8080",
		Handler: handler,
	}

	// Graceful shutdown
	go func() {
		log.Println("✅ Server listening on :8080")
		log.Println("   - Agent WS:    ws://localhost:8080/ws/client")
		log.Println("   - Frontend WS: ws://localhost:8080/ws/frontend")
		log.Println("   - REST API:    http://localhost:8080/api")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("❌ Server error: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("🛑 Shutting down server...")
	server.Close()
}
