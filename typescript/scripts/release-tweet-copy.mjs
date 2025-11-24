#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable no-console */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const MAX_TWEET_LENGTH = 280;

function readSummaryFile(summaryPath) {
  const absolutePath = path.resolve(process.cwd(), summaryPath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`[tweet] Release summary file not found: ${absolutePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(absolutePath, 'utf8');

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error('[tweet] Failed to parse release summary JSON:', error);
    process.exit(1);
  }
}

function writeSummaryFile(summaryPath, summary) {
  const absolutePath = path.resolve(process.cwd(), summaryPath);

  try {
    fs.writeFileSync(absolutePath, JSON.stringify(summary, null, 2), 'utf8');
    console.log(`[tweet] Updated release summary with tweet: ${absolutePath}`);
  } catch (error) {
    console.error('[tweet] Failed to write release summary:', error);
    process.exit(1);
  }
}

function pickReleasedPackage(summary) {
  if (!summary || typeof summary !== 'object' || !Array.isArray(summary.packages)) {
    return null;
  }

  const released = summary.packages.filter(
    (pkg) =>
      pkg &&
      typeof pkg === 'object' &&
      pkg.released === true &&
      typeof pkg.package === 'string' &&
      typeof pkg.version === 'string',
  );
  return released.length > 0 ? released[0] : null;
}

async function fetchReleaseNotes(url) {
  if (!url || !url.includes('github.com')) {
    return null;
  }

  try {
    // Extract owner, repo, and tag from GitHub release URL
    // Format: https://github.com/EmberAGI/arbitrum-vibekit/releases/tag/@emberai/agent-node@1.3.0
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/releases\/tag\/(.+)/);
    if (!match) {
      return null;
    }

    const [, owner, repo, tag] = match;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`;

    const response = await fetch(apiUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Vibekit-Release-Tweet-Generator',
      },
    });

    if (!response.ok) {
      console.warn(`[tweet] Failed to fetch release notes: ${response.status}`);
      return null;
    }

    const release = await response.json();
    return release.body || null;
  } catch (error) {
    console.warn('[tweet] Error fetching release notes:', error.message);
    return null;
  }
}

async function generateTweetWithAI(pkg, url, releaseNotes) {
  const openaiKey = process.env.OPENAI_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  if (!openaiKey && !openrouterKey) {
    // Fallback to simple template if no API keys
    return `🚀 ${pkg.package}@${pkg.version} is live!\n\n✨ New features & improvements\n🐛 Bug fixes & enhancements\n📚 Better documentation\n\n🔗 ${url}`;
  }

  const releaseNotesContext = releaseNotes
    ? `\n\nRelease Notes:\n${releaseNotes.slice(0, 1000)}` // Limit to first 1000 chars
    : '\n\n(No release notes available - focus on the package capabilities)';

  const prompt = `You are a social media manager crafting an engaging tweet for a new software release.

Package: ${pkg.package}
Version: ${pkg.version}
Package Name: ${pkg.name}
Release URL: ${url}${releaseNotesContext}

Create a compelling tweet that:
1. MUST be under 250 characters total (strict limit to ensure it fits with URL)
2. Announces the release with excitement
3. Highlights ONE key feature or improvement that developers will actually care about
4. Uses 1-2 relevant emojis strategically
5. Includes the release URL at the end

CRITICAL RULES:
- IGNORE: config files, .env examples, documentation updates, template files, build/CI changes
- FOCUS ON: new features, API changes, performance gains, important bug fixes, new capabilities
- Pick the MOST IMPACTFUL user-facing change and be SPECIFIC about what it does
- If the release only has minor changes/fixes with no major features, say: "Bug fixes, stability improvements & enhanced performance"
- Be honest and specific - don't oversell minor releases with vague marketing speak
- Keep it concise and exciting!

Format: [Emoji] [Package]@[Version] - [One impactful feature in ~15 words] [URL]

Respond with ONLY the tweet text, no explanations or additional text.`;

  try {
    const USE_OPENROUTER = !!openrouterKey;
    const { default: OpenAI } = await import('openai');

    const openai = USE_OPENROUTER
      ? new OpenAI({
          apiKey: openrouterKey,
          baseURL: 'https://openrouter.ai/api/v1',
          defaultHeaders: {
            'HTTP-Referer': 'https://github.com/EmberAGI/arbitrum-vibekit',
            'X-Title': 'Vibekit Release Tweet Generator',
          },
        })
      : new OpenAI({ apiKey: openaiKey });

    const response = await openai.chat.completions.create({
      model: USE_OPENROUTER ? 'openai/gpt-4o-mini' : 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.7,
    });

    const tweet = response.choices[0]?.message?.content?.trim();

    if (!tweet) {
      throw new Error('AI generated empty tweet response');
    }

    if (tweet.length > MAX_TWEET_LENGTH) {
      console.warn(`[tweet] AI generated tweet too long (${tweet.length} chars), using fallback`);
      throw new Error('Generated tweet exceeds max length');
    }

    return tweet;
  } catch (error) {
    console.warn('[tweet] AI generation failed, using fallback:', error.message);

    // Try to create a better fallback if we have release notes
    if (releaseNotes) {
      // Extract first meaningful line from release notes
      const lines = releaseNotes.split('\n').filter((line) => line.trim() && !line.startsWith('#'));
      const firstFeature = lines[0] || 'New features & improvements';
      const shortFeature = firstFeature
        .slice(0, 60)
        .replace(/^[*-]\s*/, '')
        .trim();

      const fallbackTweet = `🚀 ${pkg.package}@${pkg.version} is live!\n\n✨ ${shortFeature}\n\n🔗 ${url}`;

      if (fallbackTweet.length <= MAX_TWEET_LENGTH) {
        return fallbackTweet;
      }
    }

    // Generic fallback template
    const fallbackTweet = `🚀 ${pkg.package}@${pkg.version} is live!\n\n✨ New features & improvements\n🐛 Bug fixes & enhancements\n📚 Better documentation\n\n🔗 ${url}`;

    if (fallbackTweet.length > MAX_TWEET_LENGTH) {
      // If even fallback is too long, truncate it
      const truncated = `🚀 ${pkg.package}@${pkg.version} is live!\n\n🔗 ${url}`;
      return truncated;
    }

    return fallbackTweet;
  }
}

async function buildTweet(pkg) {
  const repo = process.env.GITHUB_REPOSITORY || 'EmberAGI/arbitrum-vibekit';
  const fallbackUrl = `https://github.com/${repo}/releases`;
  const url = pkg.url || fallbackUrl;

  // Fetch release notes from GitHub if available
  const releaseNotes = await fetchReleaseNotes(url);

  if (releaseNotes) {
    console.log('[tweet] Fetched release notes from GitHub');
  } else {
    console.log('[tweet] No release notes available, using fallback');
  }

  // Use AI to generate contextual, engaging tweets
  return generateTweetWithAI(pkg, url, releaseNotes);
}

async function main() {
  const summaryPath = process.argv[2];

  if (!summaryPath) {
    console.error('[tweet] No release summary file path provided. Skipping tweet.');
    process.exit(0);
  }

  const summary = readSummaryFile(summaryPath);
  const pkg = pickReleasedPackage(summary);

  if (!pkg) {
    console.log('[tweet] No released packages found in summary. Skipping tweet.');
    process.exit(0);
  }

  if (!pkg.version || !pkg.package) {
    console.error('[tweet] Incomplete package info in summary. Package data:', pkg);
    process.exit(1);
  }

  const tweet = await buildTweet(pkg);

  if (!tweet) {
    console.error('[tweet] Failed to generate tweet text');
    process.exit(1);
  }

  console.log('[tweet] Prepared tweet text:\n', tweet);

  // Add tweet to the summary file
  summary.tweet = {
    text: tweet,
    package: pkg.package,
    version: pkg.version,
    generatedAt: new Date().toISOString(),
  };

  writeSummaryFile(summaryPath, summary);
}

try {
  await main();
} catch (error) {
  console.error('[tweet] Unexpected error:', error);
  process.exit(1);
}
