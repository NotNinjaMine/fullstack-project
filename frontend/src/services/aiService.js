import api from "./api";

// AI-1 natural-language leave parsing (hosted LLM on the server, heuristic fallback)
export const parseLeaveText = (text) => api.post("/ai/parse", { text }).then((res) => res.data);
