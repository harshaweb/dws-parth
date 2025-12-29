package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/rs/cors"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all connections (consider restricting in production)
	},
}

type Message struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}
	defer conn.Close()

	log.Println("Client connected:", r.RemoteAddr)

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			log.Println("Read error:", err)
			break
		}

		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Println("JSON unmarshal error:", err)
			continue
		}

		response := handleMessage(msg)
		if err := conn.WriteJSON(response); err != nil {
			log.Println("Write error:", err)
			break
		}
	}

	log.Println("Client disconnected:", r.RemoteAddr)
}

func handleMessage(msg Message) interface{} {
	switch msg.Type {
	case "system_info":
		info, err := GetSystemInfo()
		if err != nil {
			return map[string]interface{}{"error": err.Error()}
		}
		return map[string]interface{}{"type": "system_info", "data": info}

	case "file_operation":
		response, err := HandleFileOperationJSON(msg.Data)
		if err != nil {
			return map[string]interface{}{"error": err.Error()}
		}
		var result interface{}
		json.Unmarshal(response, &result)
		return map[string]interface{}{"type": "file_response", "data": result}

	case "service_operation":
		response, err := HandleServiceOperationJSON(msg.Data)
		if err != nil {
			return map[string]interface{}{"error": err.Error()}
		}
		var result interface{}
		json.Unmarshal(response, &result)
		return map[string]interface{}{"type": "service_response", "data": result}

	case "software_operation":
		response, err := HandleSoftwareOperationJSON(msg.Data)
		if err != nil {
			return map[string]interface{}{"error": err.Error()}
		}
		var result interface{}
		json.Unmarshal(response, &result)
		return map[string]interface{}{"type": "software_response", "data": result}

	case "screen_capture":
		capture, err := CaptureScreen()
		if err != nil {
			return map[string]interface{}{"error": err.Error()}
		}
		return map[string]interface{}{"type": "screen_capture", "data": capture}

	case "mouse_control":
		var ctrl MouseControl
		if err := json.Unmarshal(msg.Data, &ctrl); err != nil {
			return map[string]interface{}{"error": err.Error()}
		}
		if err := HandleMouseControl(ctrl); err != nil {
			return map[string]interface{}{"error": err.Error()}
		}
		return map[string]interface{}{"type": "control_response", "data": map[string]interface{}{"success": true, "message": "Mouse control executed"}}

	case "keyboard_control":
		var ctrl KeyboardControl
		if err := json.Unmarshal(msg.Data, &ctrl); err != nil {
			return map[string]interface{}{"error": err.Error()}
		}
		if err := HandleKeyboardControl(ctrl); err != nil {
			return map[string]interface{}{"error": err.Error()}
		}
		return map[string]interface{}{"type": "control_response", "data": map[string]interface{}{"success": true, "message": "Keyboard control executed"}}

	case "window_control":
		var ctrl WindowControl
		if err := json.Unmarshal(msg.Data, &ctrl); err != nil {
			return map[string]interface{}{"error": err.Error()}
		}
		if err := HandleWindowControl(ctrl); err != nil {
			return map[string]interface{}{"error": err.Error()}
		}
		return map[string]interface{}{"type": "control_response", "data": map[string]interface{}{"success": true, "message": "Window control executed", "action": ctrl.Action}}

	case "shell_command":
		response := HandleShellCommand(msg.Data)
		return map[string]interface{}{"type": "shell_response", "data": response}

	case "switch_shell":
		response := HandleSwitchShell(msg.Data)
		return map[string]interface{}{"type": "shell_response", "data": response}

	default:
		return map[string]interface{}{"error": "Unknown message type"}
	}
}

func handleSystemStream(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}
	defer conn.Close()

	log.Println("System monitor stream started for:", r.RemoteAddr)

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			info, err := GetSystemInfo()
			if err != nil {
				log.Println("Error getting system info:", err)
				continue
			}

			if err := conn.WriteJSON(map[string]interface{}{
				"type": "system_info",
				"data": info,
			}); err != nil {
				log.Println("Write error:", err)
				return
			}
		}
	}
}

func handleScreenStream(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}
	defer conn.Close()

	log.Println("Screen stream started for:", r.RemoteAddr)

	ticker := time.NewTicker(100 * time.Millisecond) // ~10 FPS
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			capture, err := CaptureScreen()
			if err != nil {
				log.Println("Error capturing screen:", err)
				continue
			}

			if err := conn.WriteJSON(map[string]interface{}{
				"type": "screen_capture",
				"data": capture,
			}); err != nil {
				log.Println("Write error:", err)
				return
			}
		}

		// Check for incoming control messages
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			return
		}

		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		// Handle mouse/keyboard events here
		// This would require implementing the actual control functions
	}
}

func main() {
	// Initialize database (optional - will continue if fails)
	var currentDevice *Device
	if err := InitDatabase(); err != nil {
		log.Printf("⚠️  MongoDB connection failed: %v", err)
		log.Println("⚠️  Running in LOCAL MODE (no database)")
		log.Println("    Device registration and multi-device features disabled")
	} else {
		// Register this device on startup
		deviceName := os.Getenv("DEVICE_NAME")
		if deviceName == "" {
			hostname, _ := os.Hostname()
			deviceName = hostname
		}

		var err error
		currentDevice, err = RegisterDevice(deviceName)
		if err != nil {
			log.Printf("Warning: Failed to register device: %v", err)
		} else {
			log.Printf("Device ID: %s", currentDevice.ID.Hex())
		}
	}

	// Setup router with mux
	router := mux.NewRouter()

	// WebSocket endpoints
	router.HandleFunc("/ws", handleWebSocket)
	router.HandleFunc("/ws/system", handleSystemStream)
	router.HandleFunc("/ws/screen", handleScreenStream)

	// REST API endpoints
	SetupRESTAPI(router)

	// Status endpoint
	router.HandleFunc("/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":    "running",
			"time":      time.Now().Format(time.RFC3339),
			"device_id": currentDevice.ID.Hex(),
		})
	})

	// Setup CORS
	corsHandler := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})

	handler := corsHandler.Handler(router)

	// Graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	port := ":8080"
	server := &http.Server{
		Addr:    port,
		Handler: handler,
	}

	// Start server in goroutine
	go func() {
		fmt.Printf("\n🚀 Server starting on port %s...\n", port)
		fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Println("📡 WebSocket endpoints:")
		fmt.Println("   ws://localhost:8080/ws")
		fmt.Println("   ws://localhost:8080/ws/system")
		fmt.Println("   ws://localhost:8080/ws/screen")
		fmt.Println("")
		fmt.Println("🌐 REST API endpoints:")
		fmt.Println("   http://localhost:8080/api/devices")
		fmt.Println("   http://localhost:8080/api/system")
		fmt.Println("   http://localhost:8080/api/files")
		fmt.Println("   http://localhost:8080/api/services")
		fmt.Println("")
		fmt.Println("✅ Status: http://localhost:8080/status")
		fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Printf("🗄️  Database: Connected to MongoDB\n")
		if currentDevice != nil {
			fmt.Printf("🖥️  Device: %s (%s)\n", currentDevice.Name, currentDevice.ID.Hex())
		}
		fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Println("Press Ctrl+C to shutdown...")
		fmt.Println("")

		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Wait for shutdown signal
	<-sigChan
	fmt.Println("\n🛑 Shutting down server...")

	// Update device status to offline
	if currentDevice != nil {
		UpdateDeviceStatus(currentDevice.ID, "offline", "disconnected")
	}

	// Close database connection
	CloseDatabase()

	log.Println("✅ Server stopped gracefully")
}
