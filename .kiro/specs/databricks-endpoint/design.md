# Design Document

## Overview

The Databricks endpoint integration will add support for Databricks serving endpoints as a model provider in the chat-ui application. This integration follows the established endpoint pattern used by other providers (OpenAI, Anthropic, etc.) and provides seamless access to models deployed on the Databricks platform.

The implementation leverages the Databricks serving endpoints API which accepts OpenAI-compatible message formats, making the integration straightforward. The design ensures full compatibility with the existing endpoint interface, including streaming responses, tool support, parameter mapping, and comprehensive error handling.

## Architecture

### Component Structure
```
src/lib/server/endpoints/databricks/
├── endpointDatabricks.ts          # Main endpoint implementation
└── utils.ts                       # Utility functions (optional)
```

### Integration Points
- **Endpoint Registry**: Added to `src/lib/server/endpoints/endpoints.ts`
- **Configuration Schema**: Zod schema following existing patterns for parameter validation
- **Message Processing**: Converts EndpointMessage format to Databricks API format
- **Response Streaming**: Handles Server-Sent Events from Databricks API
- **Tool Support**: Full compatibility with the chat-ui tool system
- **Parameter Mapping**: Maps model parameters to Databricks API parameters

### Authentication Flow
The Databricks serving endpoints use Basic authentication where:
- Username: "token" (literal string)
- Password: The actual API token (dapi-...)
- Header: `Authorization: Basic <base64(token:dapi-token)>`

## Requirements Analysis

Based on the requirements document, the implementation must satisfy:

### REQ-1: Configuration Management
- Parse and validate Databricks endpoint configuration parameters
- Support multiple endpoint configurations with weight-based load balancing
- Validate required fields (baseURL, apiToken, endpointName)
- Provide clear error messages for missing configuration

### REQ-2: Message Handling
- Format requests according to Databricks serving endpoint API specification
- Include proper Authorization header with Basic authentication
- Format messages in expected JSON structure with role and content fields
- Handle authentication failures with clear error messaging

### REQ-3: Streaming Support
- Set stream parameter to true in request payload
- Parse Server-Sent Events format responses
- Extract content from stream chunks and yield to client
- Implement fallback strategies for streaming failures

### REQ-4: Code Integration Patterns
- Follow same interface pattern as other endpoint implementations
- Use Zod schema validation consistent with existing endpoints
- Handle EndpointMessage format and convert to Databricks API format
- Yield TextGenerationStreamOutput objects consistent with other endpoints

### REQ-5: Error Handling
- Provide descriptive error messages for network errors
- Handle authentication failures specifically
- Manage service availability issues with clear messaging
- Handle rate limiting responses appropriately

### REQ-6: Parameter Configuration
- Support optional parameters like temperature, max_tokens, top_p
- Include parameters in request payload to Databricks
- Use sensible defaults when parameters are omitted
- Validate and reject invalid configurations

## Components and Interfaces

### Configuration Schema
```typescript
export const endpointDatabricksParametersSchema = z.object({
  weight: z.number().int().positive().default(1),
  model: z.any(),
  type: z.literal("databricks"),
  baseURL: z.string().url(), // e.g., "https://dbc-db5aa11c-7adf.cloud.databricks.com"
  apiToken: z.string(), // The dapi token
  endpointName: z.string(), // e.g., "databricks-gemma-3-12b"
  defaultHeaders: z.record(z.string()).optional(),
  defaultQuery: z.record(z.string()).optional(),
  extraBody: z.record(z.any()).optional(),
});
```

### Request Format
The Databricks API expects requests in this format:
```json
{
  "messages": [
    {
      "role": "user", 
      "content": "What is an LLM agent?"
    }
  ],
  "stream": true,
  "max_tokens": 1000,
  "temperature": 0.7,
  "top_p": 0.9,
  "stop": ["</end>"]
}
```

### Response Format
Streaming responses come as Server-Sent Events:
```
data: {"id":"chatcmpl_f1bfc04c-bfaf-40b4-ad99-c5cce28d0f70","object":"chat.completion.chunk","created":1753268343,"model":"gemma-3-12b-it-060225","choices":[{"index":0,"delta":{"content":"An LLM"},"finish_reason":null,"logprobs":null}],"usage":{"prompt_tokens":16,"completion_tokens":1362,"total_tokens":1378}}
data: {"id":"chatcmpl_f1bfc04c-bfaf-40b4-ad99-c5cce28d0f70","object":"chat.completion.chunk","created":1753268343,"model":"gemma-3-12b-it-060225","choices":[{"index":0,"delta":{"content":" agent"},"finish_reason":null,"logprobs":null}],"usage":{"prompt_tokens":16,"completion_tokens":1363,"total_tokens":1379}}
data: {"id":"chatcmpl_f1bfc04c-bfaf-40b4-ad99-c5cce28d0f70","object":"chat.completion.chunk","created":1753268343,"model":"gemma-3-12b-it-060225","choices":[{"index":0,"delta":{"content":""},"finish_reason":"stop","logprobs":null}],"usage":{"prompt_tokens":16,"completion_tokens":1614,"total_tokens":1630}}
data: [DONE]
```

### Core Implementation
The main endpoint function will:
1. Parse and validate configuration parameters using Zod schema
2. Format messages from EndpointMessage to Databricks format
3. Handle authentication header construction with Base64 encoding
4. Make streaming HTTP requests with proper headers
5. Parse SSE responses and yield TextGenerationStreamOutput
6. Handle tool calls and tool results (if supported)
7. Implement comprehensive error handling

## Data Models

### Input Message Format
```typescript
interface DatabricksMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface DatabricksRequest {
  messages: DatabricksMessage[];
  stream: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string[];
  frequency_penalty?: number;
  presence_penalty?: number;
}
```

### Response Format
```typescript
interface DatabricksStreamChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      content?: string;
      role?: string;
    };
    finish_reason?: "stop" | "length" | "content_filter" | null;
    logprobs?: null | object;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

### Configuration Model
```typescript
interface DatabricksEndpointConfig {
  weight: number;
  model: Model;
  type: "databricks";
  baseURL: string;
  apiToken: string;
  endpointName: string;
  defaultHeaders?: Record<string, string>;
  defaultQuery?: Record<string, string>;
  extraBody?: Record<string, any>;
}
```

## Error Handling

### Authentication Errors
- **401 Unauthorized**: Invalid or expired API token
  - Error Message: "Authentication failed. Please check your Databricks API token."
- **403 Forbidden**: Token lacks necessary permissions
  - Error Message: "Access denied. Please verify your Databricks API token has sufficient permissions."

### Network Errors
- **Connection Timeout**: Network connectivity issues
- **DNS Resolution**: Invalid baseURL
- **Error Message**: "Failed to connect to Databricks endpoint. Please check your baseURL configuration."

### API Errors
- **404 Not Found**: Invalid endpoint name
  - Error Message: "Databricks endpoint '{endpointName}' not found. Please verify the endpoint name."
- **429 Rate Limited**: Too many requests
  - Error Message: "Rate limit exceeded. Please try again later."
- **500 Internal Server Error**: Databricks service issues
  - Error Message**: "Databricks service is temporarily unavailable. Please try again later."

### Streaming Errors
- **Connection Interrupted**: Handle partial responses gracefully
- **Invalid JSON**: Skip malformed chunks and continue processing
- **Fallback Strategy**: Return accumulated content if stream fails
- **Timeout Handling**: Implement request timeouts with clear error messages

## API Compatibility Analysis

Based on actual API testing, the Databricks serving endpoints API demonstrates:

### OpenAI Compatibility
- **Near-identical format**: Response structure matches OpenAI's chat completion streaming format
- **Standard SSE**: Uses Server-Sent Events with `data:` prefix and `[DONE]` termination
- **Compatible parameters**: Accepts same parameter names (messages, stream, max_tokens, temperature, etc.)

### Key Differences from Standard OpenAI
- **Enhanced usage tracking**: Every chunk includes real-time token usage information
- **Model name variations**: Returned model name may differ from endpoint name (e.g., "gemma-3-12b-it-060225" vs "databricks-gemma-3-12b")
- **Consistent metadata**: All chunks include id, object, created, model fields

### Usage Tracking Capabilities
The Databricks API provides comprehensive usage tracking:
- `prompt_tokens`: Number of tokens in the input prompt
- `completion_tokens`: Number of tokens generated so far in the response
- `total_tokens`: Sum of prompt and completion tokens
- **Real-time updates**: Token counts update with each streaming chunk

This enables precise token consumption monitoring and billing calculations.

## Implementation Details

### URL Construction
The full API URL will be constructed as:
```typescript
const apiUrl = `${baseURL}/serving-endpoints/${endpointName}/invocations`;
```

### Header Management
Required headers:
- `Authorization: Basic ${base64(token:apiToken)}`
- `Content-Type: application/json`
- `Accept: text/event-stream` (for streaming)
- Optional custom headers from `defaultHeaders`

**Note**: Based on API testing, ensure Content-Type is properly set as the API is sensitive to header formatting.

### Parameter Mapping
Model parameters will be mapped to Databricks API parameters:
- `max_new_tokens` → `max_tokens`
- `temperature` → `temperature`
- `top_p` → `top_p`
- `repetition_penalty` → `frequency_penalty`
- `presence_penalty` → `presence_penalty`
- `stop` → `stop` (array format)

### Stream Processing
The implementation will:
1. Parse SSE format (`data: {json}`)
2. Handle `[DONE]` termination signal
3. Extract content from `choices[0].delta.content`
4. Accumulate partial JSON chunks for robustness
5. Yield TextGenerationStreamOutput objects with proper token IDs
6. Handle finish_reason appropriately
7. Track usage information (prompt_tokens, completion_tokens, total_tokens)
8. Process additional fields (id, object, created, model, logprobs)
9. Handle chunk index for multi-choice scenarios

### Tool Support Integration
Following the patterns from other endpoints:
- Tool definitions will be formatted according to Databricks API requirements
- Tool calls will be handled in the response stream
- Tool results will be properly formatted and included in follow-up requests
- Support for multiple tool calls in a single response

### Message Preprocessing
The implementation will:
1. Handle system messages appropriately (prepend to conversation)
2. Convert EndpointMessage format to Databricks API format
3. Support multimodal content (if supported by Databricks endpoint)
4. Process tool results from previous interactions

### Error Recovery and Resilience
- Retry logic for transient network errors (with exponential backoff)
- Graceful degradation for streaming failures
- Clear error messages for configuration issues
- Comprehensive logging for debugging and monitoring
- Timeout handling with configurable limits

## Testing Strategy

### Unit Tests
1. **Configuration Validation**
   - Valid configuration parsing with all required fields
   - Invalid parameter rejection (missing baseURL, apiToken, endpointName)
   - Required field validation with appropriate error messages
   - Optional parameter handling and defaults

2. **Message Formatting**
   - EndpointMessage to Databricks format conversion
   - System message handling and positioning
   - Multi-message conversations with proper role assignments
   - Tool result integration into message flow

3. **Authentication**
   - Basic auth header construction with Base64 encoding
   - Token validation and encoding verification
   - Header combination with custom defaultHeaders

4. **Response Processing**
   - SSE parsing with various chunk formats
   - JSON chunk processing with partial data handling
   - Stream completion and termination signals
   - Error chunk handling and recovery
   - Usage tracking validation (prompt_tokens, completion_tokens, total_tokens)
   - Model name extraction and validation
   - Metadata field processing (id, object, created)

### Integration Tests
1. **Mock API Responses**
   - Successful streaming responses with various content types
   - Error responses (401, 403, 404, 429, 500)
   - Malformed streaming data and recovery
   - Network timeout scenarios

2. **End-to-End Flow**
   - Complete request-response cycle with authentication
   - Error propagation through the system
   - Stream interruption and recovery handling
   - Tool interaction workflows

### Error Scenario Tests
1. **Network Failures**
   - Connection timeout with retry logic
   - DNS resolution failure handling
   - Intermittent connectivity scenarios

2. **Authentication Failures**
   - Invalid token format and handling
   - Expired token scenarios
   - Missing token configuration

3. **API Failures**
   - Invalid endpoint name handling
   - Rate limiting response processing
   - Service unavailability scenarios

## Endpoint Registration

The endpoint will be registered in the main endpoints configuration:

### In `src/lib/server/endpoints/endpoints.ts`:
```typescript
import { endpointDatabricks, endpointDatabricksParametersSchema } from "./databricks/endpointDatabricks";

export const endpoints = {
  // ... existing endpoints
  databricks: endpointDatabricks,
};

export const endpointSchema = z.discriminatedUnion("type", [
  // ... existing schemas
  endpointDatabricksParametersSchema,
]);
```

### In `src/lib/server/models.ts`:
```typescript
case "databricks":
  return await endpoints.databricks(args);
```

## Configuration Example

Example model configuration for Databricks endpoint:
```json
{
  "name": "databricks-gemma-3-12b",
  "displayName": "Gemma 3 12B (Databricks)", 
  "description": "Gemma 3 12B model served via Databricks (actual model: gemma-3-12b-it-060225)",
  "parameters": {
    "max_new_tokens": 4096,
    "temperature": 0.7,
    "top_p": 0.9,
    "stop": ["</end>"]
  },
  "endpoints": [
    {
      "type": "databricks",
      "weight": 1,
      "baseURL": "https://dbc-db5aa11c-7adf.cloud.databricks.com",
      "apiToken": "dapi-your-token-here",
      "endpointName": "databricks-gemma-3-12b",
      "defaultHeaders": {
        "X-Custom-Header": "value"
      }
    }
  ]
}
```

This design ensures full compatibility with the existing chat-ui architecture while providing robust support for Databricks serving endpoints, complete error handling, and comprehensive testing coverage.