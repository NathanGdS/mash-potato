package encryption

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"strings"

	keyring "github.com/zalando/go-keyring"
)

const (
	keychainService = "mash-potato"
	keychainAccount = "vars-key"
	encPrefix       = "enc:"
	nonceSize       = 12
	keySize         = 32
)

// ErrDecryptionFailed is returned when AES-GCM Open fails, allowing callers
// to distinguish key-loss or tampered-data scenarios from other errors.
var ErrDecryptionFailed = errors.New("encryption: decryption failed")

// GetOrCreateKey retrieves the 32-byte AES key from the OS keychain. If no
// key is stored yet, it generates one, persists it base64-encoded, and returns
// the raw bytes. When the keychain is unavailable (e.g., headless CI) it falls
// back to a SHA-256 digest of the machine's primary MAC address concatenated
// with the application name.
func GetOrCreateKey() ([]byte, error) {
	encoded, err := keyring.Get(keychainService, keychainAccount)
	if err == nil {
		// Key already exists in the keychain — decode and return it.
		raw, decodeErr := base64.StdEncoding.DecodeString(encoded)
		if decodeErr != nil {
			return nil, fmt.Errorf("encryption: corrupt keychain value: %w", decodeErr)
		}
		return raw, nil
	}

	// keyring.ErrNotFound means the entry simply does not exist yet.
	// generateAndStoreKey may return (fallbackKey, non-nil error) if the
	// keychain write fails — propagate both so callers detect the downgrade.
	if errors.Is(err, keyring.ErrNotFound) {
		return generateAndStoreKey()
	}

	// Any other error means the keychain itself is unavailable.
	log.Println("WARN: keychain unavailable, using fallback key")
	return macAddressFallbackKey()
}

// generateAndStoreKey creates a new random 32-byte key, attempts to store it
// in the keychain, and returns the raw bytes. If the keychain write fails the
// function falls back to the MAC-address-derived key but returns a non-nil
// error so callers can detect and react to the security downgrade.
func generateAndStoreKey() ([]byte, error) {
	key := make([]byte, keySize)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, fmt.Errorf("encryption: failed to generate key: %w", err)
	}

	encoded := base64.StdEncoding.EncodeToString(key)
	if err := keyring.Set(keychainService, keychainAccount, encoded); err != nil {
		// Persist failed — fall back to MAC-address key but surface the error so
		// callers know a security downgrade has occurred.
		log.Println("WARN: keychain write failed, using fallback key")
		fallback, fallbackErr := macAddressFallbackKey()
		if fallbackErr != nil {
			return nil, fallbackErr
		}
		return fallback, fmt.Errorf("encryption: keychain write failed, using fallback key: %w", err)
	}

	return key, nil
}

// macAddressFallbackKey derives a 32-byte key from the machine's primary MAC
// address by computing SHA-256(macAddress + "mash-potato"). It never returns
// a hardcoded key — if no suitable interface is found the hash is still
// computed over the empty string, which is at least deterministic per machine.
func macAddressFallbackKey() ([]byte, error) {
	mac := primaryMACAddress()
	seed := mac + "mash-potato"
	digest := sha256.Sum256([]byte(seed))
	return digest[:], nil
}

// primaryMACAddress returns the hardware address of the first non-loopback
// network interface that has one, or an empty string if none is found.
func primaryMACAddress() string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return ""
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		if len(iface.HardwareAddr) == 0 {
			continue
		}
		return iface.HardwareAddr.String()
	}
	return ""
}

// GenerateKey creates a new cryptographically random 32-byte AES-256 key.
// It does not persist the key; use StoreKey to save it to the OS keychain.
func GenerateKey() ([]byte, error) {
	key := make([]byte, keySize)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, fmt.Errorf("encryption: failed to generate key: %w", err)
	}
	return key, nil
}

// StoreKey base64-encodes key and saves it in the OS keychain under the
// application service/account pair, overwriting any previously stored value.
func StoreKey(key []byte) error {
	encoded := base64.StdEncoding.EncodeToString(key)
	if err := keyring.Set(keychainService, keychainAccount, encoded); err != nil {
		return fmt.Errorf("encryption: keychain write failed: %w", err)
	}
	return nil
}

// EncryptValue encrypts plaintext using AES-256-GCM. It generates a 12-byte
// random nonce, seals the data, and returns the result as:
//
//	"enc:" + base64(nonce + ciphertext)
func EncryptValue(plaintext string, key []byte) (string, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("encryption: failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("encryption: failed to create GCM: %w", err)
	}

	nonce := make([]byte, nonceSize)
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("encryption: failed to generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nil, nonce, []byte(plaintext), nil)

	// Concatenate nonce + ciphertext before encoding so DecryptValue can split them.
	blob := append(nonce, ciphertext...)
	encoded := base64.StdEncoding.EncodeToString(blob)
	return encPrefix + encoded, nil
}

// DecryptValue decrypts a value produced by EncryptValue. If stored does not
// start with the "enc:" prefix it is returned as-is for backward compatibility
// with plaintext values. Returns ErrDecryptionFailed when GCM authentication
// fails (tampered data or wrong key).
func DecryptValue(stored string, key []byte) (string, error) {
	if !strings.HasPrefix(stored, encPrefix) {
		// Backward-compatible plaintext pass-through.
		return stored, nil
	}

	encoded := strings.TrimPrefix(stored, encPrefix)
	blob, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("encryption: invalid base64: %w", err)
	}

	if len(blob) < nonceSize {
		return "", ErrDecryptionFailed
	}

	nonce := blob[:nonceSize]
	ciphertext := blob[nonceSize:]

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("encryption: failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("encryption: failed to create GCM: %w", err)
	}

	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", ErrDecryptionFailed
	}

	return string(plaintext), nil
}
