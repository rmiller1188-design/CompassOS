import OpenAI from "openai";
import { env } from "@/lib/env";

export function openAiClient() {
  return new OpenAI({ apiKey: env.openAiApiKey() });
}
