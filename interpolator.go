package main

import (
	"regexp"
)

// interpolateRegex matches {{variable_name}} tokens.
var interpolateRegex = regexp.MustCompile(`\{\{([^}]+)\}\}`)

// InterpolationResult holds the interpolated string and the plaintext values
// of any secret variables that were substituted during interpolation.
// UsedSecretValues is used by callers (e.g. the HTTP client) to redact those
// values from logs and request history.
type InterpolationResult struct {
	Value            string
	UsedSecretValues []string
}

// Interpolate replaces all {{key}} tokens in template with values from vars or
// runVars. Env vars (vars) take precedence over run vars for the same name.
// Tokens matching {{run.<key>}} are resolved from runVars["<key>"]. Pass nil
// for runVars when run vars are not applicable. Unresolved tokens are left as-is.
func Interpolate(template string, vars map[string]string, secrets map[string]bool, runVars map[string]string) InterpolationResult {
	var usedSecrets []string

	interpolated := interpolateRegex.ReplaceAllStringFunc(template, func(match string) string {
		key := interpolateRegex.FindStringSubmatch(match)[1]

		// Env vars resolve plain {{key}} tokens (highest precedence).
		if val, ok := vars[key]; ok {
			if secrets[key] && val != "" {
				usedSecrets = append(usedSecrets, val)
			}
			return val
		}

		// Run vars resolve {{run.<key>}} tokens.
		const runPrefix = "run."
		if len(key) > len(runPrefix) && key[:len(runPrefix)] == runPrefix {
			runKey := key[len(runPrefix):]
			if val, ok := runVars[runKey]; ok {
				return val
			}
		}

		return match
	})

	if usedSecrets == nil {
		usedSecrets = []string{}
	}

	return InterpolationResult{
		Value:            interpolated,
		UsedSecretValues: usedSecrets,
	}
}
