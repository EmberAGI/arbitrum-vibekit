#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const MAX_TWEET_LENGTH = 280;

function readSummaryFile(summaryPath) {
  const absolutePath = path.resolve(process.cwd(), summaryPath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`[tweet] Release summary file not found: ${absolutePath}`);
    process.exit(0);
  }

  const raw = fs.readFileSync(absolutePath, 'utf8');

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error('[tweet] Failed to parse release summary JSON:', error);
    process.exit(0);
  }
}

function pickReleasedPackage(summary) {
  if (!summary || !Array.isArray(summary.packages)) {
    return null;
  }

  const released = summary.packages.filter((pkg) => pkg.released);
  return released.length > 0 ? released[0] : null;
}

async function generateTweetWithAI(pkg, url) {
  const openaiKey = process.env.OPENAI_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  if (!openaiKey && !openrouterKey) {
    // Fallback to simple template if no API keys
    return `🚀 ${pkg.package}@${pkg.version} is live!\n\n✨ New features & improvements\n🐛 Bug fixes & enhancements\n📚 Better documentation\n\n🔗 ${url}`;
  }

  const prompt = `You are a social media manager crafting an engaging tweet for a new software release.

Package: ${pkg.package}
Version: ${pkg.version}
Package Name: ${pkg.name}
Release URL: ${url}

Create a compelling tweet (max 280 characters) that:
1. Announces the release with excitement
2. Highlights what makes this package valuable/powerful
3. Uses 2-3 relevant emojis strategically
4. Includes the release URL
5. Is engaging and makes developers want to check it out

Focus on the package's VALUE and CAPABILITIES, not generic "improvements and fixes".

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

    if (!tweet || tweet.length > MAX_TWEET_LENGTH) {
      throw new Error('Generated tweet is invalid or too long');
    }

    return tweet;
  } catch (error) {
    console.warn('[tweet] AI generation failed, using fallback:', error.message);
    // Fallback template
    return `🚀 ${pkg.package}@${pkg.version} is live!\n\n✨ New features & improvements\n🐛 Bug fixes & enhancements\n📚 Better documentation\n\n🔗 ${url}`;
  }
}

function buildTweet(pkg) {
  const repo = process.env.GITHUB_REPOSITORY || 'EmberAGI/arbitrum-vibekit';
  const fallbackUrl = `https://github.com/${repo}/releases`;
  const url = pkg.url || fallbackUrl;

  // Use AI to generate contextual, engaging tweets
  return generateTweetWithAI(pkg, url);
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
    console.log('[tweet] Incomplete package info in summary. Skipping tweet.');
    process.exit(0);
  }

  const tweet = await buildTweet(pkg);
  console.log('[tweet] Prepared tweet text:\n', tweet);
}

try {
  await main();
} catch (error) {
  console.error('[tweet] Unexpected error:', error);
  process.exit(1);
}
