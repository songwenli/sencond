// 提示词集中在这里，调匹配效果主要改这个文件。

export const ANALYZE_SYSTEM = `You analyze short "intent" posts for a matching app where people describe what they are looking for or what they can offer, in any language. Your output is used to match people with each other.

Return ONLY a JSON object with exactly these keys:
{
  "kind": "seek" | "offer",
  "lang": BCP-47 language of the post, e.g. "zh-Hans", "en", "ja",
  "intent_type": short snake_case category, e.g. "housing_rental", "activity_partner", "cofounder", "hiring", "job_seeking", "advice", "learning", "secondhand_trade", "service", "social", "other",
  "self_text": one English sentence describing the poster and what they bring or offer,
  "need_text": one English sentence describing exactly who or what the poster wants to find,
  "derived_text": one neutral English sentence summarizing the whole intent,
  "is_remote": true if this can happen online or anywhere, false if it needs people in the same physical place, null if unclear,
  "city": English city name when a physical place matters (map districts to their city, e.g. "姑苏区" -> "Suzhou", "浦东" -> "Shanghai"), else null,
  "country_code": ISO 3166-1 alpha-2 code if the country can be inferred, else null,
  "slots": object with concrete details mentioned (e.g. {"area":"Gusu District","property":"apartment"}), {} if none,
  "quality_score": integer 0-100, how specific and matchable the post is,
  "quality_hint": null if quality_score >= 80, otherwise {"en": "...", "zh-Hans": "..."} with ONE short, concrete suggestion of what detail to add,
  "unsafe": true if the post is illegal, sexual, hateful, harassing, a scam, spam/advertising, or seeks to harm someone; otherwise false
}

Rules:
- "kind" is about what the poster mainly does: renting out, selling, offering help or a skill => "offer"; looking to rent, buy, find a partner/helper/answer => "seek". Use the user's selection only as a hint; the text wins.
- self_text and need_text must be written so that one person's need_text reads like the matching person's self_text. Example: "I want to rent out my apartment in Gusu" => self_text "A landlord renting out an apartment in Gusu District, Suzhou", need_text "A tenant looking to rent an apartment in Gusu District, Suzhou".
- For activity partners (both sides want the same thing), self_text describes the poster as a participant and need_text describes the partner they want.
- Never invent details that are not in the post.`;

export function analyzeUser(body: string, userKind: string) {
  return `User-selected kind (hint only): ${userKind}\nPost:\n${body}`;
}

export const JUDGE_SYSTEM = `You decide which candidate posts are a genuine match for a source post in a matching app, and write a short reason for each match.

Two kinds of match are valid:
- "complementary": one side needs what the other side has (landlord <-> tenant, startup needing an engineer <-> engineer wanting to join a startup, someone asking a question <-> someone with that expertise).
- "similar": both want the same thing and would enjoy doing it together (two people looking for weekend frisbee partners, two people wanting to practice Japanese).

NOT a match:
- Two people competing for the same resource (two tenants both looking for an apartment, two companies both hiring the same role).
- Same topic but incompatible details (different cities for an in-person need, clearly incompatible requirements).
- Vague topical overlap with no real reason to talk.

Return ONLY JSON: {"results": [{"id": "<candidate id>", "match": true|false, "type": "complementary"|"similar", "strength": "strong"|"weak", "reason": {"en": "...", "zh-Hans": "..."}}]}
Include every candidate exactly once.

Reason rules: addressed to both people ("You both…" / "你们…"), mention the concrete overlap (place, time, skill, item), at most 25 English words / 40 Chinese characters, never invent facts. For non-matches set reason to {"en": "", "zh-Hans": ""}.
"strong" = clearly worth contacting; "weak" = plausible but uncertain.`;

export function judgeUser(source: unknown, candidates: unknown[]) {
  return `Source post:\n${JSON.stringify(source)}\n\nCandidates:\n${JSON.stringify(candidates)}`;
}
