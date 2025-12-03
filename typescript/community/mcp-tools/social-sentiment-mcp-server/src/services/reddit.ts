/**
 * Reddit API client using snoowrap
 * Free tier: 100 requests/min (OAuth) or 10/min (no OAuth)
 */

import snoowrap from 'snoowrap';

let redditClient: snoowrap | null = null;

/**
 * Initialize Reddit client
 */
export function initRedditClient(): snoowrap {
  if (redditClient) {
    return redditClient;
  }

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const userAgent = process.env.REDDIT_USER_AGENT || 'social-sentiment-mcp/1.0.0';

  if (!clientId || !clientSecret) {
    throw new Error('Reddit API credentials not configured. Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET');
  }

  redditClient = new snoowrap({
    userAgent,
    clientId,
    clientSecret,
    grantType: 'client_credentials',
  });

  return redditClient;
}

/**
 * Search Reddit for token mentions
 */
export async function searchRedditForToken(tokenSymbol: string, timeRangeHours = 24): Promise<{
  posts: Array<{
    title: string;
    content: string;
    score: number;
    comments: number;
    timestamp: Date;
    subreddit: string;
    url: string;
  }>;
  totalMentions: number;
}> {
  const client = initRedditClient();

  // Search in crypto-related subreddits
  const subreddits = ['cryptocurrency', 'ethereum', 'defi', 'CryptoCurrency', 'ethtrader'];
  const allPosts: Array<{
    title: string;
    content: string;
    score: number;
    comments: number;
    timestamp: Date;
    subreddit: string;
    url: string;
  }> = [];

  const searchQuery = tokenSymbol.toUpperCase();
  const timeLimit = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);

  for (const subreddit of subreddits) {
    try {
      // Search for posts containing the token symbol
      const posts = await client.getSubreddit(subreddit).search({
        query: searchQuery,
        sort: 'new',
        time: 'day',
        limit: 25,
      });

      for (const post of posts) {
        const postDate = new Date(post.created_utc * 1000);
        if (postDate >= timeLimit) {
          allPosts.push({
            title: post.title,
            content: post.selftext || '',
            score: post.score,
            comments: post.num_comments,
            timestamp: postDate,
            subreddit: subreddit,
            url: post.url,
          });
        }
      }

      // Rate limiting: be respectful
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error searching subreddit ${subreddit}:`, error);
      // Continue with other subreddits
    }
  }

  return {
    posts: allPosts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
    totalMentions: allPosts.length,
  };
}

/**
 * Get comments from a Reddit post
 */
export async function getPostComments(postUrl: string, limit = 50): Promise<Array<{
  content: string;
  score: number;
  timestamp: Date;
}>> {
  const client = initRedditClient();

  try {
    const submission = await client.getSubmission(postUrl.split('/').pop() || '').fetch();
    await submission.expandReplies({ limit, depth: 2 });

    const comments: Array<{
      content: string;
      score: number;
      timestamp: Date;
    }> = [];

    submission.comments.forEach((comment: any) => {
      if (comment.body && !comment.body.includes('[deleted]')) {
        comments.push({
          content: comment.body,
          score: comment.score,
          timestamp: new Date(comment.created_utc * 1000),
        });
      }
    });

    return comments;
  } catch (error) {
    console.error('Error fetching post comments:', error);
    return [];
  }
}

