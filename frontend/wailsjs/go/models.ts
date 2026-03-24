export namespace db {
	
	export class Collection {
	    id: string;
	    name: string;
	    // Go type: time
	    created_at: any;
	
	    static createFrom(source: any = {}) {
	        return new Collection(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.created_at = this.convertValues(source["created_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Environment {
	    id: string;
	    name: string;
	    is_global: boolean;
	    // Go type: time
	    created_at: any;
	
	    static createFrom(source: any = {}) {
	        return new Environment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.is_global = source["is_global"];
	        this.created_at = this.convertValues(source["created_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EnvironmentVariable {
	    id: number;
	    environment_id: string;
	    key: string;
	    value: string;
	
	    static createFrom(source: any = {}) {
	        return new EnvironmentVariable(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.environment_id = source["environment_id"];
	        this.key = source["key"];
	        this.value = source["value"];
	    }
	}
	export class Folder {
	    id: string;
	    collection_id: string;
	    parent_folder_id?: string;
	    name: string;
	    // Go type: time
	    created_at: any;
	
	    static createFrom(source: any = {}) {
	        return new Folder(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.collection_id = source["collection_id"];
	        this.parent_folder_id = source["parent_folder_id"];
	        this.name = source["name"];
	        this.created_at = this.convertValues(source["created_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class HistoryEntry {
	    id: number;
	    method: string;
	    url: string;
	    headers: string;
	    params: string;
	    body_type: string;
	    body: string;
	    response_status: number;
	    response_body: string;
	    response_headers: string;
	    response_duration_ms: number;
	    response_size_bytes: number;
	    executed_at: string;
	
	    static createFrom(source: any = {}) {
	        return new HistoryEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.method = source["method"];
	        this.url = source["url"];
	        this.headers = source["headers"];
	        this.params = source["params"];
	        this.body_type = source["body_type"];
	        this.body = source["body"];
	        this.response_status = source["response_status"];
	        this.response_body = source["response_body"];
	        this.response_headers = source["response_headers"];
	        this.response_duration_ms = source["response_duration_ms"];
	        this.response_size_bytes = source["response_size_bytes"];
	        this.executed_at = source["executed_at"];
	    }
	}
	export class Request {
	    id: string;
	    collection_id: string;
	    folder_id?: string;
	    name: string;
	    method: string;
	    url: string;
	    headers: string;
	    params: string;
	    body_type: string;
	    body: string;
	    auth_type: string;
	    auth_config: string;
	    timeout_seconds: number;
	    tests: string;
	    pre_script: string;
	    post_script: string;
	    // Go type: time
	    created_at: any;
	
	    static createFrom(source: any = {}) {
	        return new Request(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.collection_id = source["collection_id"];
	        this.folder_id = source["folder_id"];
	        this.name = source["name"];
	        this.method = source["method"];
	        this.url = source["url"];
	        this.headers = source["headers"];
	        this.params = source["params"];
	        this.body_type = source["body_type"];
	        this.body = source["body"];
	        this.auth_type = source["auth_type"];
	        this.auth_config = source["auth_config"];
	        this.timeout_seconds = source["timeout_seconds"];
	        this.tests = source["tests"];
	        this.pre_script = source["pre_script"];
	        this.post_script = source["post_script"];
	        this.created_at = this.convertValues(source["created_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace httpclient {
	
	export class AssertionResult {
	    expression: string;
	    passed: boolean;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new AssertionResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.expression = source["expression"];
	        this.passed = source["passed"];
	        this.message = source["message"];
	    }
	}
	export class ResponseResult {
	    StatusCode: number;
	    StatusText: string;
	    Body: string;
	    Headers: Record<string, Array<string>>;
	    DurationMs: number;
	    SizeBytes: number;
	    TestResults: AssertionResult[];
	    consoleLogs: string[];
	    scriptErrors: string[];
	
	    static createFrom(source: any = {}) {
	        return new ResponseResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.StatusCode = source["StatusCode"];
	        this.StatusText = source["StatusText"];
	        this.Body = source["Body"];
	        this.Headers = source["Headers"];
	        this.DurationMs = source["DurationMs"];
	        this.SizeBytes = source["SizeBytes"];
	        this.TestResults = this.convertValues(source["TestResults"], AssertionResult);
	        this.consoleLogs = source["consoleLogs"];
	        this.scriptErrors = source["scriptErrors"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace main {
	
	export class RequestPayload {
	    id: string;
	    method: string;
	    url: string;
	    headers: string;
	    params: string;
	    body_type: string;
	    body: string;
	    auth_type: string;
	    auth_config: string;
	    timeout_seconds: number;
	    tests: string;
	    pre_script: string;
	    post_script: string;
	
	    static createFrom(source: any = {}) {
	        return new RequestPayload(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.method = source["method"];
	        this.url = source["url"];
	        this.headers = source["headers"];
	        this.params = source["params"];
	        this.body_type = source["body_type"];
	        this.body = source["body"];
	        this.auth_type = source["auth_type"];
	        this.auth_config = source["auth_config"];
	        this.timeout_seconds = source["timeout_seconds"];
	        this.tests = source["tests"];
	        this.pre_script = source["pre_script"];
	        this.post_script = source["post_script"];
	    }
	}

}

