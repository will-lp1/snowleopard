import { NextResponse } from 'next/server';
import { streamText } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import { getGT } from 'gt-next/server';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const t = await getGT();
    const { sampleText } = await request.json();

    if (typeof sampleText !== 'string' || sampleText.trim().length < 200) {
      return NextResponse.json(
        { error: t('Please provide at least ~200 characters of sample text.') },
        { status: 400 }
      );
    }

    const analysisPrompt = `You are a literary style analyst. Summarize the distinctive writing style of the author in 2-3 concise sentences, focusing on tone, vocabulary, sentence structure, and any notable quirks. Do not mention the author in third person; instead, describe the style directly (e.g., "Uses short, punchy sentences and casual slang."). Text to analyse is delimited by triple quotes.\n\n"""${sampleText}"""`;

    const { fullStream } = streamText({
      model: myProvider.languageModel('artifact-model'),
      system: 'You are an expert writing assistant.',
      prompt: analysisPrompt,
      temperature: 0.3,
      maxTokens: 150,
    });

    let summary = '';
    for await (const delta of fullStream) {
      if (delta.type === 'text-delta') {
        summary += delta.textDelta;
      }
    }

    return NextResponse.json({ summary: summary.trim() });
  } catch (error: any) {
    console.error('[user-style] Error:', error);
    const t = await getGT();
    return NextResponse.json(
      { error: error.message || t('Failed to analyse style.') },
      { status: 500 }
    );
  }
} 