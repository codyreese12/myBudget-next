import { NextRequest, NextResponse } from 'next/server';

interface TxSummary {
  id: string;
  date: string;
  amt: number;
  desc: string;
  cat: string;
  tags?: string[];
  acct?: string;
  recurring?: boolean;
  transfer?: boolean;
  excluded?: boolean;
}

interface AiResult {
  matchedIds: string[];
  answerType: 'total' | 'list' | 'average' | 'count' | 'top_n';
  label: string;
  topN?: number;
}

function usd(n: number) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function POST(req: NextRequest) {
  try {
    const { question, transactions, history } = (await req.json()) as {
      question: string;
      transactions: TxSummary[];
      history: { role: 'user' | 'assistant'; content: string }[];
    };

    if (!question?.trim() || !transactions?.length) {
      return NextResponse.json({ error: 'Missing question or transactions' }, { status: 400 });
    }

    const today = new Date().toISOString().split('T')[0];
    const txJson = JSON.stringify(transactions);

    const system = `You are a financial assistant. The user has ${transactions.length} transactions. Today is ${today}.

Transaction data (JSON array — fields: id, date YYYY-MM-DD, amt positive=expense negative=income, desc, cat, tags optional, acct optional, recurring optional bool, transfer optional bool, excluded optional bool):
${txJson}

Your ONLY job is to understand the user's question, identify which transaction IDs match, and specify what computation to perform. Do NOT compute any math — the app does that.

Return ONLY a JSON object (no markdown, no explanation):
{
  "matchedIds": string[],        // IDs of matching transactions
  "answerType": "total" | "list" | "average" | "count" | "top_n",
  "label": string,               // concise label, e.g. "Dining in March"
  "topN": number                 // only when answerType is "top_n"
}

Rules:
- For spending/total questions: use answerType "total", exclude excluded/transfer transactions unless asked
- For "show me" / "which" / "list" questions: use answerType "list"
- For "average" / "how much on average": use answerType "average"
- For "how many" / "count": use answerType "count"
- For "top N" / "highest N": use answerType "top_n" with topN=N, include ALL candidates in matchedIds (app sorts and slices)
- "last month" means the full calendar month before today; "this month" means the current calendar month
- For subscriptions: match cat="Subscriptions" OR recurring=true
- Income = amt < 0; expenses = amt > 0
- If nothing matches, return matchedIds: []`;

    const messages = [
      ...history,
      { role: 'user' as const, content: question },
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        system,
        messages,
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 });
    }

    const data = (await response.json()) as { content?: Array<{ text: string }> };
    const rawText = data.content?.[0]?.text ?? '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const aiResult = jsonMatch ? (JSON.parse(jsonMatch[0]) as AiResult) : { matchedIds: [], answerType: 'list' as const, label: '' };

    const txMap = new Map(transactions.map((t) => [t.id, t]));
    let matched = (aiResult.matchedIds ?? [])
      .map((id) => txMap.get(id))
      .filter((t): t is TxSummary => !!t);

    // Compute answer in code — AI does no math
    let answer = '';
    const { answerType, label, topN } = aiResult;

    if (matched.length === 0) {
      answer = 'No matching transactions found.';
    } else if (answerType === 'total') {
      const total = matched.reduce((s, t) => s + t.amt, 0);
      answer = `${usd(total)} across ${matched.length} transaction${matched.length !== 1 ? 's' : ''}`;
    } else if (answerType === 'average') {
      const avg = matched.reduce((s, t) => s + t.amt, 0) / matched.length;
      answer = `${usd(avg)} avg · ${matched.length} transaction${matched.length !== 1 ? 's' : ''}`;
    } else if (answerType === 'count') {
      answer = `${matched.length} transaction${matched.length !== 1 ? 's' : ''}`;
    } else if (answerType === 'top_n') {
      const n = topN ?? 5;
      matched = matched.sort((a, b) => b.amt - a.amt).slice(0, n);
      answer = `Top ${matched.length} by amount`;
    } else {
      answer = `${matched.length} transaction${matched.length !== 1 ? 's' : ''}`;
    }

    return NextResponse.json({
      matchedIds: matched.map((t) => t.id),
      answer,
      label: label ?? question,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to process question' }, { status: 500 });
  }
}
