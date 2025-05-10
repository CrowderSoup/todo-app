package database

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"

	_ "github.com/mattn/go-sqlite3"
)

func InitDB() (*sql.DB, error) {
	db, err := sql.Open("sqlite3", "./todo.db")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Create users table
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS users (
		email TEXT PRIMARY KEY,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return nil, fmt.Errorf("failed to create users table: %w", err)
	}

	// Create data table (will store JSON data for each user)
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS user_data (
		email TEXT PRIMARY KEY,
		data TEXT NOT NULL,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (email) REFERENCES users(email)
	)`)
	if err != nil {
		return nil, fmt.Errorf("failed to create user_data table: %w", err)
	}

	log.Println("Database initialized successfully")
	return db, nil
}

// DataService handles database operations for user data
type DataService struct {
	db *sql.DB
}

func NewDataService(db *sql.DB) *DataService {
	return &DataService{db: db}
}

// GetUserData retrieves a user's kanban data
func (s *DataService) GetUserData(email string) (*KanbanData, error) {
	row := s.db.QueryRow("SELECT data FROM user_data WHERE email = ?", email)

	var dataStr string
	err := row.Scan(&dataStr)
	if err == sql.ErrNoRows {
		// Return empty data if user has no data yet
		return &KanbanData{
			Columns:             []Column{},
			Tasks:               []Task{},
			UnassignedCollapsed: true,
		}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query user data: %w", err)
	}

	var data KanbanData
	if err := json.Unmarshal([]byte(dataStr), &data); err != nil {
		return nil, fmt.Errorf("failed to unmarshal user data: %w", err)
	}

	return &data, nil
}

// SaveUserData saves or updates a user's kanban data
func (s *DataService) SaveUserData(email string, data *KanbanData) error {
	dataJSON, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal user data: %w", err)
	}

	// Begin transaction
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Check if user exists, create if not
	row := tx.QueryRow("SELECT email FROM users WHERE email = ?", email)
	var existingEmail string
	err = row.Scan(&existingEmail)
	if err == sql.ErrNoRows {
		// Create user
		_, err = tx.Exec("INSERT INTO users (email) VALUES (?)", email)
		if err != nil {
			return fmt.Errorf("failed to insert user: %w", err)
		}
	} else if err != nil {
		return fmt.Errorf("failed to query user: %w", err)
	}

	// Upsert user data
	_, err = tx.Exec(`
		INSERT INTO user_data (email, data, updated_at) 
		VALUES (?, ?, CURRENT_TIMESTAMP) 
		ON CONFLICT(email) DO UPDATE SET 
			data = ?, 
			updated_at = CURRENT_TIMESTAMP
	`, email, string(dataJSON), string(dataJSON))
	if err != nil {
		return fmt.Errorf("failed to upsert user data: %w", err)
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}
