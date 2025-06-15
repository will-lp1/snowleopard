import { tool } from 'ai';
import { z } from 'zod';

export const highlightBlogText = tool({
  description:
    "Highlights a specific quote from the blog post that is being discussed. Use this to draw the user's attention to a relevant part of the text.",
  parameters: z.object({
    quote: z.string().describe(
      'The exact, verbatim quote to highlight. This must be a perfect substring of the blog post content, without any modifications or added quotation marks.',
    ),
  }),
  execute: async ({ quote }) => {
    return {
      quote,
      status: `Highlighting: "${quote}"`,
    };
  },
}); 