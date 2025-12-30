package main

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"syscall"

	"github.com/shirou/gopsutil/v3/process"
)

type ProcessInfo struct {
	PID         int32   `json:"pid"`
	Name        string  `json:"name"`
	Status      string  `json:"status"`
	CPUPercent  float64 `json:"cpu_percent"`
	MemoryMB    float64 `json:"memory_mb"`
	MemoryPct   float32 `json:"memory_percent"`
	Username    string  `json:"username"`
	CommandLine string  `json:"command_line"`
	CreateTime  int64   `json:"create_time"`
	NumThreads  int32   `json:"num_threads"`
	IORead      uint64  `json:"io_read"`
	IOWrite     uint64  `json:"io_write"`
	ParentPID   int32   `json:"parent_pid"`
	ExePath     string  `json:"exe_path"`
}

type TaskManagerResponse struct {
	Success   bool          `json:"success"`
	Message   string        `json:"message"`
	Processes []ProcessInfo `json:"processes,omitempty"`
}

func HandleTaskManager(data json.RawMessage) TaskManagerResponse {
	var req struct {
		Action string `json:"action"` // "list", "kill", "details"
		PID    int32  `json:"pid"`
	}

	if err := json.Unmarshal(data, &req); err != nil {
		return TaskManagerResponse{Success: false, Message: "Invalid request"}
	}

	switch req.Action {
	case "list":
		return listProcesses()
	case "kill":
		return killProcess(req.PID)
	case "details":
		return getProcessDetails(req.PID)
	default:
		return TaskManagerResponse{Success: false, Message: "Unknown action"}
	}
}

func listProcesses() TaskManagerResponse {
	procs, err := process.Processes()
	if err != nil {
		return TaskManagerResponse{Success: false, Message: "Failed to get processes: " + err.Error()}
	}

	var processes []ProcessInfo

	for _, p := range procs {
		name, _ := p.Name()
		if name == "" {
			continue
		}

		cpuPercent, _ := p.CPUPercent()
		memInfo, _ := p.MemoryInfo()
		memPercent, _ := p.MemoryPercent()
		username, _ := p.Username()
		status, _ := p.Status()
		numThreads, _ := p.NumThreads()
		createTime, _ := p.CreateTime()
		ppid, _ := p.Ppid()

		var memoryMB float64
		if memInfo != nil {
			memoryMB = float64(memInfo.RSS) / 1024 / 1024
		}

		statusStr := "Running"
		if len(status) > 0 {
			switch status[0] {
			case "R":
				statusStr = "Running"
			case "S":
				statusStr = "Sleeping"
			case "T":
				statusStr = "Stopped"
			case "Z":
				statusStr = "Zombie"
			case "W":
				statusStr = "Waiting"
			default:
				statusStr = status[0]
			}
		}

		proc := ProcessInfo{
			PID:        p.Pid,
			Name:       name,
			Status:     statusStr,
			CPUPercent: cpuPercent,
			MemoryMB:   memoryMB,
			MemoryPct:  memPercent,
			Username:   username,
			CreateTime: createTime,
			NumThreads: numThreads,
			ParentPID:  ppid,
		}

		processes = append(processes, proc)
	}

	return TaskManagerResponse{
		Success:   true,
		Message:   fmt.Sprintf("Found %d processes", len(processes)),
		Processes: processes,
	}
}

func killProcess(pid int32) TaskManagerResponse {
	if pid <= 0 {
		return TaskManagerResponse{Success: false, Message: "Invalid PID"}
	}

	p, err := process.NewProcess(pid)
	if err != nil {
		return TaskManagerResponse{Success: false, Message: "Process not found: " + err.Error()}
	}

	name, _ := p.Name()

	// Try graceful termination first
	err = p.Terminate()
	if err != nil {
		// Force kill if terminate fails
		err = p.Kill()
		if err != nil {
			return TaskManagerResponse{Success: false, Message: "Failed to kill process: " + err.Error()}
		}
	}

	return TaskManagerResponse{
		Success: true,
		Message: fmt.Sprintf("Process %s (PID: %d) terminated", name, pid),
	}
}

func getProcessDetails(pid int32) TaskManagerResponse {
	if pid <= 0 {
		return TaskManagerResponse{Success: false, Message: "Invalid PID"}
	}

	p, err := process.NewProcess(pid)
	if err != nil {
		return TaskManagerResponse{Success: false, Message: "Process not found: " + err.Error()}
	}

	name, _ := p.Name()
	cpuPercent, _ := p.CPUPercent()
	memInfo, _ := p.MemoryInfo()
	memPercent, _ := p.MemoryPercent()
	username, _ := p.Username()
	status, _ := p.Status()
	numThreads, _ := p.NumThreads()
	createTime, _ := p.CreateTime()
	cmdline, _ := p.Cmdline()
	exePath, _ := p.Exe()
	ppid, _ := p.Ppid()

	var memoryMB float64
	var ioRead, ioWrite uint64
	if memInfo != nil {
		memoryMB = float64(memInfo.RSS) / 1024 / 1024
	}

	ioCounters, err := p.IOCounters()
	if err == nil && ioCounters != nil {
		ioRead = ioCounters.ReadBytes
		ioWrite = ioCounters.WriteBytes
	}

	statusStr := "Running"
	if len(status) > 0 {
		statusStr = status[0]
	}

	proc := ProcessInfo{
		PID:         pid,
		Name:        name,
		Status:      statusStr,
		CPUPercent:  cpuPercent,
		MemoryMB:    memoryMB,
		MemoryPct:   memPercent,
		Username:    username,
		CommandLine: cmdline,
		CreateTime:  createTime,
		NumThreads:  numThreads,
		IORead:      ioRead,
		IOWrite:     ioWrite,
		ParentPID:   ppid,
		ExePath:     exePath,
	}

	return TaskManagerResponse{
		Success:   true,
		Message:   "Process details retrieved",
		Processes: []ProcessInfo{proc},
	}
}

// OpenFileLocation opens explorer with the file selected
func OpenFileLocation(pid int32) TaskManagerResponse {
	if runtime.GOOS != "windows" {
		return TaskManagerResponse{Success: false, Message: "Only supported on Windows"}
	}

	p, err := process.NewProcess(pid)
	if err != nil {
		return TaskManagerResponse{Success: false, Message: "Process not found"}
	}

	exePath, err := p.Exe()
	if err != nil || exePath == "" {
		return TaskManagerResponse{Success: false, Message: "Cannot get executable path"}
	}

	cmd := exec.Command("explorer.exe", "/select,", exePath)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	err = cmd.Start()
	if err != nil {
		return TaskManagerResponse{Success: false, Message: "Failed to open location: " + err.Error()}
	}

	return TaskManagerResponse{Success: true, Message: "Opened file location"}
}

// SetProcessPriority changes the priority of a process
func SetProcessPriority(pid int32, priority string) TaskManagerResponse {
	if runtime.GOOS != "windows" {
		return TaskManagerResponse{Success: false, Message: "Only supported on Windows"}
	}

	priorityMap := map[string]string{
		"realtime": "256",
		"high":     "128",
		"above":    "32768",
		"normal":   "32",
		"below":    "16384",
		"low":      "64",
	}

	priValue, ok := priorityMap[strings.ToLower(priority)]
	if !ok {
		return TaskManagerResponse{Success: false, Message: "Invalid priority level"}
	}

	cmd := exec.Command("wmic", "process", "where", fmt.Sprintf("ProcessId=%d", pid), "CALL", "setpriority", priValue)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	output, err := cmd.CombinedOutput()
	if err != nil {
		return TaskManagerResponse{Success: false, Message: "Failed to set priority: " + string(output)}
	}

	return TaskManagerResponse{Success: true, Message: fmt.Sprintf("Priority set to %s", priority)}
}

// HandleTaskManagerAction handles various task manager actions
func HandleTaskManagerAction(data json.RawMessage) TaskManagerResponse {
	var req struct {
		Action   string `json:"action"`
		PID      int32  `json:"pid"`
		Priority string `json:"priority"`
	}

	if err := json.Unmarshal(data, &req); err != nil {
		return TaskManagerResponse{Success: false, Message: "Invalid request"}
	}

	switch req.Action {
	case "list":
		return listProcesses()
	case "kill", "end_task":
		return killProcess(req.PID)
	case "details":
		return getProcessDetails(req.PID)
	case "open_location":
		return OpenFileLocation(req.PID)
	case "set_priority":
		return SetProcessPriority(req.PID, req.Priority)
	default:
		return TaskManagerResponse{Success: false, Message: "Unknown action: " + req.Action}
	}
}

// GetSystemResourceUsage returns overall system resource usage
func GetSystemResourceUsage() map[string]interface{} {
	procs, _ := process.Processes()

	var totalCPU float64
	var totalMemMB float64

	for _, p := range procs {
		cpu, _ := p.CPUPercent()
		totalCPU += cpu

		memInfo, _ := p.MemoryInfo()
		if memInfo != nil {
			totalMemMB += float64(memInfo.RSS) / 1024 / 1024
		}
	}

	return map[string]interface{}{
		"process_count": len(procs),
		"total_cpu":     totalCPU,
		"total_mem_mb":  totalMemMB,
	}
}

// Helper to parse memory string like "6.2 MB" to bytes
func parseMemoryString(memStr string) uint64 {
	memStr = strings.TrimSpace(memStr)
	parts := strings.Fields(memStr)
	if len(parts) < 2 {
		return 0
	}

	value, err := strconv.ParseFloat(strings.Replace(parts[0], ",", "", -1), 64)
	if err != nil {
		return 0
	}

	unit := strings.ToUpper(parts[1])
	switch unit {
	case "KB", "K":
		return uint64(value * 1024)
	case "MB", "M":
		return uint64(value * 1024 * 1024)
	case "GB", "G":
		return uint64(value * 1024 * 1024 * 1024)
	default:
		return uint64(value)
	}
}
