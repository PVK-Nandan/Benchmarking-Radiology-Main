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

function openAiKey(apiKey?: string) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OpenAI API key. Add OPENAI_API_KEY to .env.local");
  return key;
}

function geminiKey(apiKey?: string) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing Gemini API key. Add GEMINI_API_KEY to .env.local");
  return key;
}

export async function generateText(options: TextOptions): Promise<string> {
  return options.provider === "gemini" ? geminiText(options) : openAiText(options);
}

export async function generateVisionText(options: VisionOptions): Promise<string> {
  return options.provider === "gemini" ? geminiVision(options) : openAiVision(options);
}

async function openAiText(options: TextOptions) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey(options.apiKey)}`,
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
      Authorization: `Bearer ${openAiKey(options.apiKey)}`,
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

async function geminiText(options: TextOptions) {
  const model = options.model || process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey(options.apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: options.prompt }] }],
      ...(options.system ? { systemInstruction: { parts: [{ text: options.system }] } } : {}),
      generationConfig: {
        temperature: options.temperature ?? 0.1,
        ...(options.responseJson ? { responseMimeType: "application/json" } : {})
      }
    })
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message || "Gemini request failed.");
  return json.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "";
}

async function geminiVision(options: VisionOptions) {
  const model = options.model || process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey(options.apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: options.prompt },
            { inlineData: { mimeType: options.mimeType, data: options.base64 } }
          ]
        }
      ],
      generationConfig: { temperature: options.temperature ?? 0.1 }
    })
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message || "Gemini vision request failed.");
  return json.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "";
}
