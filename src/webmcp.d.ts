/**
 * Minimal type declarations for the WebMCP imperative API
 * (https://developer.chrome.com/docs/ai/webmcp/imperative-api).
 * Surface verified against the Chrome docs and the GoogleChromeLabs/webmcp-tools
 * reference demos. The API is experimental and gated behind
 * chrome://flags/#enable-webmcp-testing (Chrome 149+).
 */

interface WebMCPToolAnnotations {
  /** Tool only reads state, does not modify it. */
  readOnlyHint?: boolean;
  /** Tool may perform destructive updates. */
  destructiveHint?: boolean;
  /** Repeated calls with the same args have no additional effect. */
  idempotentHint?: boolean;
  /** Tool content originates from a source the user did not see. */
  untrustedContentHint?: boolean;
}

/** The value an `execute` handler returns to the agent. */
type WebMCPToolResult = string | Promise<string>;

interface WebMCPTool {
  /** Max 30 characters. */
  name: string;
  /** Max 500 characters. Tell the model *when* to use the tool. */
  description: string;
  /** JSON Schema for the input. */
  inputSchema: Record<string, unknown>;
  /**
   * Runs in the page, visibly to the user. Return a short, structured string
   * (budget ~1.5K chars) so the agent can iterate on its own output.
   */
  execute: (input: Record<string, unknown>, context?: { signal?: AbortSignal }) => WebMCPToolResult;
  annotations?: WebMCPToolAnnotations;
}

interface WebMCPToolOptions {
  /** Aborting removes/unregisters the tool. */
  signal?: AbortSignal;
  /** Restrict which agent origins may call the tool. Omitted = all allowed agents. */
  exposedTo?: string[];
}

interface ModelContext {
  registerTool(tool: WebMCPTool, options?: WebMCPToolOptions): Promise<void> | void;
  getTools?(): Promise<unknown[]>;
  executeTool?(
    tool: unknown,
    input: string,
    options?: { signal?: AbortSignal },
  ): Promise<unknown>;
  addEventListener?(type: 'toolchange', listener: () => void): void;
}

interface Document {
  readonly modelContext?: ModelContext;
}
