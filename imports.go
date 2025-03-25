package main

// This file ensures that all functionality is included when using "go run main.go"
// It doesn't contain any executable code, just imports.

import (
	_ "fmt"
	_ "log"
	_ "net/http"
	_ "os"
	_ "time"
	_ "database/sql"
	
	_ "github.com/gorilla/mux"
	_ "github.com/rs/cors"
	_ "github.com/mattn/go-sqlite3"
	_ "github.com/golang-jwt/jwt/v5"
	_ "github.com/gorilla/websocket"
)