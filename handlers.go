package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	
	"github.com/gorilla/websocket"
)

// AuthHandler handles authentication-related endpoints
type AuthHandler struct {
	authService *AuthService
	dataService *DataService
}

func NewAuthHandler(authService *AuthService, dataService *DataService) *AuthHandler {
	return &AuthHandler{
		authService: authService,
		dataService: dataService,
	}
}

// Login handles the login request (sending a magic link)
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	// Parse request
	var req struct {
		Email string `json:"email"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request format", http.StatusBadRequest)
		return
	}

	// Validate email
	if req.Email == "" || !strings.Contains(req.Email, "@") {
		http.Error(w, "Invalid email address", http.StatusBadRequest)
		return
	}

	// Get base URL from request or use default
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	baseURL := fmt.Sprintf("%s://%s", scheme, r.Host)

	// Generate magic link
	magicLink, err := h.authService.GenerateMagicLink(req.Email, baseURL)
	if err != nil {
		log.Printf("Error generating magic link: %v", err)
		http.Error(w, "Failed to generate login link", http.StatusInternalServerError)
		return
	}

	// Return success response with magic link for development
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":    "success",
		"message":   "Magic link has been sent",
		"magicLink": magicLink, // For development only
	})
}

// HandleMagicLink processes a magic link token and redirects to the frontend
func (h *AuthHandler) HandleMagicLink(w http.ResponseWriter, r *http.Request) {
	// Get token from query
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "Missing token", http.StatusBadRequest)
		return
	}

	// Verify token
	email, err := h.authService.VerifyMagicLinkToken(token)
	if err != nil {
		http.Error(w, "Invalid or expired token", http.StatusBadRequest)
		return
	}

	// Create JWT token
	jwtToken, err := h.authService.CreateJWT(email)
	if err != nil {
		log.Printf("Error creating JWT: %v", err)
		http.Error(w, "Authentication error", http.StatusInternalServerError)
		return
	}

	// Redirect to frontend with token
	redirectURL := fmt.Sprintf("/?token=%s&email=%s", jwtToken, email)
	http.Redirect(w, r, redirectURL, http.StatusFound)
}

// VerifyToken checks if a JWT token is valid
func (h *AuthHandler) VerifyToken(w http.ResponseWriter, r *http.Request) {
	// Get token from Authorization header
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		http.Error(w, "Missing authorization header", http.StatusUnauthorized)
		return
	}

	// Extract token from Bearer format
	authParts := strings.Split(authHeader, " ")
	if len(authParts) != 2 || authParts[0] != "Bearer" {
		http.Error(w, "Invalid authorization format", http.StatusUnauthorized)
		return
	}

	tokenString := authParts[1]

	// Verify token
	email, err := h.authService.VerifyJWT(tokenString)
	if err != nil {
		http.Error(w, "Invalid token", http.StatusUnauthorized)
		return
	}

	// Return success with email
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"email":  email,
		"status": "valid",
	})
}

// DataHandler handles data-related endpoints
type DataHandler struct {
	dataService *DataService
	authService *AuthService
	hub         *Hub
}

func NewDataHandler(dataService *DataService, authService *AuthService, hub *Hub) *DataHandler {
	return &DataHandler{
		dataService: dataService,
		authService: authService,
		hub:         hub,
	}
}

// Middleware to authenticate requests
func (h *DataHandler) authenticate(r *http.Request) (string, error) {
	// Get token from Authorization header
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return "", fmt.Errorf("missing authorization header")
	}

	// Extract token from Bearer format
	authParts := strings.Split(authHeader, " ")
	if len(authParts) != 2 || authParts[0] != "Bearer" {
		return "", fmt.Errorf("invalid authorization format")
	}

	tokenString := authParts[1]

	// Verify token
	email, err := h.authService.VerifyJWT(tokenString)
	if err != nil {
		return "", fmt.Errorf("invalid token: %w", err)
	}

	return email, nil
}

// GetData retrieves user data without saving client data
func (h *DataHandler) GetData(w http.ResponseWriter, r *http.Request) {
	// Authenticate request
	email, err := h.authenticate(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
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
	// Authenticate request
	email, err := h.authenticate(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	// Parse request body
	var clientData KanbanData
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
	message := WebSocketMessage{
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
	// Get token from query parameter for WebSocket connection
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "Missing token", http.StatusUnauthorized)
		return
	}
	
	// Verify token directly since we can't use h.authenticate which expects Authorization header
	email, err := h.authService.VerifyJWT(token)
	if err != nil {
		http.Error(w, "Invalid token", http.StatusUnauthorized)
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
	for client := range h.hub.clients {
		if client.email == email {
			log.Printf("Found existing connection for user %s, keeping both connections", email)
			// We're keeping both connections instead of closing the old one
			// This allows a user to have multiple tabs/devices connected
		}
	}

	// Register client in the hub
	client := &Client{
		hub:   h.hub,
		conn:  conn,
		send:  make(chan []byte, 256),
		email: email,
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
func mergeKanbanData(serverData *KanbanData, clientData *KanbanData) *KanbanData {
	result := &KanbanData{
		Columns:             []Column{},
		Tasks:               []Task{},
		UnassignedCollapsed: clientData.UnassignedCollapsed, // Use client preference for UI state
	}

	// Create maps for faster lookups
	serverColumns := make(map[string]Column)
	clientColumns := make(map[string]Column)
	
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
			task.ColumnID = nil // Ensure it has no column ID
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
			task.ColumnID = nil // Ensure it has no column ID
			allClientTaskIDs[task.ID] = true
		}
	}

	// Merge columns - prioritize client columns
	// Add client columns first (they take precedence)
	for _, col := range clientData.Columns {
		result.Columns = append(result.Columns, col)
	}
	
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