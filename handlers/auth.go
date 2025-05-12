package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/CrowderSoup/todo-app/database"
	"github.com/CrowderSoup/todo-app/services"
)

// AuthHandler handles authentication-related endpoints
type AuthHandler struct {
	authService *services.AuthService
	dataService *database.DataService
}

func NewAuthHandler(authService *services.AuthService, dataService *database.DataService) *AuthHandler {
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
