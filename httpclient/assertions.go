package httpclient

import (
	"encoding/json"
	"fmt"
	"strings"
)

// AssertionResult holds the outcome of a single test assertion.
type AssertionResult struct {
	Expression string `json:"expression"`
	Passed     bool   `json:"passed"`
	Message    string `json:"message"`
}

// EvaluateAssertions parses the tests string and evaluates each assertion against the response.
func EvaluateAssertions(tests string, resp ResponseResult) []AssertionResult {
	lines := strings.Split(tests, "\n")
	results := make([]AssertionResult, 0)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		results = append(results, evaluateLine(line, resp))
	}

	return results
}

func evaluateLine(line string, resp ResponseResult) AssertionResult {
	res := AssertionResult{Expression: line, Passed: false}

	// status == <number>
	if strings.HasPrefix(line, "status == ") {
		expected := strings.TrimPrefix(line, "status == ")
		expected = strings.TrimSpace(expected)
		if fmt.Sprintf("%d", resp.StatusCode) == expected {
			res.Passed = true
		} else {
			res.Message = fmt.Sprintf("Expected %s, got %d", expected, resp.StatusCode)
		}
		return res
	}

	// header["<name>"] == <value>
	// header["<name>"] contains <substring>
	if strings.HasPrefix(line, "header[") {
		closeBracketIdx := strings.Index(line, "]")
		if closeBracketIdx > 7 {
			headerName := line[8 : closeBracketIdx-1] // header["Name"] -> Name
			remaining := strings.TrimSpace(line[closeBracketIdx+1:])

			actualValues, ok := resp.Headers[headerName]
			actual := ""
			if ok && len(actualValues) > 0 {
				actual = actualValues[0]
			}

			if strings.HasPrefix(remaining, "== ") {
				expected := strings.TrimPrefix(remaining, "== ")
				expected = strings.Trim(strings.TrimSpace(expected), "\"'")
				if actual == expected {
					res.Passed = true
				} else {
					res.Message = fmt.Sprintf("Expected '%s', got '%s'", expected, actual)
				}
				return res
			}

			if strings.HasPrefix(remaining, "contains ") {
				substring := strings.TrimPrefix(remaining, "contains ")
				substring = strings.Trim(strings.TrimSpace(substring), "\"'")
				if strings.Contains(actual, substring) {
					res.Passed = true
				} else {
					res.Message = fmt.Sprintf("Header '%s' does not contain '%s'", actual, substring)
				}
				return res
			}
		}
	}

	// body.<path> == <value>
	// body.<path> exists
	if strings.HasPrefix(line, "body.") {
		parts := strings.Fields(line)
		if len(parts) >= 2 {
			path := parts[0]
			path = strings.TrimPrefix(path, "body.")
			op := parts[1]

			val, exists := resolveJSONPath(resp.Body, path)

			if op == "exists" {
				if exists {
					res.Passed = true
				} else {
					res.Message = fmt.Sprintf("Path body.%s does not exist", path)
				}
				return res
			}

			if op == "==" && len(parts) >= 3 {
				expected := strings.Join(parts[2:], " ")
				expected = strings.Trim(expected, "\"'")
				
				actualStr := fmt.Sprintf("%v", val)
				if actualStr == expected {
					res.Passed = true
				} else {
					res.Message = fmt.Sprintf("Expected '%s', got '%s'", expected, actualStr)
				}
				return res
			}
		}
	}

	res.Message = "Invalid assertion format"
	return res
}

func resolveJSONPath(body string, path string) (interface{}, bool) {
	if body == "" {
		return nil, false
	}

	var data interface{}
	if err := json.Unmarshal([]byte(body), &data); err != nil {
		return nil, false
	}

	parts := strings.Split(path, ".")
	current := data

	for _, part := range parts {
		if m, ok := current.(map[string]interface{}); ok {
			if next, found := m[part]; found {
				current = next
			} else {
				return nil, false
			}
		} else {
			return nil, false
		}
	}

	return current, true
}
