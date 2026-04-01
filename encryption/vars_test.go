package encryption

import (
	"encoding/base64"
	"errors"
	"strings"
	"testing"
)

// testKey returns a valid 32-byte AES key for tests. Tests must not call
// GetOrCreateKey so that the suite remains hermetic and has no OS dependencies.
func testKey() []byte {
	key := make([]byte, keySize)
	for i := range key {
		key[i] = byte(i + 1)
	}
	return key
}

// TestEncryptDecryptRoundTrip verifies that EncryptValue followed by
// DecryptValue recovers the original plaintext exactly.
func TestEncryptDecryptRoundTrip(t *testing.T) {
	key := testKey()
	plaintext := "super-secret-value"

	encrypted, err := EncryptValue(plaintext, key)
	if err != nil {
		t.Fatalf("EncryptValue returned unexpected error: %v", err)
	}

	if !strings.HasPrefix(encrypted, encPrefix) {
		t.Fatalf("encrypted value missing %q prefix, got: %s", encPrefix, encrypted)
	}

	decrypted, err := DecryptValue(encrypted, key)
	if err != nil {
		t.Fatalf("DecryptValue returned unexpected error: %v", err)
	}

	if decrypted != plaintext {
		t.Errorf("round-trip mismatch: got %q, want %q", decrypted, plaintext)
	}
}

// TestEncryptProducesUniqueCiphertexts verifies that two calls with the same
// plaintext produce different ciphertexts (random nonce).
func TestEncryptProducesUniqueCiphertexts(t *testing.T) {
	key := testKey()
	plaintext := "same-value"

	enc1, err := EncryptValue(plaintext, key)
	if err != nil {
		t.Fatalf("first EncryptValue error: %v", err)
	}

	enc2, err := EncryptValue(plaintext, key)
	if err != nil {
		t.Fatalf("second EncryptValue error: %v", err)
	}

	if enc1 == enc2 {
		t.Error("expected distinct ciphertexts for the same plaintext due to random nonces")
	}
}

// TestPlaintextPassThrough verifies backward compatibility: values that do not
// carry the "enc:" prefix are returned unchanged without error.
func TestPlaintextPassThrough(t *testing.T) {
	key := testKey()
	plaintext := "legacy-plain-value"

	result, err := DecryptValue(plaintext, key)
	if err != nil {
		t.Fatalf("DecryptValue returned unexpected error for plaintext: %v", err)
	}

	if result != plaintext {
		t.Errorf("pass-through mismatch: got %q, want %q", result, plaintext)
	}
}

// TestEmptyPlaintextPassThrough verifies that an empty string without the
// prefix is also passed through without error.
func TestEmptyPlaintextPassThrough(t *testing.T) {
	key := testKey()

	result, err := DecryptValue("", key)
	if err != nil {
		t.Fatalf("DecryptValue returned unexpected error for empty string: %v", err)
	}

	if result != "" {
		t.Errorf("expected empty string, got %q", result)
	}
}

// TestTamperedCiphertextReturnsErrDecryptionFailed verifies that modifying the
// ciphertext causes DecryptValue to return ErrDecryptionFailed, not a generic
// error.
func TestTamperedCiphertextReturnsErrDecryptionFailed(t *testing.T) {
	key := testKey()
	plaintext := "value-to-tamper"

	encrypted, err := EncryptValue(plaintext, key)
	if err != nil {
		t.Fatalf("EncryptValue error: %v", err)
	}

	// Decode the base64 payload, flip a byte inside the ciphertext region
	// (past the nonce), then re-encode. This guarantees valid base64 with an
	// authentic-looking but corrupted ciphertext that GCM will reject.
	encoded := strings.TrimPrefix(encrypted, encPrefix)
	blob, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatalf("base64 decode error during tamper setup: %v", err)
	}

	// Flip a byte in the ciphertext section (after the 12-byte nonce).
	blob[nonceSize] ^= 0xFF

	tampered := encPrefix + base64.StdEncoding.EncodeToString(blob)

	_, err = DecryptValue(tampered, key)
	if err == nil {
		t.Fatal("expected an error for tampered ciphertext, got nil")
	}

	if !errors.Is(err, ErrDecryptionFailed) {
		t.Errorf("expected ErrDecryptionFailed, got: %v", err)
	}
}

// TestWrongKeyReturnsErrDecryptionFailed verifies that decrypting with a
// different key returns ErrDecryptionFailed.
func TestWrongKeyReturnsErrDecryptionFailed(t *testing.T) {
	key := testKey()
	wrongKey := make([]byte, keySize)
	for i := range wrongKey {
		wrongKey[i] = 0xFF
	}

	encrypted, err := EncryptValue("secret", key)
	if err != nil {
		t.Fatalf("EncryptValue error: %v", err)
	}

	_, err = DecryptValue(encrypted, wrongKey)
	if err == nil {
		t.Fatal("expected an error when decrypting with wrong key, got nil")
	}

	if !errors.Is(err, ErrDecryptionFailed) {
		t.Errorf("expected ErrDecryptionFailed, got: %v", err)
	}
}

// TestMACAddressFallbackKey verifies that macAddressFallbackKey returns exactly
// 32 bytes and is deterministic (same result on two calls).
func TestMACAddressFallbackKey(t *testing.T) {
	key1, err := macAddressFallbackKey()
	if err != nil {
		t.Fatalf("macAddressFallbackKey error: %v", err)
	}

	if len(key1) != keySize {
		t.Errorf("expected key length %d, got %d", keySize, len(key1))
	}

	key2, err := macAddressFallbackKey()
	if err != nil {
		t.Fatalf("second macAddressFallbackKey error: %v", err)
	}

	for i := range key1 {
		if key1[i] != key2[i] {
			t.Error("macAddressFallbackKey is not deterministic across two calls")
			break
		}
	}
}

// TestEncryptDecryptRoundTripWithFallbackKey verifies the full round-trip
// works when using the MAC-address-derived fallback key.
func TestEncryptDecryptRoundTripWithFallbackKey(t *testing.T) {
	key, err := macAddressFallbackKey()
	if err != nil {
		t.Fatalf("macAddressFallbackKey error: %v", err)
	}

	plaintext := "value-encrypted-with-fallback-key"

	encrypted, err := EncryptValue(plaintext, key)
	if err != nil {
		t.Fatalf("EncryptValue error: %v", err)
	}

	decrypted, err := DecryptValue(encrypted, key)
	if err != nil {
		t.Fatalf("DecryptValue error: %v", err)
	}

	if decrypted != plaintext {
		t.Errorf("round-trip with fallback key mismatch: got %q, want %q", decrypted, plaintext)
	}
}
