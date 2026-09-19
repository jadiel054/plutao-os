export type ModelProviderId = "xai" | "openai" | "gemini" | "local";

export type MultimodalContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ModelMessage = {
  role: "system" | "user" | "assistant";
  content: string | MultimodalContentPart[];
};

export type ModelToolProposal = {
  name: string;
  input: string;
};

export type ModelStepResult = {
  provider: ModelProviderId;
  model: string;
  /** Free-text reasoning / reply from the model */
  content: string;
  /** If model proposed a tool call we recognized */
  toolProposal: ModelToolProposal | null;
  usage?: { promptTokens?: number; completionTokens?: number };
  latencyMs: number;
};

export type ModelConfig = {
  provider: ModelProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
};
