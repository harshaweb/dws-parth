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

	// Get user's home directory as default
	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = "C:\\"
	}

	shellSessions[sessionID] = &ShellSession{
		Type:       shellType,
		WorkingDir: homeDir,
	}
}

func GetShellSession(sessionID string) *ShellSession {
	sessionMutex.RLock()
	defer sessionMutex.RUnlock()
	return shellSessions[sessionID]
}

// isCdCommand checks if the command is a directory change command
func isCdCommand(cmd string) bool {
	cmdLower := strings.ToLower(strings.TrimSpace(cmd))

	// Handle various cd command patterns
	if strings.HasPrefix(cmdLower, "cd ") || cmdLower == "cd" {
		return true
	}
	if strings.HasPrefix(cmdLower, "cd/") || strings.HasPrefix(cmdLower, "cd\\") {
		return true
	}
	if strings.HasPrefix(cmdLower, "chdir ") || cmdLower == "chdir" {
		return true
	}
	// PowerShell aliases
	if strings.HasPrefix(cmdLower, "set-location ") || cmdLower == "set-location" {
		return true
	}
	if strings.HasPrefix(cmdLower, "sl ") || cmdLower == "sl" {
		return true
	}
	if strings.HasPrefix(cmdLower, "pushd ") {
		return true
	}
	if cmdLower == "popd" {
		return true
	}

	return false
}

// extractTargetDir extracts the target directory from a cd command
func extractTargetDir(cmd string) string {
	cmdLower := strings.ToLower(strings.TrimSpace(cmd))
	cmdTrim := strings.TrimSpace(cmd)

	var targetDir string

	// Handle various patterns
	if strings.HasPrefix(cmdLower, "cd /d ") {
		targetDir = strings.TrimSpace(cmdTrim[6:])
	} else if strings.HasPrefix(cmdLower, "cd ") {
		targetDir = strings.TrimSpace(cmdTrim[3:])
	} else if strings.HasPrefix(cmdLower, "chdir ") {
		targetDir = strings.TrimSpace(cmdTrim[6:])
	} else if strings.HasPrefix(cmdLower, "set-location ") {
		targetDir = strings.TrimSpace(cmdTrim[13:])
	} else if strings.HasPrefix(cmdLower, "sl ") {
		targetDir = strings.TrimSpace(cmdTrim[3:])
	} else if strings.HasPrefix(cmdLower, "pushd ") {
		targetDir = strings.TrimSpace(cmdTrim[6:])
	}

	// Remove surrounding quotes
	targetDir = strings.Trim(targetDir, "\"'")

	// Handle PowerShell -Path parameter
	if strings.Contains(strings.ToLower(targetDir), "-path ") {
		idx := strings.Index(strings.ToLower(targetDir), "-path ")
		targetDir = strings.TrimSpace(targetDir[idx+6:])
		targetDir = strings.Trim(targetDir, "\"'")
	}

	return targetDir
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

	// Check if this is a cd command that we need to handle specially
	cmdTrimmed := strings.TrimSpace(req.Command)
	isChangeDir := isCdCommand(cmdTrimmed)

	// Execute command
	var cmd *exec.Cmd
	var output bytes.Buffer
	var stderr bytes.Buffer
	var tempFile string

	// For long commands (>8000 chars) or multi-line commands, use a temp script file
	useTempFile := len(req.Command) > 8000 || strings.Contains(req.Command, "\n") || strings.Contains(req.Command, "\r")

	// Build the actual command to execute
	// For cd commands, we need to execute the cd AND then get the new working directory
	var actualCommand string

	switch session.Type {
	case "cmd":
		if isChangeDir {
			// For CMD: execute cd and get new directory
			targetDir := extractTargetDir(cmdTrimmed)
			if targetDir == "" {
				// Just "cd" - show current directory
				actualCommand = "cd"
			} else if targetDir == ".." {
				actualCommand = "cd /d .. && cd"
			} else if targetDir == "\\" || targetDir == "/" {
				actualCommand = "cd /d \\ && cd"
			} else if len(targetDir) >= 2 && targetDir[1] == ':' {
				// Absolute path with drive letter
				actualCommand = fmt.Sprintf("cd /d \"%s\" && cd", targetDir)
			} else {
				// Relative path
				actualCommand = fmt.Sprintf("cd /d \"%s\" && cd", targetDir)
			}
		} else {
			actualCommand = req.Command
		}

		if useTempFile {
			tempFile = filepath.Join(os.TempDir(), fmt.Sprintf("dws_cmd_%d.bat", time.Now().UnixNano()))
			batchContent := "@echo off\r\nchcp 65001 >nul 2>&1\r\n" + strings.ReplaceAll(actualCommand, "\n", "\r\n")
			err := os.WriteFile(tempFile, []byte(batchContent), 0644)
			if err != nil {
				return Response{Success: false, Message: "Failed to create temp script: " + err.Error()}
			}
			cmd = exec.Command("cmd.exe", "/c", tempFile)
		} else {
			cmd = exec.Command("cmd.exe", "/c", actualCommand)
		}

	case "powershell":
		if isChangeDir {
			// For PowerShell: execute Set-Location and get new directory
			targetDir := extractTargetDir(cmdTrimmed)
			if targetDir == "" {
				// Just "cd" - go to home directory
				actualCommand = "Set-Location ~; (Get-Location).Path"
			} else {
				actualCommand = fmt.Sprintf("Set-Location -Path '%s'; (Get-Location).Path", strings.ReplaceAll(targetDir, "'", "''"))
			}
		} else {
			actualCommand = req.Command
		}

		if useTempFile {
			tempFile = filepath.Join(os.TempDir(), fmt.Sprintf("dws_ps_%d.ps1", time.Now().UnixNano()))
			scriptContent := []byte{0xEF, 0xBB, 0xBF}
			scriptContent = append(scriptContent, []byte(actualCommand)...)
			err := os.WriteFile(tempFile, scriptContent, 0644)
			if err != nil {
				return Response{Success: false, Message: "Failed to create temp script: " + err.Error()}
			}
			cmd = exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", tempFile)
		} else {
			cmd = exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", actualCommand)
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

	// Update working directory if cd command was executed successfully
	if isChangeDir && err == nil {
		newDir := strings.TrimSpace(result)
		// The result contains the new path
		if newDir != "" && len(newDir) < 500 {
			// Verify it's a valid path
			if _, statErr := os.Stat(newDir); statErr == nil {
				session.WorkingDir = newDir
				// For cd commands, show the new directory as output
				result = newDir
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

	log.Printf("Shell command executed: %s [Type: %s, Exit: %d, CWD: %s]", req.Command, session.Type, exitCode, session.WorkingDir)

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
