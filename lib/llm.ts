import { Provider } from "./types";

type TextOptions = {
  provider: Provider;
  apiKey?: string;
  model?: string;
  system?: string;
  prompt: string;
  temperature?: number;
  responseJson?: boolean;
};

type VisionOptions = {
  provider: Provider;
  apiKey?: string;
  model?: string;
  prompt: string;
  mimeType: string;
  base64: string;
  temperature?: number;
};

function keyFor(apiKey?: string) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(`Missing OpenAI API key. Add it in settings or set OPENAI_API_KEY.`);
  }
  return key;
}

export async function generateText(options: TextOptions): Promise<string> {
  return openAiText(options);
}

export async function generateVisionText(options: VisionOptions): Promise<string> {
  return openAiVision(options);
}

async function openAiText(options: TextOptions) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${keyFor(options.apiKey)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: options.model || "gpt-4.1-mini",
      temperature: options.temperature ?? 0.1,
      input: [
        ...(options.system ? [{ role: "system", content: [{ type: "input_text", text: options.system }] }] : []),
        { role: "user", content: [{ type: "input_text", text: options.prompt }] }
      ],
      ...(options.responseJson ? { text: { format: { type: "json_object" } } } : {})
    })
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message || "OpenAI request failed.");
  return json.output_text || json.output?.flatMap((item: any) => item.content || []).map((part: any) => part.text).join("\n") || "";
}

async function openAiVision(options: VisionOptions) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${keyFor(options.apiKey)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: options.model || "gpt-4.1-mini",
      temperature: options.temperature ?? 0.1,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: options.prompt },
            { type: "input_image", image_url: `data:${options.mimeType};base64,${options.base64}` }
          ]
        }
      ]
    })
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message || "OpenAI vision request failed.");
  return json.output_text || json.output?.flatMap((item: any) => item.content || []).map((part: any) => part.text).join("\n") || "";
}

