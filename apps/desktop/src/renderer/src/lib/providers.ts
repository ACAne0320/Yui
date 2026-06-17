// Short, human-readable brand labels keyed by the runtime's providerId. Used
// for grouping headers (e.g. the chat model picker) where the verbose
// subscription display names would be too long. Regional/gateway variants get
// a suffix so they stay distinguishable. Unknown providers fall back to the
// raw id.
const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  "openai-codex": "OpenAI (Codex)",
  anthropic: "Anthropic",
  "github-copilot": "GitHub Copilot",
  google: "Google",
  "google-vertex": "Vertex AI",
  groq: "Groq",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  openrouter: "OpenRouter",
  xai: "xAI",
  "amazon-bedrock": "Amazon Bedrock",
  "ant-ling": "Ant Ling",
  "azure-openai-responses": "Azure OpenAI",
  cerebras: "Cerebras",
  "cloudflare-ai-gateway": "Cloudflare AI Gateway",
  "cloudflare-workers-ai": "Cloudflare Workers AI",
  fireworks: "Fireworks",
  huggingface: "Hugging Face",
  "kimi-coding": "Kimi",
  minimax: "MiniMax",
  "minimax-cn": "MiniMax (CN)",
  moonshotai: "Moonshot",
  "moonshotai-cn": "Moonshot (CN)",
  nvidia: "NVIDIA",
  opencode: "opencode",
  "opencode-go": "opencode (Go)",
  together: "Together AI",
  "vercel-ai-gateway": "Vercel AI Gateway",
  xiaomi: "Xiaomi MiMo",
  "xiaomi-token-plan-ams": "Xiaomi MiMo (AMS)",
  "xiaomi-token-plan-cn": "Xiaomi MiMo (CN)",
  "xiaomi-token-plan-sgp": "Xiaomi MiMo (SGP)",
  zai: "Z.ai",
  "zai-coding-cn": "Z.ai (CN)",
};

export function providerLabel(providerId: string): string {
  return PROVIDER_LABELS[providerId] ?? providerId;
}
