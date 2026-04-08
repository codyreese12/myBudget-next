import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { descriptions, categories } = (await req.json()) as {
      descriptions: string[];
      categories: string[];
    };

    if (!descriptions?.length) return NextResponse.json({});

    const categoryNames = categories.join(', ');
    const prompt = `You are a financial transaction categorizer. Given merchant names or transaction descriptions, assign each to the most appropriate category.

Available categories: ${categoryNames}

Rules:
- Gas stations, fuel, petrol → Transportation & Gas
- Charities, donations, churches, nonprofits → Gifts & Donations
- IRS, tax refunds, government payments → Wages & Salary (income)
- Uber/Lyft driver payouts → Wages & Salary (income)
- Payroll, direct deposits → Wages & Salary (income)
- Restaurants, cafes, food delivery → Dining & Restaurants
- Grocery stores, supermarkets → Groceries
- Streaming services → Entertainment
- Software subscriptions → Subscriptions
- Clothing retailers → Clothing & Apparel
- Pharmacies, gyms, doctors → Health & Fitness

Merchants to categorize:
${descriptions.map((d, i) => `${i + 1}. ${d}`).join('\n')}

Respond with ONLY a valid JSON object mapping each description to its category. No explanation, no markdown, no backticks. Example: {"Trader Joe's": "Groceries", "Netflix": "Entertainment"}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) return NextResponse.json({});

    const data = (await response.json()) as { content?: Array<{ text: string }> };
    const text = data.content?.[0]?.text ?? '{}';
    const result = JSON.parse(text.replace(/```json|```/g, '').trim()) as Record<string, string>;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({});
  }
}
