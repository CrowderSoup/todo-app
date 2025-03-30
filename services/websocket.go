package services

import (
	"bytes"
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer
	maxMessageSize = 1024 * 1024 // 1MB
)

// Client represents a connected WebSocket client
type Client struct {
	Hub   *Hub
	Conn  *websocket.Conn
	Send  chan []byte
	Email string // User identifier
}

// WebSocketMessage is the standard message format for WebSocket communication
type WebSocketMessage struct {
	Type string `json:"type"`
	Data any    `json:"data"`
	User string `json:"user,omitempty"`
}

// ReadPump pumps messages from the WebSocket connection to the hub
func (c *Client) ReadPump() {
	defer func() {
		c.Hub.Unregister(c)
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		// Process incoming message - forward to hub for broadcasting
		// Parse the message to extract user information
		var wsMessage WebSocketMessage
		if err := json.Unmarshal(message, &wsMessage); err != nil {
			log.Printf("Error unmarshalling WebSocket message: %v", err)
			continue
		}

		// Set the user field to the client's email
		wsMessage.User = c.Email

		// Handle ping messages specially
		if wsMessage.Type == "ping" {
			// Reply with a pong directly to this client only
			pongMessage := WebSocketMessage{
				Type: "pong",
				Data: map[string]string{"timestamp": time.Now().Format(time.RFC3339)},
				User: "", // No need to set user for pong
			}

			pongJSON, err := json.Marshal(pongMessage)
			if err == nil {
				c.Send <- pongJSON
			}
			// Don't broadcast ping messages
			continue
		}

		// Marshal the message with the updated user field
		jsonMessage, err := json.Marshal(wsMessage)
		if err != nil {
			log.Printf("Error marshalling WebSocket message: %v", err)
			continue
		}

		log.Printf("Received message from client %s: %s", c.Email, wsMessage.Type)

		// Forward to hub for broadcasting
		c.Hub.broadcast <- jsonMessage
	}
}

// WritePump pumps messages from the hub to the WebSocket connection
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued messages to the current WebSocket message
			n := len(c.Send)
			for i := 0; i < n; i++ {
				w.Write([]byte("\n"))
				w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// Hub maintains the set of active clients and broadcasts messages to the clients
type Hub struct {
	Clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
}

// NewHub creates a new hub instance
func NewHub() *Hub {
	return &Hub{
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		Clients:    make(map[*Client]bool),
	}
}

// Register adds a client to the hub
func (h *Hub) Register(client *Client) {
	h.register <- client
}

// Unregister removes a client from the hub
func (h *Hub) Unregister(client *Client) {
	h.unregister <- client
}

// Broadcast sends a message to all connected clients except the sender
func (h *Hub) Broadcast(message WebSocketMessage, excludeEmail string) {
	// Set the sender's email in the message to enable proper filtering
	message.User = excludeEmail

	jsonMessage, err := json.Marshal(message)
	if err != nil {
		log.Printf("Error marshalling WebSocket message: %v", err)
		return
	}

	h.broadcast <- jsonMessage
}

// Run starts the hub's main loop
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.Clients[client] = true
			log.Printf("Client connected: %s", client.Email)
		case client := <-h.unregister:
			if _, ok := h.Clients[client]; ok {
				delete(h.Clients, client)
				close(client.Send)
				log.Printf("Client disconnected: %s", client.Email)
			}
		case message := <-h.broadcast:
			// Get the user from the message
			var wsMessage WebSocketMessage
			decoder := json.NewDecoder(bytes.NewReader(message))
			if err := decoder.Decode(&wsMessage); err != nil {
				log.Printf("Error decoding message: %v", err)
				continue
			}

			excludeEmail := wsMessage.User
			if excludeEmail == "" {
				log.Printf("Broadcasting message of type '%s' to ALL clients (including sender)", wsMessage.Type)
			} else {
				log.Printf("Broadcasting message of type '%s' from %s to other clients", wsMessage.Type, excludeEmail)
			}

			for client := range h.Clients {
				// If excludeEmail is empty, send to all clients
				// Otherwise skip the sender to avoid echo
				if excludeEmail != "" && client.Email == excludeEmail {
					log.Printf("Skipping sender: %s", client.Email)
					continue
				}

				log.Printf("Sending to client: %s", client.Email)
				select {
				case client.Send <- message:
					// Message sent successfully
				default:
					// Client's send buffer is full, assume disconnected
					log.Printf("Client send buffer full, removing client: %s", client.Email)
					close(client.Send)
					delete(h.Clients, client)
				}
			}
		}
	}
}
