package services

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"log"
	"net/smtp"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type AuthService struct {
	tokens     map[string]string // Map of token -> email
	jwtSecret  []byte
	smtpConfig SMTPConfig
}

type SMTPConfig struct {
	Host     string
	Port     string
	Username string
	Password string
	From     string
}

func NewAuthService() *AuthService {
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "your-default-secret-key-change-in-production"
	}

	return &AuthService{
		tokens:    make(map[string]string),
		jwtSecret: []byte(jwtSecret),
		smtpConfig: SMTPConfig{
			Host:     os.Getenv("SMTP_HOST"),
			Port:     os.Getenv("SMTP_PORT"),
			Username: os.Getenv("SMTP_USERNAME"),
			Password: os.Getenv("SMTP_PASSWORD"),
			From:     os.Getenv("SMTP_FROM"),
		},
	}
}

// GenerateMagicLink creates a one-time token and email magic link
func (s *AuthService) GenerateMagicLink(email string, baseURL string) (string, error) {
	// Generate a random token
	token, err := s.generateSecureToken(32)
	if err != nil {
		return "", fmt.Errorf("failed to generate token: %w", err)
	}

	// Store the token -> email mapping
	s.tokens[token] = email

	// Create the magic link URL
	magicLink := fmt.Sprintf("%s/api/auth/magic-link?token=%s", baseURL, token)

	// Send the email (if SMTP is configured)
	if s.smtpConfig.Host != "" {
		if err := s.sendMagicLinkEmail(email, magicLink); err != nil {
			log.Printf("Warning: Failed to send email: %v", err)
		}
	}

	// For development, return the magic link directly
	return magicLink, nil
}

// VerifyMagicLinkToken verifies a one-time token and returns the associated email
func (s *AuthService) VerifyMagicLinkToken(token string) (string, error) {
	email, exists := s.tokens[token]
	if !exists {
		return "", errors.New("invalid or expired token")
	}

	// Remove the token (one-time use)
	delete(s.tokens, token)

	return email, nil
}

// CreateJWT generates a JWT token for a user
func (s *AuthService) CreateJWT(email string) (string, error) {
	// Create token with claims
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"email": email,
		"exp":   time.Now().Add(time.Hour * 24 * 7).Unix(), // 7 days
	})

	// Sign the token
	tokenString, err := token.SignedString(s.jwtSecret)
	if err != nil {
		return "", fmt.Errorf("failed to sign token: %w", err)
	}

	return tokenString, nil
}

// VerifyJWT verifies a JWT token and returns the email
func (s *AuthService) VerifyJWT(tokenString string) (string, error) {
	// Parse the token
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Validate signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return s.jwtSecret, nil
	})
	if err != nil {
		return "", fmt.Errorf("failed to parse token: %w", err)
	}

	// Check if token is valid
	if !token.Valid {
		return "", errors.New("invalid token")
	}

	// Extract claims
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", errors.New("invalid token claims")
	}

	// Get email from claims
	email, ok := claims["email"].(string)
	if !ok {
		return "", errors.New("email claim missing")
	}

	return email, nil
}

// Helper to generate a secure random token
func (s *AuthService) generateSecureToken(length int) (string, error) {
	b := make([]byte, length)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

// Helper to send a magic link email
func (s *AuthService) sendMagicLinkEmail(to, magicLink string) error {
	// Skip if SMTP not configured
	if s.smtpConfig.Host == "" || s.smtpConfig.Port == "" ||
		s.smtpConfig.Username == "" || s.smtpConfig.Password == "" {
		return errors.New("SMTP not fully configured")
	}

	// Set up authentication
	auth := smtp.PlainAuth("", s.smtpConfig.Username, s.smtpConfig.Password, s.smtpConfig.Host)

	// Prepare email content
	from := s.smtpConfig.From
	if from == "" {
		from = s.smtpConfig.Username
	}

	subject := "Your Login Link for Todo App"
	body := fmt.Sprintf("Click the link below to log in to your Todo App:\n\n%s\n\nIf you didn't request this link, you can safely ignore this email.", magicLink)

	message := fmt.Sprintf("From: %s\nTo: %s\nSubject: %s\n\n%s", from, to, subject, body)

	// Send email
	addr := fmt.Sprintf("%s:%s", s.smtpConfig.Host, s.smtpConfig.Port)
	err := smtp.SendMail(addr, auth, from, []string{to}, []byte(message))
	if err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	return nil
}
