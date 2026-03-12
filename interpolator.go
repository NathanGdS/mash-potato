package main

import (
	"regexp"
)

// interpolateRegex matches {{variable_name}} tokens.
var interpolateRegex = regexp.MustCompile(`\{\{([^}]+)\}\}`)

// Interpolate replaces all {{key}} tokens in template with the corresponding
// value from vars. If a key is not found in vars the token is left as-is.
func Interpolate(template string, vars map[string]string) string {
	return interpolateRegex.ReplaceAllStringFunc(template, func(match string) string {
		// Extract the key from the match (strip {{ and }})
		key := interpolateRegex.FindStringSubmatch(match)[1]
		if val, ok := vars[key]; ok {
			return val
		}
		return match
	})
}
