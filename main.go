package main

import (
	"embed"
	"log"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"mash-potato/db"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Resolve database path in user data directory.
	dataDir, err := os.UserConfigDir()
	if err != nil {
		log.Fatalf("cannot find user config dir: %v", err)
	}
	appDataDir := filepath.Join(dataDir, "mash-potato")
	if err := os.MkdirAll(appDataDir, 0755); err != nil {
		log.Fatalf("cannot create app data dir: %v", err)
	}
	dbPath := filepath.Join(appDataDir, "mash-potato.db")

	// Initialise SQLite.
	if err := db.Init(dbPath); err != nil {
		log.Fatalf("db init failed: %v", err)
	}

	app := newApp()

	if err := wails.Run(&options.App{
		Title:  "Mash Potato",
		Width:  1280,
		Height: 800,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop:     true,
			DisableWebViewDrop: true,
		},
		Bind: []interface{}{
			app,
		},
	}); err != nil {
		log.Fatalf("wails run failed: %v", err)
	}
}
