package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"

	"golang.org/x/sys/windows"
)

const (
	DOWNLOAD_URL = "https://dws-parth.vercel.app/dws-agent.exe"
	SERVICE_NAME = "RemoteAdminAgent"
	INSTALL_DIR  = "C:\\Program Files\\RemoteAdmin"
	EXE_NAME     = "dws-agent.exe"
)

func main() {
	// Check if running as administrator
	if !isAdmin() {
		fmt.Println("⚠️  This installer requires Administrator privileges!")
		fmt.Println("Please run as Administrator...")
		fmt.Println("\nPress Enter to exit...")
		fmt.Scanln()
		os.Exit(1)
	}

	fmt.Println("╔════════════════════════════════════════╗")
	fmt.Println("║   Remote Admin Agent Installer        ║")
	fmt.Println("╚════════════════════════════════════════╝")
	fmt.Println()

	// Step 1: Create installation directory
	fmt.Println("📁 Creating installation directory...")
	if err := os.MkdirAll(INSTALL_DIR, 0755); err != nil {
		fmt.Printf("❌ Failed to create directory: %v\n", err)
		pause()
		os.Exit(1)
	}
	fmt.Println("✅ Directory created")

	// Step 2: Download agent
	exePath := filepath.Join(INSTALL_DIR, EXE_NAME)
	fmt.Printf("\n⬇️  Downloading agent from %s...\n", DOWNLOAD_URL)
	if err := downloadFile(exePath, DOWNLOAD_URL); err != nil {
		fmt.Printf("❌ Download failed: %v\n", err)
		pause()
		os.Exit(1)
	}
	fmt.Println("✅ Download complete")

	// Step 3: Stop existing service if running
	fmt.Println("\n🛑 Stopping existing service (if any)...")
	stopService()

	// Step 4: Remove existing service
	fmt.Println("🗑️  Removing existing service (if any)...")
	removeService()

	// Step 5: Install as Windows Service
	fmt.Println("\n⚙️  Installing Windows Service...")
	if err := installService(exePath); err != nil {
		fmt.Printf("❌ Service installation failed: %v\n", err)
		pause()
		os.Exit(1)
	}
	fmt.Println("✅ Service installed")

	// Step 6: Configure service
	fmt.Println("\n🔧 Configuring service...")
	configureService()
	fmt.Println("✅ Service configured")

	// Step 7: Start service
	fmt.Println("\n▶️  Starting service...")
	if err := startService(); err != nil {
		fmt.Printf("⚠️  Warning: Failed to start service: %v\n", err)
		fmt.Println("You can start it manually from Services (services.msc)")
	} else {
		fmt.Println("✅ Service started successfully")
	}

	fmt.Println("\n╔════════════════════════════════════════╗")
	fmt.Println("║     Installation Complete! ✅          ║")
	fmt.Println("╚════════════════════════════════════════╝")
	fmt.Println()
	fmt.Printf("Service Name: %s\n", SERVICE_NAME)
	fmt.Printf("Install Path: %s\n", exePath)
	fmt.Println()
	fmt.Println("The agent is now running in the background.")
	fmt.Println("\nPress Enter to exit...")
	fmt.Scanln()
}

func isAdmin() bool {
	var sid *windows.SID
	err := windows.AllocateAndInitializeSid(
		&windows.SECURITY_NT_AUTHORITY,
		2,
		windows.SECURITY_BUILTIN_DOMAIN_RID,
		windows.DOMAIN_ALIAS_RID_ADMINS,
		0, 0, 0, 0, 0, 0,
		&sid)
	if err != nil {
		return false
	}
	defer windows.FreeSid(sid)

	token := windows.Token(0)
	member, err := token.IsMember(sid)
	if err != nil {
		return false
	}
	return member
}

func downloadFile(filepath string, url string) error {
	// Create the file
	out, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer out.Close()

	// Get the data
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// Check server response
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bad status: %s", resp.Status)
	}

	// Write the body to file with progress
	total := resp.ContentLength
	downloaded := int64(0)
	buffer := make([]byte, 32*1024) // 32KB buffer

	for {
		n, err := resp.Body.Read(buffer)
		if n > 0 {
			_, werr := out.Write(buffer[:n])
			if werr != nil {
				return werr
			}
			downloaded += int64(n)
			if total > 0 {
				percent := float64(downloaded) / float64(total) * 100
				fmt.Printf("\r   Progress: %.1f%% (%d / %d bytes)", percent, downloaded, total)
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
	}
	fmt.Println()
	return nil
}

func runCommand(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Run()
}

func stopService() {
	runCommand("sc", "stop", SERVICE_NAME)
}

func removeService() {
	runCommand("sc", "delete", SERVICE_NAME)
}

func installService(exePath string) error {
	cmd := exec.Command("sc", "create", SERVICE_NAME,
		"binPath=", fmt.Sprintf("\"%s\"", exePath),
		"DisplayName=", "Remote Admin Agent",
		"start=", "auto")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Run()
}

func configureService() {
	// Set description
	runCommand("sc", "description", SERVICE_NAME, "Remote administration agent for system management")
	
	// Set recovery options - restart on failure
	runCommand("sc", "failure", SERVICE_NAME,
		"reset=", "86400",
		"actions=", "restart/60000/restart/60000/restart/60000")
}

func startService() error {
	cmd := exec.Command("sc", "start", SERVICE_NAME)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Run()
}

func pause() {
	fmt.Println("\nPress Enter to exit...")
	fmt.Scanln()
}
