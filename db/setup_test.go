package db

import (
	"os"
	"testing"
)

func TestMain(m *testing.M) {
	if err := Init(":memory:"); err != nil {
		panic("failed to init test DB: " + err.Error())
	}
	defer DB.Close()
	os.Exit(m.Run())
}

// clearTables truncates all tables to isolate each test.
func clearTables() {
	DB.Exec("DELETE FROM environment_variables")
	DB.Exec("DELETE FROM requests")
	DB.Exec("DELETE FROM collections")
	DB.Exec("DELETE FROM environments")
	DB.Exec("DELETE FROM settings")
}
