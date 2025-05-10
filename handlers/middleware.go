package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/CrowderSoup/todo-app/services"
)

type contextKey string

const emailContextKey contextKey = "email"

type AuthMiddleware struct {
	authService *services.AuthService
}

func NewAuthMiddleware(authService *services.AuthService) *AuthMiddleware {
	return &AuthMiddleware{
		authService: authService,
	}
}

func (m *AuthMiddleware) Auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Get token from Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "missing authorization header", http.StatusUnauthorized)
			return
		}

		// Extract token from Bearer format
		authParts := strings.Split(authHeader, " ")
		if len(authParts) != 2 || authParts[0] != "Bearer" {
			http.Error(w, "invalid authorization format", http.StatusUnauthorized)
			return
		}

		tokenString := authParts[1]

		// Verify token
		email, err := m.authService.VerifyJWT(tokenString)
		if err != nil {
			http.Error(w, fmt.Sprintf("invalid token: %w", err), http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), emailContextKey, email)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
