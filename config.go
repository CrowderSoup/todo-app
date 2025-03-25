package main

import (
	"bufio"
	"os"
	"strings"
)

// LoadEnv loads environment variables from a .env file
func LoadEnv(filename string) error {
	// Open the .env file
	file, err := os.Open(filename)
	if err != nil {
		return err
	}
	defer file.Close()

	// Read the file line by line
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()

		// Skip empty lines and comments
		if len(line) == 0 || strings.HasPrefix(line, "#") {
			continue
		}

		// Split on the first equals sign
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue // Skip malformed lines
		}

		// Trim spaces and optional quotes from the value
		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])
		value = strings.Trim(value, `"'`)

		// Set the environment variable
		os.Setenv(key, value)
	}

	// Check for scanner errors
	if err := scanner.Err(); err != nil {
		return err
	}

	return nil
}
