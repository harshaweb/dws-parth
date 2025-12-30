package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"syscall"
)

type Response struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

type ShellSession struct {
	Type       string `json:"type"` // "powershell" or "cmd"
	WorkingDir string `json:"working_dir"`
	mu         sync.Mutex
}

var shellSessions = make(map[string]*ShellSession)
var sessionMutex sync.RWMutex

func InitShellSession(sessionID, shellType string) {
	sessionMutex.Lock()
	defer sessionMutex.Unlock()

	shellSessions[sessionID] = &ShellSession{
		Type:       shellType,
		WorkingDir: "C:\\",
	}
}

func GetShellSession(sessionID string) *ShellSession {
	sessionMutex.RLock()
	defer sessionMutex.RUnlock()
	return shellSessions[sessionID]
}

func HandleShellCommand(data json.RawMessage) Response {
	var req struct {
		SessionID string `json:"session_id"`
		ShellType string `json:"shell_type"` // "powershell" or "cmd"
		Command   string `json:"command"`
	}

	if err := json.Unmarshal(data, &req); err != nil {
		return Response{Success: false, Message: "Invalid shell command request"}
	}

	// Initialize session if doesn't exist
	session := GetShellSession(req.SessionID)
	if session == nil {
		InitShellSession(req.SessionID, req.ShellType)
		session = GetShellSession(req.SessionID)
	}

	// Update shell type if changed
	if req.ShellType != "" && req.ShellType != session.Type {
		session.mu.Lock()
		session.Type = req.ShellType
		session.mu.Unlock()
	}

	session.mu.Lock()
	defer session.mu.Unlock()

	// Execute command
	var cmd *exec.Cmd
	var output bytes.Buffer
	var stderr bytes.Buffer

	switch session.Type {
	case "cmd":
		cmd = exec.Command("cmd.exe", "/c", req.Command)
	case "powershell":
		cmd = exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", req.Command)
	default:
		// Default to PowerShell on Windows
		if runtime.GOOS == "windows" {
			cmd = exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", req.Command)
			session.Type = "powershell"
		} else {
			cmd = exec.Command("sh", "-c", req.Command)
			session.Type = "sh"
		}
	}

	// Hide the console window on Windows
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000, // CREATE_NO_WINDOW
		}
	}

	cmd.Dir = session.WorkingDir
	cmd.Stdout = &output
	cmd.Stderr = &stderr

	err := cmd.Run()

	result := output.String()
	if stderr.Len() > 0 {
		result += "\n" + stderr.String()
	}

	// Update working directory if cd command was executed
	if strings.HasPrefix(strings.TrimSpace(req.Command), "cd ") {
		newDir := strings.TrimSpace(strings.TrimPrefix(req.Command, "cd "))
		newDir = strings.Trim(newDir, "\"'")
		if newDir != "" && err == nil {
			// Verify the directory exists
			testCmd := exec.Command("cmd.exe", "/c", "cd /d "+newDir+" && cd")
			if testOutput, testErr := testCmd.Output(); testErr == nil {
				session.WorkingDir = strings.TrimSpace(string(testOutput))
			}
		}
	}

	exitCode := 0
	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			exitCode = exitError.ExitCode()
		} else {
			result += "\nError: " + err.Error()
			exitCode = 1
		}
	}

	log.Printf("Shell command executed: %s [Type: %s, Exit: %d]", req.Command, session.Type, exitCode)

	return Response{
		Success: true,
		Message: "Command executed",
		Data: map[string]interface{}{
			"output":      result,
			"exit_code":   exitCode,
			"shell_type":  session.Type,
			"working_dir": session.WorkingDir,
		},
	}
}

func HandleSwitchShell(data json.RawMessage) Response {
	var req struct {
		SessionID string `json:"session_id"`
		ShellType string `json:"shell_type"` // "powershell" or "cmd"
	}

	if err := json.Unmarshal(data, &req); err != nil {
		return Response{Success: false, Message: "Invalid request"}
	}

	session := GetShellSession(req.SessionID)
	if session == nil {
		InitShellSession(req.SessionID, req.ShellType)
		session = GetShellSession(req.SessionID)
	}

	session.mu.Lock()
	oldType := session.Type
	session.Type = req.ShellType
	session.mu.Unlock()

	log.Printf("Switched shell from %s to %s", oldType, req.ShellType)

	return Response{
		Success: true,
		Message: fmt.Sprintf("Switched to %s", req.ShellType),
		Data: map[string]interface{}{
			"shell_type":  session.Type,
			"working_dir": session.WorkingDir,
		},
	}
}
