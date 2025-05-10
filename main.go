package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/CrowderSoup/todo-app/database"
	"github.com/CrowderSoup/todo-app/handlers"
	"github.com/CrowderSoup/todo-app/services"
	"github.com/gorilla/mux"
	_ "github.com/mattn/go-sqlite3"
	"github.com/rs/cors"
)

func main() {
	// Load environment variables from .env file
	err := services.LoadEnv(".env")
	if err != nil {
		fmt.Printf("Error loading .env file: %v\n", err)
		return
	}

	// Initialize database
	db, err := database.InitDB()
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// Initialize services
	authService := services.NewAuthService()
	dataService := database.NewDataService(db)

	// Initialize WebSocket hub
	hub := services.NewHub()
	go hub.Run()

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(authService, dataService)
	dataHandler := handlers.NewDataHandler(dataService, authService, hub)

	// Setup router
	r := mux.NewRouter()

	// Auth routes
	r.HandleFunc("/api/auth/login", authHandler.Login).Methods("POST")
	r.HandleFunc("/api/auth/verify", authHandler.VerifyToken).Methods("GET")
	r.HandleFunc("/api/auth/magic-link", authHandler.HandleMagicLink).Methods("GET")

	// Data routes (protected)
	r.HandleFunc("/api/data/sync", dataHandler.SyncData).Methods("POST")
	r.HandleFunc("/api/data/get", dataHandler.GetData).Methods("GET")

	// WebSocket route for real-time updates
	r.HandleFunc("/api/ws", dataHandler.HandleWebSocket)

	// Static file server for frontend
	r.PathPrefix("/").Handler(http.FileServer(http.Dir("./")))

	// Setup CORS
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"}, // In production, change to your domain
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
	})

	// Get port from environment or use default
	port := os.Getenv("PORT")
	if port == "" {
		port = "3001"
	}

	// Start server
	server := &http.Server{
		Addr:         ":" + port,
		Handler:      c.Handler(r),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("Server starting on port %s", port)
	log.Fatal(server.ListenAndServe())
}
