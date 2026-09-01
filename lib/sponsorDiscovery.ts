import { GoogleGenerativeAI } from "@google/generative-ai";
import { Pool } from "pg";

const pool = new Pool({
  host: process.env.PGHOST || "nara-postgres",
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER || "nara_user",
  password: process.env.PGPASSWORD || "",
  database: process.env.PGDATABASE || "nara_db",
});

export type Sponsor = {
  id: string;
  name: string;
  type: string;
  category: string;
  description: string;
  target_audience: string;
  stage: string;
  location: string;
  contact_info: string;
};

export type SponsorMatch = Sponsor & {
  matchScore: number;
  matchReason: string;
  matchedBy: "groq" | "gemini" | "openai" | "claude" | "keyword";
};

const TOP_N = 3;
const PREFILTER_N = 6;

async function loadSponsors(): Promise<Sponsor[]> {
  const result = await pool.query(`SELECT * FROM sponsors`);
  return result.rows;
}

function normalize(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function keywordScore(need: string, sponsor: Sponsor): number {
  const needTokens = normalize(need).split(/\W+/).filter(Boolean);
  const haystack = normalize(
    [sponsor.name, sponsor.category, sponsor.description, sponsor.target_audience].join(" ")
  );
  let score = 0;
  for (const token of needTokens) {
    if (token.length < 3) continue;
    if (haystack.includes(token)) score += 1;
  }
  return score;
}

function keywordMatch(need: string, sponsors: Sponsor[], topN = TOP_N): SponsorMatch[] {
  return sponsors
    .map((s) => ({ sponsor: s, score: keywordScore(need, s) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(({ sponsor, score }) => ({
      ...sponsor,
      matchScore: score,
      matchReason:
        score > 0
          ? "Correspondência por palavras-chave do seu pedido."
          : "Sem correspondência forte — sugestão de reserva.",
      matchedBy: "keyword" as const,
    }));
}

function prefilterCandidates(need: string, sponsors: Sponsor[], n = PREFILTER_N): Sponsor[] {
  const scored = sponsors.map((s) => ({ sponsor: s, score: keywordScore(need, s) }));
  scored.sort((a, b) => b.score - a.score);
  const anySignal = scored.some((s) => s.score > 0);
  const shortlist = anySignal ? scored.slice(0, n) : scored;
  return shortlist.map((s) => s.sponsor);
}

function buildPrompt(need: string, candidates: Sponsor[]): string {
  return `Você é a NARA, assistente que conecta a necessidade de uma pessoa ao patrocinador/oportunidade mais adequado de uma lista.

NECESSIDADE DO USUÁRIO:
"${need}"

PATROCINADORES CANDIDATOS (JSON):
${JSON.stringify(candidates, null, 2)}

TAREFA:
Responda APENAS com JSON válido (sem markdown, sem texto extra, sem blocos de código), neste formato exato:
{
  "matches": [
    { "id": "sponsor_XXX", "score": 0-100, "reason": "uma frase curta explicando a compatibilidade" }
  ]
}

Retorne os ${TOP_N} melhores matches, do melhor para o pior. Se nada combinar bem, ainda assim retorne suas ${TOP_N} melhores tentativas com scores honestos e baixos.`;
}

function attachSponsorDetails(
  aiMatches: { id: string; score: number; reason: string }[],
  sponsors: Sponsor[]
): Omit<SponsorMatch, "matchedBy">[] {
  const byId = Object.fromEntries(sponsors.map((s) => [s.id, s]));
  return aiMatches
    .filter((m) => byId[m.id])
    .map((m) => ({
      ...byId[m.id],
      matchScore: m.score,
      matchReason: m.reason,
    }));
}

function parseAIJson(raw: string): { matches: { id: string; score: number; reason: string }[] } {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

async function tryGroq(need: string, candidates: Sponsor[]): Promise<SponsorMatch[]> {
  const groqKey = process.env.GROQ_API_KEY;
  const groqModel = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  if (!groqKey) throw new Error("Chave da API Groq não configurada");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model: groqModel,
      messages: [{ role: "user", content: buildPrompt(need, candidates) }],
    }),
  });

  if (!res.ok) throw new Error(`Groq API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "";
  if (!raw) throw new Error("Groq retornou conteúdo vazio");

  const parsed = parseAIJson(raw);
  const matched = attachSponsorDetails(parsed.matches || [], candidates);
  if (!matched.length) throw new Error("Groq não retornou matches válidos");
  return matched.map((m) => ({ ...m, matchedBy: "groq" as const }));
}

async function tryGemini(need: string, candidates: Sponsor[]): Promise<SponsorMatch[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  if (!apiKey) throw new Error("Chave da API Gemini não configurada");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(buildPrompt(need, candidates));
  const raw = result.response.text();
  if (!raw) throw new Error("Gemini retornou conteúdo vazio");

  const parsed = parseAIJson(raw);
  const matched = attachSponsorDetails(parsed.matches || [], candidates);
  if (!matched.length) throw new Error("Gemini não retornou matches válidos");
  return matched.map((m) => ({ ...m, matchedBy: "gemini" as const }));
}

async function tryOpenAI(need: string, candidates: Sponsor[]): Promise<SponsorMatch[]> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!openaiKey) throw new Error("Chave da API OpenAI não configurada");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: openaiModel,
      messages: [{ role: "user", content: buildPrompt(need, candidates) }],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "";
  if (!raw) throw new Error("OpenAI retornou conteúdo vazio");

  const parsed = parseAIJson(raw);
  const matched = attachSponsorDetails(parsed.matches || [], candidates);
  if (!matched.length) throw new Error("OpenAI não retornou matches válidos");
  return matched.map((m) => ({ ...m, matchedBy: "openai" as const }));
}

async function tryClaude(need: string, candidates: Sponsor[]): Promise<SponsorMatch[]> {
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  const claudeModel = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  if (!claudeKey) throw new Error("Chave da API Anthropic não configurada");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": claudeKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: claudeModel,
      max_tokens: 1000,
      messages: [{ role: "user", content: buildPrompt(need, candidates) }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const raw = data.content?.[0]?.text || "";
  if (!raw) throw new Error("Claude retornou conteúdo vazio");

  const parsed = parseAIJson(raw);
  const matched = attachSponsorDetails(parsed.matches || [], candidates);
  if (!matched.length) throw new Error("Claude não retornou matches válidos");
  return matched.map((m) => ({ ...m, matchedBy: "claude" as const }));
}

export async function matchSponsors(need: string): Promise<SponsorMatch[]> {
  if (!need || !need.trim()) {
    throw new Error("matchSponsors: texto de necessidade é obrigatório");
  }

  const sponsors = await loadSponsors();
  const candidates = prefilterCandidates(need, sponsors);

  const providers: { name: string; fn: () => Promise<SponsorMatch[]> }[] = [
    { name: "groq", fn: () => tryGroq(need, candidates) },
    { name: "gemini", fn: () => tryGemini(need, candidates) },
    { name: "openai", fn: () => tryOpenAI(need, candidates) },
    { name: "claude", fn: () => tryClaude(need, candidates) },
  ];

  for (const provider of providers) {
    try {
      const matches = await provider.fn();
      if (matches.length) return matches;
    } catch (err: any) {
      console.error(`Erro Sponsor Discovery (${provider.name} falhou):`, err.message);
    }
  }

  console.warn("Sponsor Discovery: todos os provedores de IA falharam, usando keyword match");
  return keywordMatch(need, sponsors);
}
// ---------- Tier 5: SerpApi (live web results) ----------
// Not part of the AI provider fallback chain — this runs ALONGSIDE it to
// pull real, live external links (e.g. "5 similar project links") that
// your seeded Postgres sponsors table can never have.

export type WebSponsorMatch = {
  id: string;
  name: string;
  description: string;
  url: string;
  matchReason: string;
  matchedBy: "serpapi";
};

export async function getWebSponsors(need: string, limit = 5): Promise<WebSponsorMatch[]> {
  const serpApiKey = process.env.SERPAPI_KEY;
  if (!serpApiKey) {
    console.warn("SERPAPI_KEY não configurada — pulando busca web");
    return [];
  }
  if (!need || !need.trim()) return [];

  try {
    const query = `${need} financiamento OR patrocínio OR bolsa OR edital Brasil`;
    const params = new URLSearchParams({
      engine: "google",
      q: query,
      api_key: serpApiKey,
      hl: "pt-br",
      gl: "br",
      num: String(limit),
    });

    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
    if (!res.ok) throw new Error(`SerpApi error: ${res.status} ${await res.text()}`);

    const data = await res.json();
    const results = (data.organic_results || []).slice(0, limit);

    return results.map((r: any, i: number) => ({
      id: `web_${i}_${Date.now()}`,
      name: r.title || "Oportunidade encontrada",
      description: r.snippet || "",
      url: r.link,
      matchReason: "Encontrado via busca ao vivo relacionada à sua necessidade.",
      matchedBy: "serpapi" as const,
    }));
  } catch (err: any) {
    console.error("Erro Sponsor Discovery (serpapi falhou):", err.message);
    return [];
  }
}
