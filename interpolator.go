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

// Interpolate replaces all {{key}} tokens in template with the corresponding
// value from vars. If a key is not found in vars the token is left as-is.
// secrets is a set of variable names whose resolved values must be tracked in
// InterpolationResult.UsedSecretValues. Pass an empty map[string]bool{} when
// no secret tracking is required.
// If a secret variable resolves to an empty string it is not tracked.
func Interpolate(template string, vars map[string]string, secrets map[string]bool) InterpolationResult {
	var usedSecrets []string

	interpolated := interpolateRegex.ReplaceAllStringFunc(template, func(match string) string {
		key := interpolateRegex.FindStringSubmatch(match)[1]
		val, ok := vars[key]
		if !ok {
			return match
		}
		if secrets[key] && val != "" {
			usedSecrets = append(usedSecrets, val)
		}
		return val
	})

	if usedSecrets == nil {
		usedSecrets = []string{}
	}

	return InterpolationResult{
		Value:            interpolated,
		UsedSecretValues: usedSecrets,
	}
}
