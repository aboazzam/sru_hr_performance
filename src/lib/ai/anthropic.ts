import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Reads ANTHROPIC_API_KEY from the environment automatically -- server-only,
// never bundled to the client (unlike NEXT_PUBLIC_* vars, this is read at
// request time, not baked in at `npm run build`).
export const anthropic = new Anthropic();
