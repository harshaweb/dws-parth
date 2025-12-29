package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var (
	mongoClient        *mongo.Client
	devicesCollection  *mongo.Collection
	sessionsCollection *mongo.Collection
	groupsCollection   *mongo.Collection
)

const mongoURI = "mongodb+srv://dwsparth:7388139606@cluster0.d0wsypq.mongodb.net/?appName=Cluster0"

func InitDatabase() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	clientOptions := options.Client().ApplyURI(mongoURI)
	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		return fmt.Errorf("failed to connect to MongoDB: %v", err)
	}

	// Ping the database
	err = client.Ping(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to ping MongoDB: %v", err)
	}

	mongoClient = client
	db := client.Database("device_management")
	devicesCollection = db.Collection("devices")
	sessionsCollection = db.Collection("sessions")
	groupsCollection = db.Collection("groups")

	log.Println("✅ Connected to MongoDB successfully")
	return nil
}

func CloseDatabase() {
	if mongoClient != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := mongoClient.Disconnect(ctx); err != nil {
			log.Printf("Error disconnecting from MongoDB: %v", err)
		}
	}
}
