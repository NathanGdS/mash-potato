package scripter

import (
	"fmt"
	"strings"

	"github.com/dop251/goja"
)

const maxDoRequestDepth = 5

// RequestExecutor executes a request by path and returns its response.
// depth tracks the current call depth for recursion limiting.
type RequestExecutor func(path string, depth int) (ResponseSnapshot, error)

// RequestSnapshot holds a read-only snapshot of the request for script access.
type RequestSnapshot struct {
	URL     string
	Method  string
	Headers map[string]string
	Body    string
}

// ResponseSnapshot holds a read-only snapshot of the response for post-script access.
// Logs carries console output from nested script execution (populated by executors).
type ResponseSnapshot struct {
	Status     int
	StatusText string
	Body       string
	Headers    map[string]string
	Logs       []string
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
	StopRunner      bool              // set by stopRunner()
	Logs            []string          // console.log lines
	Errors          []string          // non-fatal script errors
}

// RunPreScript executes a pre-request script in a sandboxed goja runtime.
// Response is not exposed in the mp object.
func RunPreScript(script string, ctx ScriptContext, executor RequestExecutor, depth int) ScriptResult {
	return run(script, ctx, executor, depth)
}

// RunPostScript executes a post-response script in a sandboxed goja runtime.
// Both mp.request and mp.response are exposed.
func RunPostScript(script string, ctx ScriptContext, executor RequestExecutor, depth int) ScriptResult {
	return run(script, ctx, executor, depth)
}

// run is the shared execution engine for both pre and post scripts.
func run(script string, ctx ScriptContext, executor RequestExecutor, depth int) ScriptResult {
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

	// --- doRequest global ---
	_ = vm.Set("doRequest", func(call goja.FunctionCall) goja.Value {
		if depth >= maxDoRequestDepth {
			panic(vm.NewGoError(fmt.Errorf("doRequest: max recursion depth (%d) exceeded", maxDoRequestDepth)))
		}
		if len(call.Arguments) < 1 {
			panic(vm.NewGoError(fmt.Errorf("doRequest: path argument required")))
		}
		path := call.Arguments[0].String()
		if executor == nil {
			panic(vm.NewGoError(fmt.Errorf("doRequest: not available in this context")))
		}
		resp, err := executor(path, depth+1)
		if err != nil {
			panic(vm.NewGoError(err))
		}
		// Append sub-script logs to parent result.
		result.Logs = append(result.Logs, resp.Logs...)

		respHeaders := vm.NewObject()
		for k, v := range resp.Headers {
			_ = respHeaders.Set(k, v)
		}
		respBody := resp.Body
		respObj := vm.NewObject()
		_ = respObj.Set("status", resp.Status)
		_ = respObj.Set("statusText", resp.StatusText)
		_ = respObj.Set("body", respBody)
		_ = respObj.Set("headers", respHeaders)
		_ = respObj.Set("json", func(call goja.FunctionCall) goja.Value {
			val, err := vm.RunString("(function(s){try{return JSON.parse(s)}catch(e){return undefined}})")
			if err != nil {
				return goja.Undefined()
			}
			fn, ok := goja.AssertFunction(val)
			if !ok {
				return goja.Undefined()
			}
			res, err := fn(goja.Undefined(), vm.ToValue(respBody))
			if err != nil {
				return goja.Undefined()
			}
			return res
		})
		return respObj
	})

	// --- stopRunner global ---
	_ = vm.Set("stopRunner", func(call goja.FunctionCall) goja.Value {
		result.StopRunner = true
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
