package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"os"
	"os/user"
	"runtime"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

// RegisterDevice registers a new device or updates existing one
func RegisterDevice(name string) (*Device, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Get system information
	hostname, _ := os.Hostname()
	ipAddress := getLocalIP()
	osVersion := runtime.GOOS + " " + runtime.GOARCH

	currentUser, err := user.Current()
	username := "Unknown"
	if err == nil {
		username = currentUser.Username
	}

	// Check if device already exists by hostname
	var existingDevice Device
	err = devicesCollection.FindOne(ctx, bson.M{"hostname": hostname}).Decode(&existingDevice)

	if err == mongo.ErrNoDocuments {
		// Create new device
		device := Device{
			UserID:           "default_user", // You can add authentication later
			Name:             name,
			Hostname:         hostname,
			IPAddress:        ipAddress,
			OSVersion:        osVersion,
			Status:           "online",
			ConnectionStatus: "connected",
			LastSeen:         time.Now(),
			WindowsUsername:  username,
			WallpaperURL:     "/windows-11-gradient-purple.jpg",
			GroupName:        "",
			CreatedAt:        time.Now(),
			UpdatedAt:        time.Now(),
		}

		result, err := devicesCollection.InsertOne(ctx, device)
		if err != nil {
			return nil, fmt.Errorf("failed to register device: %v", err)
		}

		device.ID = result.InsertedID.(primitive.ObjectID)
		log.Printf("✅ Registered new device: %s (%s)", name, hostname)
		return &device, nil
	} else if err != nil {
		return nil, fmt.Errorf("database error: %v", err)
	}

	// Update existing device
	existingDevice.Status = "online"
	existingDevice.ConnectionStatus = "connected"
	existingDevice.LastSeen = time.Now()
	existingDevice.IPAddress = ipAddress
	existingDevice.UpdatedAt = time.Now()

	_, err = devicesCollection.UpdateOne(
		ctx,
		bson.M{"_id": existingDevice.ID},
		bson.M{"$set": existingDevice},
	)

	if err != nil {
		return nil, fmt.Errorf("failed to update device: %v", err)
	}

	log.Printf("✅ Updated existing device: %s (%s)", name, hostname)
	return &existingDevice, nil
}

// GetAllDevices retrieves all devices
func GetAllDevices() ([]Device, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cursor, err := devicesCollection.Find(ctx, bson.M{})
	if err != nil {
		return nil, fmt.Errorf("failed to fetch devices: %v", err)
	}
	defer cursor.Close(ctx)

	var devices []Device
	if err = cursor.All(ctx, &devices); err != nil {
		return nil, fmt.Errorf("failed to decode devices: %v", err)
	}

	return devices, nil
}

// GetDeviceByID retrieves a single device by ID
func GetDeviceByID(deviceID string) (*Device, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	objID, err := primitive.ObjectIDFromHex(deviceID)
	if err != nil {
		return nil, fmt.Errorf("invalid device ID: %v", err)
	}

	var device Device
	err = devicesCollection.FindOne(ctx, bson.M{"_id": objID}).Decode(&device)
	if err != nil {
		return nil, fmt.Errorf("device not found: %v", err)
	}

	return &device, nil
}

// UpdateDeviceStatus updates device status and last seen
func UpdateDeviceStatus(deviceID primitive.ObjectID, status, connectionStatus string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := devicesCollection.UpdateOne(
		ctx,
		bson.M{"_id": deviceID},
		bson.M{
			"$set": bson.M{
				"status":            status,
				"connection_status": connectionStatus,
				"last_seen":         time.Now(),
				"updated_at":        time.Now(),
			},
		},
	)

	return err
}

// DeleteDevice removes a device from database
func DeleteDevice(deviceID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	objID, err := primitive.ObjectIDFromHex(deviceID)
	if err != nil {
		return fmt.Errorf("invalid device ID: %v", err)
	}

	_, err = devicesCollection.DeleteOne(ctx, bson.M{"_id": objID})
	return err
}

// UpdateDeviceGroup updates the group name of a device
func UpdateDeviceGroup(deviceID primitive.ObjectID, groupName string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := devicesCollection.UpdateOne(
		ctx,
		bson.M{"_id": deviceID},
		bson.M{
			"$set": bson.M{
				"group_name": groupName,
				"updated_at": time.Now(),
			},
		},
	)

	return err
}

// Helper function to get local IP
func getLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "127.0.0.1"
	}

	for _, address := range addrs {
		if ipnet, ok := address.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String()
			}
		}
	}
	return "127.0.0.1"
}
