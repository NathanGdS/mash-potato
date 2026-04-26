package scripter

import (
	"fmt"
	"strings"

	"github.com/dop251/goja"
)

// RequestSnapshot holds a read-only snapshot of the request for script access.
type RequestSnapshot struct {
	URL     string
	Method  string
	Headers map[string]string
	Body    string
}

// ResponseSnapshot holds a read-only snapshot of the response for post-script access.
type ResponseSnapshot struct {
	Status     int
	StatusText string
	Body       string
	Headers    map[string]string
}

// ScriptContext is the input context passed to script execution.
type ScriptContext struct {
	EnvVars  map[string]string // current env snapshot
	RunVars  map[string]string // run-scoped variables (read-only snapshot)
	Request  RequestSnapshot   // url, method, headers, body
	Response *ResponseSnapshot // nil for pre-script
}

// ScriptResult is the output of script execution.
type ScriptResult struct {
	EnvMutations    map[string]string // keys written via mp.env.set()
	RunVarMutations map[string]string // keys written via mp.runVars.set()
	NextRequest     *string           // nil=not called; ""=stop; non-empty=jump target
	Logs            []string          // console.log lines
	Errors          []string          // non-fatal script errors
}

// RunPreScript executes a pre-request script in a sandboxed goja runtime.
// Response is not exposed in the mp object.
func RunPreScript(script string, ctx ScriptContext) ScriptResult {
	return run(script, ctx)
}

// RunPostScript executes a post-response script in a sandboxed goja runtime.
// Both mp.request and mp.response are exposed.
func RunPostScript(script string, ctx ScriptContext) ScriptResult {
	return run(script, ctx)
}

// run is the shared execution engine for both pre and post scripts.
func run(script string, ctx ScriptContext) ScriptResult {
	result := ScriptResult{
		EnvMutations:    make(map[string]string),
		RunVarMutations: make(map[string]string),
		Logs:            []string{},
		Errors:          []string{},
	}

	if strings.TrimSpace(script) == "" {
		return result
	}

	vm := goja.New()

	// Disable access to Go's native net/os by not exposing them.
	// goja does not expose any Go stdlib by default — only what we bind explicitly.

	// --- console object ---
	console := vm.NewObject()
	_ = console.Set("log", func(call goja.FunctionCall) goja.Value {
		parts := make([]string, 0, len(call.Arguments))
		for _, arg := range call.Arguments {
			parts = append(parts, fmt.Sprintf("%v", arg.Export()))
		}
		result.Logs = append(result.Logs, strings.Join(parts, " "))
		return goja.Undefined()
	})
	_ = vm.Set("console", console)

	// --- setNextRequest global ---
	_ = vm.Set("setNextRequest", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 || goja.IsNull(call.Arguments[0]) || goja.IsUndefined(call.Arguments[0]) {
			empty := ""
			result.NextRequest = &empty
		} else {
			s := call.Arguments[0].String()
			result.NextRequest = &s
		}
		return goja.Undefined()
	})

	// --- mp.runVars object ---
	runVarsCopy := make(map[string]string, len(ctx.RunVars))
	for k, v := range ctx.RunVars {
		runVarsCopy[k] = v
	}
	mpRunVars := vm.NewObject()
	_ = mpRunVars.Set("get", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}
		val, ok := runVarsCopy[call.Arguments[0].String()]
		if !ok {
			return goja.Undefined()
		}
		return vm.ToValue(val)
	})
	_ = mpRunVars.Set("set", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 2 {
			return goja.Undefined()
		}
		key := call.Arguments[0].String()
		value := call.Arguments[1].String()
		runVarsCopy[key] = value
		result.RunVarMutations[key] = value
		return goja.Undefined()
	})

	// --- mp.env object ---
	envVarsCopy := make(map[string]string, len(ctx.EnvVars))
	for k, v := range ctx.EnvVars {
		envVarsCopy[k] = v
	}

	mpEnv := vm.NewObject()
	_ = mpEnv.Set("get", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}
		key := call.Arguments[0].String()
		val, ok := envVarsCopy[key]
		if !ok {
			return goja.Undefined()
		}
		return vm.ToValue(val)
	})
	_ = mpEnv.Set("set", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 2 {
			return goja.Undefined()
		}
		key := call.Arguments[0].String()
		value := call.Arguments[1].String()
		envVarsCopy[key] = value
		result.EnvMutations[key] = value
		return goja.Undefined()
	})

	// --- mp.request object (read-only snapshot) ---
	reqHeaders := vm.NewObject()
	for k, v := range ctx.Request.Headers {
		_ = reqHeaders.Set(k, v)
	}

	mpRequest := vm.NewObject()
	_ = mpRequest.Set("url", ctx.Request.URL)
	_ = mpRequest.Set("method", ctx.Request.Method)
	_ = mpRequest.Set("headers", reqHeaders)
	_ = mpRequest.Set("body", ctx.Request.Body)

	// --- mp object ---
	mp := vm.NewObject()
	_ = mp.Set("env", mpEnv)
	_ = mp.Set("runVars", mpRunVars)
	_ = mp.Set("request", mpRequest)

	// --- mp.response (post-script only, when Response is non-nil) ---
	if ctx.Response != nil {
		respHeaders := vm.NewObject()
		for k, v := range ctx.Response.Headers {
			_ = respHeaders.Set(k, v)
		}

		responseBody := ctx.Response.Body
		mpResponse := vm.NewObject()
		_ = mpResponse.Set("status", ctx.Response.Status)
		_ = mpResponse.Set("statusText", ctx.Response.StatusText)
		_ = mpResponse.Set("body", responseBody)
		_ = mpResponse.Set("headers", respHeaders)
		_ = mpResponse.Set("json", func(call goja.FunctionCall) goja.Value {
			val, err := vm.RunString("(function(s){try{return JSON.parse(s)}catch(e){return undefined}})")
			if err != nil {
				return goja.Undefined()
			}
			fn, ok := goja.AssertFunction(val)
			if !ok {
				return goja.Undefined()
			}
			res, err := fn(goja.Undefined(), vm.ToValue(responseBody))
			if err != nil {
				return goja.Undefined()
			}
			return res
		})

		_ = mp.Set("response", mpResponse)
	}

	_ = vm.Set("mp", mp)

	// Execute the script, catching panics and runtime errors as non-fatal.
	func() {
		defer func() {
			if r := recover(); r != nil {
				result.Errors = append(result.Errors, fmt.Sprintf("script panic: %v", r))
			}
		}()

		_, err := vm.RunString(script)
		if err != nil {
			result.Errors = append(result.Errors, err.Error())
		}
	}()

	return result
}
