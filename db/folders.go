package db

import (
	"database/sql"
	"fmt"
	"time"
)

// Folder mirrors the folders table row.
type Folder struct {
	ID             string    `json:"id"`
	CollectionID   string    `json:"collection_id"`
	ParentFolderID *string   `json:"parent_folder_id"`
	Name           string    `json:"name"`
	CreatedAt      time.Time `json:"created_at"`
}

// InsertFolder persists a new folder row and returns it.
// parentFolderID may be empty string to indicate a root-level folder.
func InsertFolder(id, collectionID, parentFolderID, name string) (Folder, error) {
	now := time.Now().UTC()
	var pfID *string
	if parentFolderID != "" {
		pfID = &parentFolderID
	}
	_, err := DB.Exec(
		`INSERT INTO folders (id, collection_id, parent_folder_id, name, created_at)
		 VALUES (?, ?, ?, ?, ?)`,
		id, collectionID, nullableString(parentFolderID), name, now.Format(time.RFC3339),
	)
	if err != nil {
		return Folder{}, fmt.Errorf("InsertFolder: %w", err)
	}
	return Folder{
		ID:             id,
		CollectionID:   collectionID,
		ParentFolderID: pfID,
		Name:           name,
		CreatedAt:      now,
	}, nil
}

// nullableString converts an empty string to nil for SQL NULL insertion.
func nullableString(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// RenameFolder updates the name of a folder.
func RenameFolder(id, name string) error {
	res, err := DB.Exec(`UPDATE folders SET name = ? WHERE id = ?`, name, id)
	if err != nil {
		return fmt.Errorf("RenameFolder: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("RenameFolder: no folder with id %s", id)
	}
	return nil
}

// DeleteFolder removes a folder. Requests inside the folder are moved to root
// (folder_id set to NULL). Child folders are deleted recursively by the DB
// cascade, but since we want requests preserved we handle requests first.
func DeleteFolder(id string) error {
	// Move all direct requests in this folder to root (no folder).
	if _, err := DB.Exec(`UPDATE requests SET folder_id = NULL WHERE folder_id = ?`, id); err != nil {
		return fmt.Errorf("DeleteFolder: move requests: %w", err)
	}
	// Recursively handle child folders: move their requests up too.
	if err := moveChildRequestsToRoot(id); err != nil {
		return err
	}
	// Now delete the folder (CASCADE will delete child folders in DB).
	if _, err := DB.Exec(`DELETE FROM folders WHERE id = ?`, id); err != nil {
		return fmt.Errorf("DeleteFolder: %w", err)
	}
	return nil
}

// moveChildRequestsToRoot traverses the folder tree rooted at parentID and
// moves all requests to root (folder_id = NULL).
func moveChildRequestsToRoot(parentID string) error {
	rows, err := DB.Query(`SELECT id FROM folders WHERE parent_folder_id = ?`, parentID)
	if err != nil {
		return fmt.Errorf("moveChildRequestsToRoot query: %w", err)
	}
	defer rows.Close()

	var childIDs []string
	for rows.Next() {
		var cid string
		if err := rows.Scan(&cid); err != nil {
			return fmt.Errorf("moveChildRequestsToRoot scan: %w", err)
		}
		childIDs = append(childIDs, cid)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("moveChildRequestsToRoot rows: %w", err)
	}

	for _, cid := range childIDs {
		if _, err := DB.Exec(`UPDATE requests SET folder_id = NULL WHERE folder_id = ?`, cid); err != nil {
			return fmt.Errorf("moveChildRequestsToRoot move requests: %w", err)
		}
		if err := moveChildRequestsToRoot(cid); err != nil {
			return err
		}
	}
	return nil
}

// ListFolders returns all folders for a collection, ordered by creation time.
func ListFolders(collectionID string) ([]Folder, error) {
	rows, err := DB.Query(
		`SELECT id, collection_id, parent_folder_id, name, created_at
		   FROM folders
		  WHERE collection_id = ?
		  ORDER BY created_at ASC`,
		collectionID,
	)
	if err != nil {
		return nil, fmt.Errorf("ListFolders: %w", err)
	}
	defer rows.Close()

	var folders []Folder
	for rows.Next() {
		var f Folder
		var createdAtStr string
		var pfID sql.NullString
		if err := rows.Scan(&f.ID, &f.CollectionID, &pfID, &f.Name, &createdAtStr); err != nil {
			return nil, fmt.Errorf("ListFolders scan: %w", err)
		}
		if pfID.Valid {
			f.ParentFolderID = &pfID.String
		}
		f.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
		folders = append(folders, f)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ListFolders rows: %w", err)
	}
	return folders, nil
}

// MoveRequest updates the folder_id of a request.
// Pass folderID = "" to move to root (no folder).
// Also recalculates sort_order to place the request at the end of the destination folder.
func MoveRequest(requestID, folderID string) error {
	var maxOrder int
	if folderID == "" {
		err := DB.QueryRow(
			`SELECT COALESCE(MAX(sort_order), 0) FROM requests WHERE folder_id IS NULL`,
		).Scan(&maxOrder)
		if err != nil {
			return fmt.Errorf("MoveRequest: %w", err)
		}
	} else {
		err := DB.QueryRow(
			`SELECT COALESCE(MAX(sort_order), 0) FROM requests WHERE folder_id = ?`,
			folderID,
		).Scan(&maxOrder)
		if err != nil {
			return fmt.Errorf("MoveRequest: %w", err)
		}
	}
	res, err := DB.Exec(
		`UPDATE requests SET folder_id = ?, sort_order = ? WHERE id = ?`,
		nullableString(folderID), maxOrder+1, requestID,
	)
	if err != nil {
		return fmt.Errorf("MoveRequest: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("MoveRequest: no request with id %s", requestID)
	}
	return nil
}

// MoveRequestToCollection moves a request to a different collection and optionally a folder.
// Pass folderID = "" to place at root level of the target collection.
func MoveRequestToCollection(requestID, targetCollectionID, targetFolderID string) error {
	var maxOrder int
	if targetFolderID == "" {
		err := DB.QueryRow(
			`SELECT COALESCE(MAX(sort_order), 0) FROM requests WHERE collection_id = ? AND folder_id IS NULL`,
			targetCollectionID,
		).Scan(&maxOrder)
		if err != nil {
			return fmt.Errorf("MoveRequestToCollection: %w", err)
		}
	} else {
		err := DB.QueryRow(
			`SELECT COALESCE(MAX(sort_order), 0) FROM requests WHERE collection_id = ? AND folder_id = ?`,
			targetCollectionID, targetFolderID,
		).Scan(&maxOrder)
		if err != nil {
			return fmt.Errorf("MoveRequestToCollection: %w", err)
		}
	}
	res, err := DB.Exec(
		`UPDATE requests SET collection_id = ?, folder_id = ?, sort_order = ? WHERE id = ?`,
		targetCollectionID, nullableString(targetFolderID), maxOrder+1, requestID,
	)
	if err != nil {
		return fmt.Errorf("MoveRequestToCollection: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("MoveRequestToCollection: no request with id %s", requestID)
	}
	return nil
}
