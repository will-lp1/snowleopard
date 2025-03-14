import { anthropic } from '@ai-sdk/anthropic'
import { streamText, tool, createDataStreamResponse, customProvider, convertToCoreMessages } from 'ai';
import Exa from 'exa-js';
import { z } from 'zod';
import { tavily } from '@tavily/core';
import FirecrawlApp from '@mendable/firecrawl-js';

// Allow streaming responses up to 60 seconds (adjust as needed)
export const maxDuration = 60;

// Define custom AI provider
const aiProvider = customProvider({
  languageModels: {
    'claude': anthropic('claude-3-opus-20240229'),
    'sonnet': anthropic('claude-3-sonnet-20240229')
  }
})

// Utility functions for search results
function sanitizeUrl(url: string): string {
  return url.replace(/\s+/g, '%20');
}

async function isValidImageUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    return response.ok && (response.headers.get('content-type')?.startsWith('image/') ?? false);
  } catch {
    return false;
  }
}

const extractDomain = (url: string): string => {
  const urlPattern = /^https?:\/\/([^/?#]+)(?:[/?#]|$)/i;
  return url.match(urlPattern)?.[1] || url;
};

const deduplicateByDomainAndUrl = <T extends { url: string }>(items: T[]): T[] => {
  const seenDomains = new Set<string>();
  const seenUrls = new Set<string>();

  return items.filter(item => {
    const domain = extractDomain(item.url);
    const isNewUrl = !seenUrls.has(item.url);
    const isNewDomain = !seenDomains.has(domain);

    if (isNewUrl && isNewDomain) {
      seenUrls.add(item.url);
      seenDomains.add(domain);
      return true;
    }
    return false;
  });
};

// Processing search results
interface XResult {
  id: string;
  url: string;
  title: string;
  author?: string;
  publishedDate?: string;
  text: string;
  highlights?: string[];
  tweetId: string;
}

// Main API handler
export async function POST(req: Request) {
  const { messages, model = 'sonnet' } = await req.json();

  return createDataStreamResponse({
    execute: async (dataStream) => {
      const toolsResult = streamText({
        model: aiProvider.languageModel(model),
        messages: convertToCoreMessages(messages),
        temperature: 0,
        system: `You are a helpful search assistant that uses tools to find information on the web. 
                Use the provided tools to search for information and answer the user's questions.
                Always strive to find the most recent and relevant information.`,
        experimental_activeTools: [
          'web_search', 
          'academic_search', 
          'x_search', 
          'retrieve'
        ],
        toolChoice: 'auto',
        tools: {
          web_search: tool({
            description: 'Search the web for information with multiple queries, max results and search depth.',
            parameters: z.object({
              queries: z.array(z.string().describe('Array of search queries to look up on the web.')),
              maxResults: z.array(
                z.number().describe('Array of maximum number of results to return per query.').default(10),
              ),
              topics: z.array(
                z.enum(['general', 'news']).describe('Array of topic types to search for.').default('general'),
              ),
              searchDepth: z.array(
                z.enum(['basic', 'advanced']).describe('Array of search depths to use.').default('basic'),
              ),
              exclude_domains: z
                .array(z.string())
                .describe('A list of domains to exclude from all search results.')
                .default([]),
            }),
            execute: async ({
              queries,
              maxResults,
              topics,
              searchDepth,
              exclude_domains,
            }: {
              queries: string[];
              maxResults: number[];
              topics: ('general' | 'news')[];
              searchDepth: ('basic' | 'advanced')[];
              exclude_domains?: string[];
            }) => {
              // Replace with your Tavily API key
              const apiKey = "YOUR_TAVILY_API_KEY";
              const tvly = tavily({ apiKey });
              const includeImageDescriptions = true;

              console.log('Queries:', queries);
              console.log('Max Results:', maxResults);
              console.log('Topics:', topics);
              console.log('Search Depths:', searchDepth);
              console.log('Exclude Domains:', exclude_domains);

              // Execute searches in parallel
              const searchPromises = queries.map(async (query, index) => {
                try {
                  const data = await tvly.search(query, {
                    topic: topics[index] || topics[0] || 'general',
                    days: topics[index] === 'news' ? 7 : undefined,
                    maxResults: maxResults[index] || maxResults[0] || 10,
                    searchDepth: searchDepth[index] || searchDepth[0] || 'basic',
                    includeAnswer: true,
                    includeImages: true,
                    includeImageDescriptions: includeImageDescriptions,
                    excludeDomains: exclude_domains,
                  });

                  // Add annotation for query completion
                  dataStream.writeMessageAnnotation({
                    type: 'query_completion',
                    data: {
                      query,
                      index,
                      total: queries.length,
                      status: 'completed',
                      resultsCount: data.results.length,
                      imagesCount: data.images?.length || 0
                    }
                  });

                  return {
                    query,
                    results: deduplicateByDomainAndUrl(data.results).map((obj: any) => ({
                      url: obj.url,
                      title: obj.title,
                      content: obj.content,
                      raw_content: obj.raw_content,
                      published_date: topics[index] === 'news' ? obj.published_date : undefined,
                    })),
                    images: includeImageDescriptions
                      ? await Promise.all(
                        deduplicateByDomainAndUrl(data.images || []).map(
                          async ({ url, description }: { url: string; description?: string }) => {
                            const sanitizedUrl = sanitizeUrl(url);
                            const isValid = await isValidImageUrl(sanitizedUrl);
                            return isValid
                              ? {
                                url: sanitizedUrl,
                                description: description ?? '',
                              }
                              : null;
                          },
                        ),
                      ).then((results) =>
                        results.filter(
                          (image): image is { url: string; description: string } =>
                            image !== null &&
                            typeof image === 'object' &&
                            typeof image.description === 'string' &&
                            image.description !== '',
                        ),
                      )
                      : await Promise.all(
                        deduplicateByDomainAndUrl(data.images || []).map(async ({ url }: { url: string }) => {
                          const sanitizedUrl = sanitizeUrl(url);
                          return (await isValidImageUrl(sanitizedUrl)) ? sanitizedUrl : null;
                        }),
                      ).then((results) => results.filter((url) => url !== null) as string[]),
                  };
                } catch (error) {
                  console.error(`Error searching for "${query}":`, error);
                  return {
                    query,
                    results: [],
                    images: []
                  };
                }
              });

              const searchResults = await Promise.all(searchPromises);

              return {
                searches: searchResults,
              };
            },
          }),
          academic_search: tool({
            description: 'Search academic papers and research.',
            parameters: z.object({
              query: z.string().describe('The search query'),
            }),
            execute: async ({ query }: { query: string }) => {
              try {
                // Replace with your Exa API key
                const exa = new Exa("YOUR_EXA_API_KEY");

                // Search academic papers with content summary
                const result = await exa.searchAndContents(query, {
                  type: 'auto',
                  numResults: 20,
                  category: 'research paper',
                  summary: {
                    query: 'Abstract of the Paper',
                  },
                });

                // Process and clean results
                const processedResults = result.results.reduce<typeof result.results>((acc, paper) => {
                  // Skip if URL already exists or if no summary available
                  if (acc.some((p) => p.url === paper.url) || !paper.summary) return acc;

                  // Clean up summary (remove "Summary:" prefix if exists)
                  const cleanSummary = paper.summary.replace(/^Summary:\s*/i, '');

                  // Clean up title (remove [...] suffixes)
                  const cleanTitle = paper.title?.replace(/\s\[.*?\]$/, '');

                  acc.push({
                    ...paper,
                    title: cleanTitle || '',
                    summary: cleanSummary,
                  });

                  return acc;
                }, []);

                // Take only the first 10 unique, valid results
                const limitedResults = processedResults.slice(0, 10);

                return {
                  results: limitedResults,
                };
              } catch (error) {
                console.error('Academic search error:', error);
                throw error;
              }
            },
          }),
          x_search: tool({
            description: 'Search X (formerly Twitter) posts.',
            parameters: z.object({
              query: z.string().describe('The search query, if a username is provided put in the query with @username'),
              startDate: z.string().optional().describe('The start date for the search in YYYY-MM-DD format'),
              endDate: z.string().optional().describe('The end date for the search in YYYY-MM-DD format'),
            }),
            execute: async ({
              query,
              startDate,
              endDate,
            }: {
              query: string;
              startDate?: string;
              endDate?: string;
            }) => {
              try {
                // Replace with your Exa API key
                const exa = new Exa("YOUR_EXA_API_KEY");

                const result = await exa.searchAndContents(query, {
                  type: 'keyword',
                  numResults: 15,
                  text: true,
                  highlights: true,
                  includeDomains: ['twitter.com', 'x.com'],
                  startPublishedDate: startDate,
                  endPublishedDate: endDate,
                });

                // Extract tweet ID from URL
                const extractTweetId = (url: string): string | null => {
                  const match = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
                  return match ? match[1] : null;
                };

                // Process and filter results
                const processedResults = result.results.reduce<Array<XResult>>((acc, post) => {
                  const tweetId = extractTweetId(post.url);
                  if (tweetId) {
                    acc.push({
                      ...post,
                      tweetId,
                      title: post.title || '',
                    });
                  }
                  return acc;
                }, []);

                return processedResults;
              } catch (error) {
                console.error('X search error:', error);
                throw error;
              }
            },
          }),
          retrieve: tool({
            description: 'Retrieve the information from a URL using Firecrawl.',
            parameters: z.object({
              url: z.string().describe('The URL to retrieve the information from.'),
            }),
            execute: async ({ url }: { url: string }) => {
              // Replace with your Firecrawl API key
              const app = new FirecrawlApp({
                apiKey: "YOUR_FIRECRAWL_API_KEY",
              });
              try {
                const content = await app.scrapeUrl(url);
                if (!content.success || !content.metadata) {
                  return {
                    results: [{
                      error: content.error
                    }]
                  };
                }

                // Define schema for extracting missing content
                const schema = z.object({
                  title: z.string(),
                  content: z.string(),
                  description: z.string()
                });

                let title = content.metadata.title;
                let description = content.metadata.description;
                let extractedContent = content.markdown;

                // If any content is missing, use extract to get it
                if (!title || !description || !extractedContent) {
                  const extractResult = await app.extract([url], {
                    prompt: "Extract the page title, main content, and a brief description.",
                    schema: schema
                  });

                  if (extractResult.success && extractResult.data) {
                    title = title || extractResult.data.title;
                    description = description || extractResult.data.description;
                    extractedContent = extractedContent || extractResult.data.content;
                  }
                }

                return {
                  results: [
                    {
                      title: title || 'Untitled',
                      content: extractedContent || '',
                      url: content.metadata.sourceURL,
                      description: description || '',
                      language: content.metadata.language,
                    },
                  ],
                };
              } catch (error) {
                console.error('Firecrawl API error:', error);
                return { error: 'Failed to retrieve content' };
              }
            },
          }),
        },
      });

      toolsResult.mergeIntoDataStream(dataStream, {
        experimental_sendFinish: false
      });

      const response = streamText({
        model: aiProvider.languageModel(model),
        system: `You are a helpful search assistant that uses search tools to find information.
                Present the information in a clear, concise manner. 
                Always cite your sources by including URLs from the search results.
                If information might be outdated, acknowledge this limitation.`,
        messages: [...convertToCoreMessages(messages), ...(await toolsResult.response).messages],
      });

      return response.mergeIntoDataStream(dataStream, {
        experimental_sendStart: true,
      });
    }
  });
} 