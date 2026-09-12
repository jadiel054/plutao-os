export type ModelProviderId = "xai" | "openai";

export type ModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
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
