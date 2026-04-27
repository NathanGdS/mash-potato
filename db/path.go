package db

import (
	"fmt"
	"strings"
)

// ResolveRequestByPath resolves a slash-separated path to a request ID.
// Path format: "collection/[folder.../]request" (case-sensitive).
// Returns the first matching request ID ordered by sort_order then created_at.
func ResolveRequestByPath(path string) (string, error) {
	segments := strings.Split(path, "/")
	if len(segments) < 2 {
		return "", fmt.Errorf("ResolveRequestByPath: path %q must be at least collection/request", path)
	}

	collectionName := segments[0]
	requestName := segments[len(segments)-1]
	folderNames := segments[1 : len(segments)-1]

	var collectionID string
	if err := DB.QueryRow(
		`SELECT id FROM collections WHERE name = ? ORDER BY created_at ASC LIMIT 1`,
		collectionName,
	).Scan(&collectionID); err != nil {
		return "", fmt.Errorf("ResolveRequestByPath: collection %q not found", collectionName)
	}

	parentFolderID := ""
	for _, folderName := range folderNames {
		var folderID string
		var err error
		if parentFolderID == "" {
			err = DB.QueryRow(
				`SELECT id FROM folders WHERE collection_id = ? AND name = ? AND parent_folder_id IS NULL ORDER BY created_at ASC LIMIT 1`,
				collectionID, folderName,
			).Scan(&folderID)
		} else {
			err = DB.QueryRow(
				`SELECT id FROM folders WHERE collection_id = ? AND name = ? AND parent_folder_id = ? ORDER BY created_at ASC LIMIT 1`,
				collectionID, folderName, parentFolderID,
			).Scan(&folderID)
		}
		if err != nil {
			return "", fmt.Errorf("ResolveRequestByPath: folder %q not found in path %q", folderName, path)
		}
		parentFolderID = folderID
	}

	var requestID string
	var err error
	if parentFolderID == "" {
		err = DB.QueryRow(
			`SELECT id FROM requests WHERE collection_id = ? AND name = ? AND folder_id IS NULL ORDER BY COALESCE(sort_order,0) ASC, created_at ASC LIMIT 1`,
			collectionID, requestName,
		).Scan(&requestID)
	} else {
		err = DB.QueryRow(
			`SELECT id FROM requests WHERE collection_id = ? AND name = ? AND folder_id = ? ORDER BY COALESCE(sort_order,0) ASC, created_at ASC LIMIT 1`,
			collectionID, requestName, parentFolderID,
		).Scan(&requestID)
	}
	if err != nil {
		return "", fmt.Errorf("ResolveRequestByPath: request %q not found in path %q", requestName, path)
	}

	return requestID, nil
}
