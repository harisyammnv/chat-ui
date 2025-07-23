import { z } from "zod";
import type { Endpoint, EndpointMessage } from "../endpoints";
import type { TextGenerationStreamOutput } from "@huggingface/inference";

/**
 * Creates a Basic authentication header for Databricks API
 * @param apiToken The Databricks API token (dapi-...)
 * @returns Base64 encoded "token:apiToken" string
 */
function createAuthHeader(apiToken: string): string {
	const credentials = `token:${apiToken}`;
	return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

/**
 * Formats messages for Databricks API
 * @param messages Array of EndpointMessage objects
 * @param preprompt Optional system preprompt
 * @returns Formatted messages array for Databricks API
 */
function formatMessages(messages: EndpointMessage[], preprompt?: string) {
	const formattedMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

	// Check if first message is already a system message
	const hasSystemMessage = messages.length > 0 && messages[0]?.from === "system";

	if (hasSystemMessage) {
		// Use existing system message, optionally prepend preprompt
		const systemContent = preprompt
			? `${preprompt}\n\n${messages[0].content}`
			: messages[0].content;

		// Only add system message if it has content (Databricks doesn't allow empty system messages)
		if (systemContent.trim()) {
			formattedMessages.push({
				role: "system",
				content: systemContent,
			});
		}

		// Add remaining messages
		messages.slice(1).forEach((message) => {
			formattedMessages.push({
				role: message.from as "user" | "assistant",
				content: message.content,
			});
		});
	} else {
		// Add preprompt as system message if provided and not empty
		if (preprompt && preprompt.trim()) {
			formattedMessages.push({
				role: "system",
				content: preprompt,
			});
		}

		// Add all messages (skip empty system messages)
		messages.forEach((message) => {
			if (message.from === "system" && !message.content.trim()) {
				// Skip empty system messages as Databricks doesn't allow them
				return;
			}
			formattedMessages.push({
				role: message.from as "system" | "user" | "assistant",
				content: message.content,
			});
		});
	}

	return formattedMessages;
}

/**
 * Maps model parameters to Databricks API parameters
 * @param modelParams Model parameters from generateSettings
 * @returns Mapped parameters for Databricks API
 */
function mapParameters(modelParams: Record<string, unknown> = {}) {
	const mapped: Record<string, unknown> = {};

	// Direct mappings
	if (modelParams.max_new_tokens !== undefined) {
		mapped.max_tokens = modelParams.max_new_tokens;
	}
	if (modelParams.temperature !== undefined) {
		mapped.temperature = modelParams.temperature;
	}
	if (modelParams.top_p !== undefined) {
		mapped.top_p = modelParams.top_p;
	}

	// Parameter mappings with different names
	if (modelParams.repetition_penalty !== undefined) {
		mapped.frequency_penalty = modelParams.repetition_penalty;
	}
	if (modelParams.presence_penalty !== undefined) {
		mapped.presence_penalty = modelParams.presence_penalty;
	}

	// Stop sequences (ensure array format)
	if (modelParams.stop !== undefined) {
		mapped.stop = Array.isArray(modelParams.stop) ? modelParams.stop : [modelParams.stop];
	}

	return mapped;
}

/**
 * Implements retry logic with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retry attempts
 * @param baseDelay Base delay in milliseconds
 * @returns Promise that resolves with the function result
 */
async function withRetry<T>(
	fn: () => Promise<T>,
	maxRetries: number = 3,
	baseDelay: number = 1000
): Promise<T> {
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			// Don't retry on client errors (4xx) except for rate limiting (429)
			if (error instanceof Error) {
				if (
					error.message.includes("401") ||
					error.message.includes("403") ||
					error.message.includes("404")
				) {
					throw error; // Don't retry auth/not found errors
				}
			}

			// Don't retry on the last attempt
			if (attempt === maxRetries) {
				throw error;
			}

			// Calculate delay with exponential backoff and jitter
			const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
			console.warn(
				`Databricks API request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms:`,
				error
			);

			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	// This should never be reached, but TypeScript requires it
	throw new Error("Unexpected end of retry loop");
}

/**
 * Validates Databricks API token format
 * @param token API token to validate
 * @throws Error if token format is invalid
 */
function validateToken(token: string): void {
	if (!token) {
		throw new Error("Databricks API token is required");
	}

	if (!token.startsWith("dapi")) {
		throw new Error("Invalid Databricks API token format. Token should start with 'dapi'");
	}

	if (token.length < 10) {
		throw new Error("Databricks API token appears to be too short");
	}
}

/**
 * Creates a fetch request with timeout
 * @param url Request URL
 * @param options Fetch options
 * @param timeoutMs Timeout in milliseconds
 * @returns Promise that resolves with Response
 */
async function fetchWithTimeout(
	url: string,
	options: RequestInit,
	timeoutMs: number = 30000
): Promise<Response> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url, {
			...options,
			signal: controller.signal,
		});
		return response;
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			throw new Error(
				`Request timeout after ${timeoutMs}ms. Please check your network connection.`
			);
		}

		// Handle common network errors
		if (error instanceof Error) {
			if (error.message.includes("ENOTFOUND") || error.message.includes("ECONNREFUSED")) {
				throw new Error(
					`Failed to connect to Databricks endpoint. Please check your baseURL configuration and network connectivity.`
				);
			}
			if (error.message.includes("ETIMEDOUT")) {
				throw new Error(`Connection timeout. Please check your network connection and try again.`);
			}
		}

		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * Parses error response from Databricks API
 * @param response Response object
 * @returns Parsed error message
 */
async function parseErrorResponse(response: Response): Promise<string> {
	try {
		const contentType = response.headers.get("content-type");

		if (contentType?.includes("application/json")) {
			const errorData = await response.json();

			// Handle different error response formats
			if (errorData.error) {
				if (typeof errorData.error === "string") {
					return errorData.error;
				}
				if (errorData.error.message) {
					return errorData.error.message;
				}
			}

			if (errorData.message) {
				return errorData.message;
			}

			if (errorData.detail) {
				return errorData.detail;
			}

			// Return stringified JSON if no specific error field found
			return JSON.stringify(errorData);
		} else {
			// Return raw text for non-JSON responses
			return await response.text();
		}
	} catch (e) {
		// Fallback to status text if parsing fails
		return response.statusText || `HTTP ${response.status}`;
	}
}

/**
 * Creates appropriate error message based on HTTP status and response
 * @param response Response object
 * @param endpointName Databricks endpoint name for context
 * @returns Formatted error message
 */
async function createErrorMessage(response: Response, endpointName: string): Promise<string> {
	const errorDetails = await parseErrorResponse(response);

	switch (response.status) {
		case 401:
			return `Authentication failed. Please check your Databricks API token. Details: ${errorDetails}`;

		case 403:
			return `Access denied. Please verify your Databricks API token has sufficient permissions for endpoint '${endpointName}'. Details: ${errorDetails}`;

		case 404:
			return `Databricks endpoint '${endpointName}' not found. Please verify the endpoint name and ensure it's deployed. Details: ${errorDetails}`;

		case 422:
			return `Invalid request parameters. Please check your model configuration. Details: ${errorDetails}`;

		case 429:
			return `Rate limit exceeded. Please reduce request frequency and try again later. Details: ${errorDetails}`;

		case 500:
			return `Databricks service error. Please try again later. Details: ${errorDetails}`;

		case 502:
		case 503:
		case 504:
			return `Databricks service is temporarily unavailable. Please try again later. Details: ${errorDetails}`;

		default:
			return `Databricks API error (${response.status}): ${errorDetails}`;
	}
}

export const endpointDatabricksParametersSchema = z.object({
	weight: z.number().int().positive().default(1),
	model: z.any(),
	type: z.literal("databricks"),
	baseURL: z.string().url(),
	apiToken: z.string(),
	endpointName: z.string(),
	defaultHeaders: z.record(z.string()).optional(),
	defaultQuery: z.record(z.string()).optional(),
	extraBody: z.record(z.any()).optional(),
});

export async function endpointDatabricks(
	input: z.input<typeof endpointDatabricksParametersSchema>
): Promise<Endpoint> {
	const { baseURL, apiToken, endpointName, model, defaultHeaders, extraBody } =
		endpointDatabricksParametersSchema.parse(input);

	// Validate token format on initialization
	validateToken(apiToken);

	return async ({
		messages,
		preprompt,
		generateSettings,
		tools, // eslint-disable-line @typescript-eslint/no-unused-vars
		toolResults, // eslint-disable-line @typescript-eslint/no-unused-vars
		conversationId,
	}) => {
		// Construct API URL
		const apiUrl = `${baseURL}/serving-endpoints/${endpointName}/invocations`;

		// Format messages for Databricks API
		const formattedMessages = formatMessages(messages, preprompt);

		// Map model parameters
		const parameters = { ...model.parameters, ...generateSettings };
		const mappedParams = mapParameters(parameters);

		// Construct request body
		const requestBody = {
			messages: formattedMessages,
			stream: true,
			...mappedParams,
			...extraBody,
		};

		// Construct headers
		const headers: Record<string, string> = {
			Authorization: createAuthHeader(apiToken),
			"Content-Type": "application/json",
			Accept: "text/event-stream",
			...defaultHeaders,
		};

		// Add conversation ID if available
		if (conversationId) {
			headers["ChatUI-Conversation-ID"] = conversationId.toString();
		}

		return (async function* () {
			let tokenId = 0;
			let generatedText = "";

			try {
				// Make the request with retry logic and timeout
				const response = await withRetry(async () => {
					const resp = await fetchWithTimeout(
						apiUrl,
						{
							method: "POST",
							headers,
							body: JSON.stringify(requestBody),
						},
						60000
					); // 60 second timeout for initial connection

					if (!resp.ok) {
						const errorMessage = await createErrorMessage(resp, endpointName);
						throw new Error(errorMessage);
					}

					return resp;
				});

				if (!response.body) {
					throw new Error("No response body received from Databricks API");
				}

				// Set up streaming with enhanced error handling
				const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

				let buffer = "";
				let consecutiveErrors = 0;
				const maxConsecutiveErrors = 5;
				const streamTimeoutMs = 30000; // 30 seconds between chunks

				while (true) {
					try {
						// Add timeout for reading chunks
						const readPromise = reader.read();
						const timeoutPromise = new Promise((_, reject) => {
							setTimeout(() => {
								reject(new Error(`Stream timeout: no data received for ${streamTimeoutMs}ms`));
							}, streamTimeoutMs);
						});

						const { done, value } = (await Promise.race([
							readPromise,
							timeoutPromise,
						])) as ReadableStreamReadResult<string>;

						if (done) {
							// Stream ended, finalize response
							if (generatedText) {
								yield {
									token: {
										id: tokenId++,
										text: "",
										logprob: 0,
										special: true,
									},
									generated_text: generatedText,
									details: null,
								} satisfies TextGenerationStreamOutput;
							}
							break;
						}

						consecutiveErrors = 0; // Reset error count on successful read

						buffer += value;
						const lines = buffer.split("\n");
						buffer = lines.pop() || "";

						for (const line of lines) {
							if (line.trim() === "") continue;

							if (line.startsWith("data: ")) {
								const data = line.slice(6);

								if (data === "[DONE]") {
									yield {
										token: {
											id: tokenId++,
											text: "",
											logprob: 0,
											special: true,
										},
										generated_text: generatedText,
										details: null,
									} satisfies TextGenerationStreamOutput;
									return;
								}

								try {
									const chunk = JSON.parse(data);

									// Handle error chunks in streaming response
									if (chunk.error) {
										throw new Error(`Streaming error: ${chunk.error.message || chunk.error}`);
									}

									// Log usage information if available (for debugging/monitoring)
									if (chunk.usage) {
										console.debug("Databricks API usage:", {
											prompt_tokens: chunk.usage.prompt_tokens,
											completion_tokens: chunk.usage.completion_tokens,
											total_tokens: chunk.usage.total_tokens,
											model: chunk.model,
											id: chunk.id,
										});
									}

									if (chunk.choices?.[0]?.delta?.content) {
										const content = chunk.choices[0].delta.content;
										generatedText += content;

										yield {
											token: {
												id: tokenId++,
												text: content,
												logprob: 0,
												special: false,
											},
											generated_text: null,
											details: null,
										} satisfies TextGenerationStreamOutput;
									}

									// Handle finish_reason
									if (chunk.choices?.[0]?.finish_reason) {
										yield {
											token: {
												id: tokenId++,
												text: "",
												logprob: 0,
												special: true,
											},
											generated_text: generatedText,
											details: null,
										} satisfies TextGenerationStreamOutput;
										return;
									}
								} catch (e) {
									consecutiveErrors++;
									console.warn(
										`Failed to parse streaming chunk (${consecutiveErrors}/${maxConsecutiveErrors}):`,
										data,
										e
									);

									// If too many consecutive errors, abort streaming
									if (consecutiveErrors >= maxConsecutiveErrors) {
										console.error("Too many consecutive parsing errors, aborting stream");
										throw new Error(
											`Stream parsing failed: too many consecutive errors (${maxConsecutiveErrors}). Last error: ${e}`
										);
									}

									// Continue processing other chunks for recoverable errors
									continue;
								}
							}
						}
					} catch (streamError) {
						// Handle streaming interruption
						if (streamError instanceof Error) {
							if (
								streamError.message.includes("timeout") ||
								streamError.message.includes("interrupted")
							) {
								console.warn(
									"Stream interrupted, returning accumulated content:",
									streamError.message
								);

								// Return accumulated content as fallback
								if (generatedText) {
									yield {
										token: {
											id: tokenId++,
											text: "",
											logprob: 0,
											special: true,
										},
										generated_text: generatedText,
										details: null,
									} satisfies TextGenerationStreamOutput;
								}
								return;
							}
						}

						throw streamError; // Re-throw non-recoverable errors
					}
				}
			} catch (error) {
				// Most errors are now handled by the enhanced error handling above
				// This catch block handles any remaining unexpected errors
				if (error instanceof Error) {
					console.error("Databricks endpoint error:", error);

					// Add context to the error message if it doesn't already have it
					if (!error.message.includes("Databricks")) {
						throw new Error(`Databricks endpoint error: ${error.message}`);
					}
				}

				throw error;
			}
		})();
	};
}
