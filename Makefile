.PHONY: dev build test test-go test-frontend lint install clean generate

# Start development mode (hot-reload)
dev:
	wails dev

# Build production binary
build:
	wails build

# Run all tests
test: test-go test-frontend

# Run Go tests
test-go:
	go test ./...

# Run frontend tests
test-frontend:
	cd frontend && npm run test

# Watch frontend tests
test-frontend-watch:
	cd frontend && npm run test:watch

# Lint Go code
lint:
	go vet ./...

# Install frontend dependencies
install:
	cd frontend && npm install

# Regenerate Wails JS bindings
generate:
	wails generate module

# Build Go packages (without Wails)
build-go:
	go build ./...

# Clean build artifacts
clean:
	rm -rf build/bin
	rm -rf frontend/dist
