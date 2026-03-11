# API Client Desktop App (Postman-like)

Tech Stack:

* Golang
* Wails
* SQLite
* Frontend - React

---

# Phase 1 — MVP

## Collections

### US-001 — Create Collection

**As a user**
I want to create a collection
So that I can organize my API requests.

### US-002 — Rename Collection

**As a user**
I want to rename a collection
So that I can keep my workspace organized.

### US-003 — Delete Collection

**As a user**
I want to delete a collection
So that I can remove unused requests.

---

## Requests

### US-004 — Create Request

**As a user**
I want to create a request inside a collection
So that I can test an API endpoint.

### US-005 — Configure HTTP Method

**As a user**
I want to choose the HTTP method (GET, POST, PUT, PATCH, DELETE)
So that I can call different types of endpoints.

### US-006 — Configure URL

**As a user**
I want to define the request URL
So that the request is sent to the correct API endpoint.

### US-007 — Configure Headers

**As a user**
I want to add request headers
So that I can send metadata such as authentication tokens.

### US-008 — Configure Query Parameters

**As a user**
I want to add query parameters
So that I can customize my request inputs.

### US-009 — Configure Request Body

**As a user**
I want to define a request body
So that I can send payloads to APIs.

Supported body types:

* JSON
* Raw
* Form-data

---

## Request Execution

### US-010 — Send Request

**As a user**
I want to execute an HTTP request
So that I can test an API endpoint.

---

## Response Viewer

### US-011 — View Response Status

**As a user**
I want to see the response status code
So that I know if the request succeeded.

### US-012 — View Response Body

**As a user**
I want to see the full response body
So that I can inspect the returned data.

### US-013 — View Response Headers

**As a user**
I want to see response headers
So that I can debug API behavior.

### US-014 — View Request Metrics

**As a user**
I want to see response time and response size
So that I can evaluate API performance.

---

# Phase 2 — Environments

## Environment Management

### US-015 — Create Environment

**As a user**
I want to create environments
So that I can separate configurations (dev, staging, prod).

### US-016 — Add Environment Variables

**As a user**
I want to define variables in an environment
So that I can reuse values across requests.

Examples:

* `base_url`
* `api_key`
* `token`

---

## Environment Usage

### US-017 — Use Variables in Requests

**As a user**
I want to use environment variables in requests
So that I can avoid hardcoding values.

Example:

```
{{base_url}}/users
```

### US-018 — Select Active Environment

**As a user**
I want to select the active environment
So that all requests use the correct variables.

### US-019 — Variable Interpolation

**As a user**
I want variables to be resolved automatically before the request is sent
So that my request contains the correct values.

---

# Phase 3 — Environment Enhancements

## Extract Variables From Responses

### US-020 — Select Value From Response

**As a user**
I want to select a value from a response
So that I can reuse it in future requests.

### US-021 — Create Environment Variable From Response

**As a user**
I want to right-click a selected value
So that I can save it as an environment variable.

### US-022 — Auto Populate Variable Value

**As a user**
I want the selected value to automatically populate the environment variable
So that I don't need to manually copy it.

Example response:

```json
{
  "token": "abc123"
}
```

Environment variable created:

```
token = abc123
```
