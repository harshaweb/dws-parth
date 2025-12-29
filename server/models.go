package main

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Device struct {
	ID               primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID           string             `bson:"user_id" json:"user_id"`
	Name             string             `bson:"name" json:"name"`
	Hostname         string             `bson:"hostname" json:"hostname"`
	IPAddress        string             `bson:"ip_address" json:"ip_address"`
	OSVersion        string             `bson:"os_version" json:"os_version"`
	Status           string             `bson:"status" json:"status"`                       // online, offline, maintenance
	ConnectionStatus string             `bson:"connection_status" json:"connection_status"` // connected, disconnected, error
	LastSeen         time.Time          `bson:"last_seen" json:"last_seen"`
	WindowsUsername  string             `bson:"windows_username" json:"windows_username"`
	WallpaperURL     string             `bson:"wallpaper_url" json:"wallpaper_url"`
	Label            string             `bson:"-" json:"label"`               // Label stored locally on agent, not in MongoDB
	GroupName        string             `bson:"group_name" json:"group_name"` // Group name for organization
	CreatedAt        time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt        time.Time          `bson:"updated_at" json:"updated_at"`
}

type Session struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	DeviceID  primitive.ObjectID `bson:"device_id" json:"device_id"`
	UserID    string             `bson:"user_id" json:"user_id"`
	StartedAt time.Time          `bson:"started_at" json:"started_at"`
	EndedAt   *time.Time         `bson:"ended_at,omitempty" json:"ended_at,omitempty"`
	Active    bool               `bson:"active" json:"active"`
}

type SystemMetrics struct {
	DeviceID    primitive.ObjectID `bson:"device_id" json:"device_id"`
	CPUUsage    float64            `bson:"cpu_usage" json:"cpu_usage"`
	MemoryUsage float64            `bson:"memory_usage" json:"memory_usage"`
	DiskUsage   float64            `bson:"disk_usage" json:"disk_usage"`
	Timestamp   time.Time          `bson:"timestamp" json:"timestamp"`
}

type Group struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID      string             `bson:"user_id" json:"user_id"`
	Name        string             `bson:"name" json:"name"`
	Description string             `bson:"description" json:"description"`
	CreatedAt   time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt   time.Time          `bson:"updated_at" json:"updated_at"`
}
