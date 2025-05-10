package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/CrowderSoup/todo-app/database"
	"github.com/CrowderSoup/todo-app/services"
	"github.com/gorilla/websocket"
)

// DataHandler handles data-related endpoints
type DataHandler struct {
	dataService *database.DataService
	authService *services.AuthService
	hub         *services.Hub
}

func NewDataHandler(dataService *database.DataService, authService *services.AuthService, hub *services.Hub) *DataHandler {
	return &DataHandler{
		dataService: dataService,
		authService: authService,
		hub:         hub,
	}
}

// GetData retrieves user data without saving client data
func (h *DataHandler) GetData(w http.ResponseWriter, r *http.Request) {
	email, ok := r.Context().Value(emailContextKey).(string)
	if !ok {
		http.Error(w, "user not found", http.StatusUnauthorized)
		return
	}

	// Get server data
	serverData, err := h.dataService.GetUserData(email)
	if err != nil {
		log.Printf("Error getting user data: %v", err)
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	// Return success with server data
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"status": "success",
		"data":   serverData,
	})
}

// SyncData synchronizes user data between client and server
func (h *DataHandler) SyncData(w http.ResponseWriter, r *http.Request) {
	email, ok := r.Context().Value(emailContextKey).(string)
	if !ok {
		http.Error(w, "user not found", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var clientData database.KanbanData
	if err := json.NewDecoder(r.Body).Decode(&clientData); err != nil {
		http.Error(w, "Invalid request format", http.StatusBadRequest)
		return
	}

	// Get server data
	serverData, err := h.dataService.GetUserData(email)
	if err != nil {
		log.Printf("Error getting user data: %v", err)
		http.Error(w, "Server error", http.StatusInternalServerError)
		return
	}

	// Merge client and server data
	mergedData := mergeKanbanData(serverData, &clientData)

	// Log summary of the merged data
	log.Printf("Merged data summary: %d columns, %d tasks", len(mergedData.Columns), len(mergedData.Tasks))
	for _, task := range mergedData.Tasks {
		if task.ColumnID == nil {
			log.Printf("Task %s is unassigned (columnId is null)", task.ID)
		}
	}

	// Save merged data to server
	if err := h.dataService.SaveUserData(email, mergedData); err != nil {
		log.Printf("Error saving user data: %v", err)
		http.Error(w, "Failed to save data", http.StatusInternalServerError)
		return
	}

	// Broadcast merged data to ALL connected clients including the sender
	// This ensures all clients have the exact same state after any sync operation
	message := services.WebSocketMessage{
		Type: "sync",
		Data: mergedData,
		User: "", // Empty user to broadcast to everyone
	}

	// Broadcast to all clients without filtering by email
	h.hub.Broadcast(message, "")

	// Return success with merged data for two-way sync
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"status": "success",
		"data":   mergedData,
	})
}

// HandleWebSocket upgrades the HTTP connection to a WebSocket connection
func (h *DataHandler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	email, ok := r.Context().Value(emailContextKey).(string)
	if !ok {
		http.Error(w, "user not found", http.StatusUnauthorized)
		return
	}

	// Upgrade HTTP connection to WebSocket
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // Allow all origins in development
		},
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Error upgrading to WebSocket: %v", err)
		return
	}

	// Check for and close any existing connections for this user
	for client := range h.hub.Clients {
		if client.Email == email {
			log.Printf("Found existing connection for user %s, keeping both connections", email)
			// We're keeping both connections instead of closing the old one
			// This allows a user to have multiple tabs/devices connected
		}
	}

	// Register client in the hub
	client := &services.Client{
		Hub:   h.hub,
		Conn:  conn,
		Send:  make(chan []byte, 256),
		Email: email,
	}

	h.hub.Register(client)
	log.Printf("WebSocket client registered: %s", email)

	// Start goroutines for reading and writing
	go client.WritePump()
	go client.ReadPump()
}

// mergeKanbanData performs a safe merge between server and client data
// It preserves data from both sources using the following rules:
// 1. Tasks and columns with the same ID are merged, with client data taking precedence for updates
// 2. New items from client are included in the final result
// 3. Tasks and columns that are marked as deleted are preserved but hidden from UI
// 4. Tasks that exist on the server but not in the client are preserved
// 5. Tasks with null or empty columnId are considered "unassigned"
func mergeKanbanData(serverData *database.KanbanData, clientData *database.KanbanData) *database.KanbanData {
	result := &database.KanbanData{
		Columns:             []database.Column{},
		Tasks:               []database.Task{},
		UnassignedCollapsed: clientData.UnassignedCollapsed, // Use client preference for UI state
	}

	// Create maps for faster lookups
	serverColumns := make(map[string]database.Column)
	clientColumns := make(map[string]database.Column)

	// Track all task IDs across both client and server
	allServerTaskIDs := make(map[string]bool)
	allClientTaskIDs := make(map[string]bool)

	// Populate column maps
	for _, col := range serverData.Columns {
		serverColumns[col.ID] = col
	}
	for _, col := range clientData.Columns {
		clientColumns[col.ID] = col
	}

	// Record all task IDs from server tasks
	for _, task := range serverData.Tasks {
		allServerTaskIDs[task.ID] = true
	}
	// If server data still has unassignedTasks as separate array (for backward compatibility)
	if len(serverData.UnassignedTasks) > 0 {
		for _, task := range serverData.UnassignedTasks {
			allServerTaskIDs[task.ID] = true
		}
	}

	// Record all task IDs from client
	for _, task := range clientData.Tasks {
		allClientTaskIDs[task.ID] = true
	}
	// If client data still has unassignedTasks as separate array (for backward compatibility)
	if len(clientData.UnassignedTasks) > 0 {
		for _, task := range clientData.UnassignedTasks {
			allClientTaskIDs[task.ID] = true
		}
	}

	// Merge columns - prioritize client columns
	// Add client columns first (they take precedence)
	result.Columns = append(result.Columns, clientData.Columns...)

	// Add server columns that don't exist in client
	for id, col := range serverColumns {
		if _, exists := clientColumns[id]; !exists {
			result.Columns = append(result.Columns, col)
		}
	}

	// For tasks, use client state exclusively unless a task only exists on server

	// First, add all client tasks
	for _, task := range clientData.Tasks {
		// Fix for unassigned tasks: ensure empty string columnId is treated as null
		// This is critical for proper handling of unassigned tasks
		if task.ColumnID != nil {
			columnIDVal := *task.ColumnID
			if columnIDVal == "" {
				log.Printf("Task %s had empty string columnId, setting to null", task.ID)
				task.ColumnID = nil
			}
		}
		result.Tasks = append(result.Tasks, task)
	}

	// If client still uses unassignedTasks array, add those too
	for _, task := range clientData.UnassignedTasks {
		// Make sure these tasks have no columnId
		task.ColumnID = nil
		log.Printf("Adding unassigned task %s from legacy unassignedTasks array", task.ID)
		result.Tasks = append(result.Tasks, task)
	}

	// Then add server tasks that don't exist in the client at all
	// These are tasks that might have been added on another device
	for _, task := range serverData.Tasks {
		if !allClientTaskIDs[task.ID] {
			// Fix for unassigned tasks: ensure empty string columnId is treated as null
			if task.ColumnID != nil {
				columnIDVal := *task.ColumnID
				if columnIDVal == "" {
					log.Printf("Server task %s had empty string columnId, setting to null", task.ID)
					task.ColumnID = nil
				}
			}
			result.Tasks = append(result.Tasks, task)
		}
	}

	// If server still uses unassignedTasks array, add those too
	for _, task := range serverData.UnassignedTasks {
		if !allClientTaskIDs[task.ID] {
			// Make sure these tasks have no columnId
			task.ColumnID = nil
			log.Printf("Adding unassigned task %s from server's legacy unassignedTasks array", task.ID)
			result.Tasks = append(result.Tasks, task)
		}
	}

	// Final verification pass to ensure all unassigned tasks have null columnId
	for i, task := range result.Tasks {
		if task.ColumnID != nil {
			columnIDVal := *task.ColumnID
			if columnIDVal == "" || columnIDVal == "unassigned" {
				log.Printf("Final verification: Task %s had invalid columnId (%v), setting to null",
					task.ID, task.ColumnID)
				result.Tasks[i].ColumnID = nil
			}
		}
	}

	return result
}
