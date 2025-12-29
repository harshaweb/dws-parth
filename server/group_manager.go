package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// CreateGroup creates a new group
func CreateGroup(userID, name, description string) (*Group, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Check if group with same name already exists
	var existingGroup Group
	err := groupsCollection.FindOne(ctx, bson.M{"user_id": userID, "name": name}).Decode(&existingGroup)
	if err == nil {
		return nil, fmt.Errorf("group with name '%s' already exists", name)
	}

	group := Group{
		UserID:      userID,
		Name:        name,
		Description: description,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	result, err := groupsCollection.InsertOne(ctx, group)
	if err != nil {
		return nil, fmt.Errorf("failed to create group: %v", err)
	}

	group.ID = result.InsertedID.(primitive.ObjectID)
	log.Printf("✅ Created new group: %s", name)
	return &group, nil
}

// GetAllGroups retrieves all groups for a user
func GetAllGroups(userID string) ([]Group, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cursor, err := groupsCollection.Find(ctx, bson.M{"user_id": userID})
	if err != nil {
		return nil, fmt.Errorf("failed to fetch groups: %v", err)
	}
	defer cursor.Close(ctx)

	var groups []Group
	if err = cursor.All(ctx, &groups); err != nil {
		return nil, fmt.Errorf("failed to decode groups: %v", err)
	}

	return groups, nil
}

// GetGroupByID retrieves a single group by ID
func GetGroupByID(groupID string) (*Group, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	objID, err := primitive.ObjectIDFromHex(groupID)
	if err != nil {
		return nil, fmt.Errorf("invalid group ID: %v", err)
	}

	var group Group
	err = groupsCollection.FindOne(ctx, bson.M{"_id": objID}).Decode(&group)
	if err != nil {
		return nil, fmt.Errorf("group not found: %v", err)
	}

	return &group, nil
}

// UpdateGroup updates a group's details
func UpdateGroup(groupID, name, description string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	objID, err := primitive.ObjectIDFromHex(groupID)
	if err != nil {
		return fmt.Errorf("invalid group ID: %v", err)
	}

	_, err = groupsCollection.UpdateOne(
		ctx,
		bson.M{"_id": objID},
		bson.M{
			"$set": bson.M{
				"name":        name,
				"description": description,
				"updated_at":  time.Now(),
			},
		},
	)

	return err
}

// DeleteGroup removes a group from database
func DeleteGroup(groupID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	objID, err := primitive.ObjectIDFromHex(groupID)
	if err != nil {
		return fmt.Errorf("invalid group ID: %v", err)
	}

	// Also remove group_name from all devices in this group
	_, err = devicesCollection.UpdateMany(
		ctx,
		bson.M{"group_name": groupID},
		bson.M{"$set": bson.M{"group_name": ""}},
	)
	if err != nil {
		log.Printf("⚠️ Warning: Failed to clear group from devices: %v", err)
	}

	_, err = groupsCollection.DeleteOne(ctx, bson.M{"_id": objID})
	return err
}

// GetDevicesByGroup retrieves all devices in a group
func GetDevicesByGroup(groupName string) ([]Device, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cursor, err := devicesCollection.Find(ctx, bson.M{"group_name": groupName})
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
