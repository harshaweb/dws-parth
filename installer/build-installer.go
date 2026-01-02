package main

import (
	_ "embed"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

//go:embed dws-agent.exe
var agentBinary []byte

const (
	serviceName    = "RemoteAdminAgent"
	serviceDisplay = "Remote Admin Agent"
	serviceDesc    = "Remote administration agent for device management and monitoring"
	installDir     = `C:\Program Files\Remote Admin Agent`
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "uninstall" {
		uninstall()
		return
	}

	fmt.Println("========================================")
	fmt.Println("Remote Admin Agent Installer")
	fmt.Println("========================================")
	fmt.Println()

	// Check if running as administrator
	if !isAdmin() {
		fmt.Println("ERROR: This installer requires administrator privileges!")
		fmt.Println("Please right-click and select 'Run as administrator'")
		showMessageBox("Administrator Required", "This installer requires administrator privileges!\n\nPlease right-click the installer and select 'Run as administrator'")
		pause()
		os.Exit(1)
	}

	install()
}

func install() {
	fmt.Println("Installing Remote Admin Agent...")
	fmt.Println()

	// Step 1: Create installation directory
	fmt.Println("[1/5] Creating installation directory...")
	if err := os.MkdirAll(installDir, 0755); err != nil {
		fmt.Printf("ERROR: Failed to create directory: %v\n", err)
		pause()
		os.Exit(1)
	}
	fmt.Println("✓ Directory created")

	// Step 2: Extract agent binary
	fmt.Println("[2/5] Installing agent executable...")
	agentPath := filepath.Join(installDir, "dws-agent.exe")
	if err := os.WriteFile(agentPath, agentBinary, 0755); err != nil {
		fmt.Printf("ERROR: Failed to write agent: %v\n", err)
		pause()
		os.Exit(1)
	}
	fmt.Println("✓ Agent installed")

	// Step 3: Create uninstaller
	fmt.Println("[3/5] Creating uninstaller...")
	if err := createUninstaller(); err != nil {
		fmt.Printf("WARNING: Failed to create uninstaller: %v\n", err)
	} else {
		fmt.Println("✓ Uninstaller created")
	}

	// Step 4: Install Windows service
	fmt.Println("[4/5] Installing Windows service...")
	if err := installService(agentPath); err != nil {
		fmt.Printf("ERROR: Failed to install service: %v\n", err)
		pause()
		os.Exit(1)
	}
	fmt.Println("✓ Service installed")

	// Step 5: Start service
	fmt.Println("[5/5] Starting service...")
	if err := startService(); err != nil {
		fmt.Printf("WARNING: Service installed but failed to start: %v\n", err)
		fmt.Println("You can start it manually from Services (services.msc)")
	} else {
		fmt.Println("✓ Service started")
	}

	fmt.Println()
	fmt.Println("========================================")
	fmt.Println("SUCCESS!")
	fmt.Println("========================================")
	fmt.Println("Remote Admin Agent has been installed successfully!")
	fmt.Println()
	fmt.Printf("Installation Directory: %s\n", installDir)
	fmt.Printf("Service Name: %s\n", serviceName)
	fmt.Println()
	fmt.Println("The agent is now running as a Windows service.")
	fmt.Println("It will start automatically when Windows starts.")
	fmt.Println()
	fmt.Printf("To uninstall, run: %s uninstall\n", filepath.Join(installDir, "uninstall.exe"))
	fmt.Println()

	showMessageBox("Success", "Remote Admin Agent has been installed successfully!\\n\\nThe agent is now running as a Windows service and will start automatically on boot.\\n\\nTo uninstall, right-click the installer and run as administrator with 'uninstall' parameter.")

	pause()
}

func uninstall() {
	fmt.Println("========================================")
	fmt.Println("Remote Admin Agent Uninstaller")
	fmt.Println("========================================")
	fmt.Println()

	if !isAdmin() {
		fmt.Println("ERROR: Uninstaller requires administrator privileges!")
		fmt.Println("Please right-click and select 'Run as administrator'")
		pause()
		os.Exit(1)
	}

	fmt.Println("Uninstalling Remote Admin Agent...")
	fmt.Println()

	// Step 1: Stop service
	fmt.Println("[1/3] Stopping service...")
	if err := stopService(); err != nil {
		fmt.Printf("WARNING: Failed to stop service: %v\n", err)
	} else {
		fmt.Println("✓ Service stopped")
	}

	// Step 2: Remove service
	fmt.Println("[2/3] Removing service...")
	if err := removeService(); err != nil {
		fmt.Printf("ERROR: Failed to remove service: %v\n", err)
		pause()
		os.Exit(1)
	}
	fmt.Println("✓ Service removed")

	// Step 3: Remove files
	fmt.Println("[3/3] Removing files...")
	if err := os.RemoveAll(installDir); err != nil {
		fmt.Printf("WARNING: Failed to remove directory: %v\n", err)
		fmt.Printf("Please manually delete: %s\n", installDir)
	} else {
		fmt.Println("✓ Files removed")
	}

	fmt.Println()
	fmt.Println("========================================")
	fmt.Println("UNINSTALL COMPLETE")
	fmt.Println("========================================")
	fmt.Println("Remote Admin Agent has been removed from your system.")
	fmt.Println()

	pause()
}

func installService(exePath string) error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("failed to connect to service manager: %v", err)
	}
	defer m.Disconnect()

	// Check if service already exists
	s, err := m.OpenService(serviceName)
	if err == nil {
		s.Close()
		// Service exists, remove it first
		if err := removeService(); err != nil {
			return fmt.Errorf("failed to remove existing service: %v", err)
		}
	}

	// Create service
	s, err = m.CreateService(serviceName, exePath, mgr.Config{
		DisplayName: serviceDisplay,
		Description: serviceDesc,
		StartType:   mgr.StartAutomatic,
	})
	if err != nil {
		return fmt.Errorf("failed to create service: %v", err)
	}
	defer s.Close()

	return nil
}

func startService() error {
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()

	s, err := m.OpenService(serviceName)
	if err != nil {
		return err
	}
	defer s.Close()

	return s.Start()
}

func stopService() error {
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()

	s, err := m.OpenService(serviceName)
	if err != nil {
		return err
	}
	defer s.Close()

	status, err := s.Control(svc.Stop)
	if err != nil {
		return err
	}

	_ = status
	return nil
}

func removeService() error {
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()

	s, err := m.OpenService(serviceName)
	if err != nil {
		return err
	}
	defer s.Close()

	return s.Delete()
}

func createUninstaller() error {
	// Get current executable
	exePath, err := os.Executable()
	if err != nil {
		return err
	}

	// Copy to uninstall.exe
	uninstallerPath := filepath.Join(installDir, "uninstall.exe")

	src, err := os.Open(exePath)
	if err != nil {
		return err
	}
	defer src.Close()

	dst, err := os.Create(uninstallerPath)
	if err != nil {
		return err
	}
	defer dst.Close()

	_, err = io.Copy(dst, src)
	return err
}

func isAdmin() bool {
	_, err := os.Open("\\\\.\\PHYSICALDRIVE0")
	return err == nil
}

func pause() {
	fmt.Println("")
	fmt.Println("Press Enter to exit...")
	fmt.Scanln()
}

func showMessageBox(title, message string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	messageBox := user32.NewProc("MessageBoxW")

	titlePtr, _ := syscall.UTF16PtrFromString(title)
	messagePtr, _ := syscall.UTF16PtrFromString(message)

	// MB_OK | MB_ICONINFORMATION = 0x00000040
	// MB_OK | MB_ICONERROR = 0x00000010
	const MB_OK = 0x00000000
	const MB_ICONINFORMATION = 0x00000040
	const MB_ICONERROR = 0x00000010

	var icon uintptr
	if title == "Success" {
		icon = MB_OK | MB_ICONINFORMATION
	} else {
		icon = MB_OK | MB_ICONERROR
	}

	messageBox.Call(
		0,
		uintptr(unsafe.Pointer(messagePtr)),
		uintptr(unsafe.Pointer(titlePtr)),
		icon,
	)
}
