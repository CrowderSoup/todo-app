# Kanban Todo App with Authentication

This todo app features a Kanban-style board with drag-and-drop task management, now enhanced with user authentication using email magic links and data synchronization with a SQLite database.

## Features

- Kanban board with drag-and-drop functionality
- Collapsible unassigned tasks section
- Task prioritization (high, medium, low)
- Due dates with visual indicators for overdue and soon-due tasks
- User authentication with magic link emails
- Data synchronization between client and server
- Go backend with SQLite database

## Technologies

- Frontend: Vanilla JavaScript, CSS, HTML
- Backend: Go (Golang) with SQLite
- Authentication: Email magic links + JWT tokens

## Setup and Running

### Prerequisites

- Go 1.21 or higher
- SQLite3
- SMTP server for sending emails (optional for development)

### Environment Variables

Create a `.env` file in the project root with the following variables:

```
PORT=8080
JWT_SECRET=your_secret_key_here

# SMTP Configuration (optional for development)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=your_username
SMTP_PASSWORD=your_password
SMTP_FROM=noreply@example.com
```

### Running the Application

1. Install Go dependencies:
   ```
   go mod download
   ```

2. Build and run the server:
   ```
   go run *.go
   ```

3. Access the application in your browser:
   ```
   http://localhost:8080
   ```

### Development Notes

- For development, magic links are displayed in the UI and console
- The database file `todo.db` is created automatically on first run
- Data is synced between client and server every 30 seconds when authenticated

## Screenshot

![Screenshot](./screenshot.jpg)
