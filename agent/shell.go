package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
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
	var tempFile string

	// For long commands (>8000 chars) or multi-line commands, use a temp script file
	useTempFile := len(req.Command) > 8000 || strings.Contains(req.Command, "\n") || strings.Contains(req.Command, "\r")

	switch session.Type {
	case "cmd":
		if useTempFile {
			// Write command to temp batch file with proper encoding
			tempFile = filepath.Join(os.TempDir(), fmt.Sprintf("dws_cmd_%d.bat", time.Now().UnixNano()))
			// Add @echo off and CHCP 65001 for UTF-8 support
			batchContent := "@echo off\r\nchcp 65001 >nul 2>&1\r\n" + strings.ReplaceAll(req.Command, "\n", "\r\n")
			err := os.WriteFile(tempFile, []byte(batchContent), 0644)
			if err != nil {
				return Response{Success: false, Message: "Failed to create temp script: " + err.Error()}
			}
			cmd = exec.Command("cmd.exe", "/c", tempFile)
		} else {
			// For single-line commands, use /c with proper quoting
			cmd = exec.Command("cmd.exe", "/c", req.Command)
		}
	case "powershell":
		if useTempFile {
			// Write command to temp PowerShell script with UTF-8 BOM
			tempFile = filepath.Join(os.TempDir(), fmt.Sprintf("dws_ps_%d.ps1", time.Now().UnixNano()))
			// Add UTF-8 BOM for proper encoding
			scriptContent := []byte{0xEF, 0xBB, 0xBF} // UTF-8 BOM
			scriptContent = append(scriptContent, []byte(req.Command)...)
			err := os.WriteFile(tempFile, scriptContent, 0644)
			if err != nil {
				return Response{Success: false, Message: "Failed to create temp script: " + err.Error()}
			}
			cmd = exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", tempFile)
		} else {
			cmd = exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", req.Command)
		}
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

	// Clean up temp file after execution
	if tempFile != "" {
		defer os.Remove(tempFile)
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
