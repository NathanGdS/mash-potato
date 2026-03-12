package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Item struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

var (
	items  = map[int]Item{}
	nextID = 1
	mu     sync.Mutex
)

func logRequest(r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	r.Body = io.NopCloser(bytes.NewBuffer(body))

	fmt.Println("─────────────────────────────────────────")
	fmt.Printf("  %s  %s %s\n", time.Now().Format("2006-01-02 15:04:05"), r.Method, r.URL.RequestURI())
	fmt.Printf("  Host:       %s\n", r.Host)
	fmt.Printf("  RemoteAddr: %s\n", r.RemoteAddr)
	fmt.Printf("  Proto:      %s\n", r.Proto)

	// Query params
	if len(r.URL.Query()) > 0 {
		fmt.Println("  Query Params:")
		keys := make([]string, 0, len(r.URL.Query()))
		for k := range r.URL.Query() {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			fmt.Printf("    %s = %s\n", k, strings.Join(r.URL.Query()[k], ", "))
		}
	}

	// Headers
	fmt.Println("  Headers:")
	headerKeys := make([]string, 0, len(r.Header))
	for k := range r.Header {
		headerKeys = append(headerKeys, k)
	}
	sort.Strings(headerKeys)
	for _, k := range headerKeys {
		fmt.Printf("    %s: %s\n", k, strings.Join(r.Header[k], ", "))
	}

	// Body
	if len(body) > 0 {
		fmt.Printf("  Body: %s\n", string(body))
	}

	fmt.Println("─────────────────────────────────────────")
}

func main() {
	http.HandleFunc("/items", handleItems)
	http.HandleFunc("/items/", handleItem)
	fmt.Println("Listening on :3000")
	http.ListenAndServe(":3000", nil)
}

func handleItems(w http.ResponseWriter, r *http.Request) {
	logRequest(r)
	w.Header().Set("Content-Type", "application/json")
	switch r.Method {
	case http.MethodGet:
		mu.Lock()
		list := make([]Item, 0, len(items))
		for _, v := range items {
			list = append(list, v)
		}
		mu.Unlock()
		json.NewEncoder(w).Encode(list)

	case http.MethodPost:
		var item Item
		if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		mu.Lock()
		item.ID = nextID
		nextID++
		items[item.ID] = item
		mu.Unlock()
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(item)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleItem(w http.ResponseWriter, r *http.Request) {
	logRequest(r)
	w.Header().Set("Content-Type", "application/json")
	idStr := strings.TrimPrefix(r.URL.Path, "/items/")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		mu.Lock()
		item, ok := items[id]
		mu.Unlock()
		if !ok {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode(item)

	case http.MethodPut:
		var item Item
		if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		mu.Lock()
		_, ok := items[id]
		if ok {
			item.ID = id
			items[id] = item
		}
		mu.Unlock()
		if !ok {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode(item)

	case http.MethodDelete:
		mu.Lock()
		_, ok := items[id]
		if ok {
			delete(items, id)
		}
		mu.Unlock()
		if !ok {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
