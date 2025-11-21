#!/usr/bin/env node

/**
 * AI-Powered Mintlify Documentation Sync
 * Analyzes PR changes from Vibekit and intelligently updates Mintlify docs
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const openaiKey = process.env.OPENAI_API_KEY;
const openrouterKey = process.env.OPENROUTER_API_KEY;
const USE_OPENAI = !!openaiKey;
const USE_OPENROUTER = !!openrouterKey;

if (!openaiKey && !openrouterKey) {
  console.error('❌ Missing OPENAI_API_KEY or OPENROUTER_API_KEY in environment.');
  process.exit(1);
}

const prNumber = process.argv[2];
const prTitle = process.argv[3] || 'Unknown PR';
const prBody = process.argv[4] || '';

if (!prNumber) {
  console.error('❌ PR number required as first argument');
  process.exit(1);
}

async function callLLM(prompt) {
  try {
    if (USE_OPENROUTER) {
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({
        apiKey: openrouterKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://github.com/EmberAGI/arbitrum-vibekit',
          'X-Title': 'Vibekit Mintlify Docs Sync',
        },
      });
      const response = await openai.chat.completions.create({
        model: 'openai/gpt-5.1',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000,
        temperature: 0.3,
        reasoning_effort: 'low',
      });
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('OpenRouter returned empty response');
      }
      return content;
    } else if (USE_OPENAI) {
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: openaiKey });
      const response = await openai.chat.completions.create({
        model: 'gpt-5.1',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000,
        temperature: 0.3,
        reasoning_effort: 'low',
      });
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('OpenAI returned empty response');
      }
      return content;
    }
  } catch (error) {
    const provider = USE_OPENROUTER ? 'OpenRouter' : 'OpenAI';
    throw new Error(
      `${provider} API error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function getPRDiff() {
  try {
    // Get the full diff of the PR
    const diff = execSync('git diff origin/main...HEAD', {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return diff;
  } catch (error) {
    console.error('Failed to get PR diff:', error);
    return '';
  }
}

function findAllMarkdownFiles(dir, fileList = []) {
  const files = readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      if (!file.startsWith('.') && file !== 'node_modules') {
        findAllMarkdownFiles(filePath, fileList);
      }
    } else if (file.endsWith('.md') || file.endsWith('.mdx')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

function loadMintlifyDocs(mintlifyPath) {
  const docsPath = path.join(mintlifyPath, 'docs');

  if (!existsSync(docsPath)) {
    console.error('❌ Mintlify docs directory not found');
    return {};
  }

  const mdFiles = findAllMarkdownFiles(docsPath);
  const docs = {};

  mdFiles.forEach((filePath) => {
    const relativePath = path.relative(mintlifyPath, filePath);
    const content = readFileSync(filePath, 'utf8');
    docs[relativePath] = {
      path: filePath,
      content: content,
    };
  });

  return docs;
}

async function analyzeAndUpdateDocs(prDiff, mintlifyDocs, prTitle, prBody) {
  const docsList = Object.keys(mintlifyDocs).map((key) => ({
    path: key,
    preview: mintlifyDocs[key].content.substring(0, 500) + '...',
  }));

  const prompt = `You are updating Mintlify documentation for Ember AI Vibekit based on changes from a GitHub PR.

**PR Information:**
Title: ${prTitle}
Description: ${prBody}

**PR Code Changes:**
\`\`\`diff
${prDiff.substring(0, 15000)}
\`\`\`

**Available Mintlify Documentation Files:**
${JSON.stringify(docsList, null, 2)}

**Your Task:**
1. Analyze the PR changes to understand what functionality was added, modified, or removed
2. Identify which Mintlify documentation files need to be updated based on these changes
3. For each file that needs updates, provide specific, targeted changes

**Important Guidelines:**
- Only update documentation that is DIRECTLY affected by the PR changes
- Be conservative - if unsure whether a doc needs updating, skip it
- Provide exact text replacements (old text → new text)
- Maintain existing formatting, tone, and structure
- If new sections are needed, clearly indicate where they should be added
- Focus on user-facing documentation (tutorials, guides, API docs, examples)

**Response Format:**
Respond with a JSON object:
{
  "analysis": "Brief summary of what changed in the PR and documentation impact",
  "files_to_update": [
    {
      "file": "docs/path/to/file.md",
      "reason": "Why this file needs updating",
      "updates": [
        {
          "action": "update" | "add" | "remove",
          "old_text": "exact text to find (for update/remove)",
          "new_text": "replacement text (for update/add)",
          "context": "brief explanation of this change"
        }
      ]
    }
  ],
  "summary": "Overall summary of documentation changes"
}

If no documentation updates are needed, return { "analysis": "...", "files_to_update": [], "summary": "No documentation updates required" }
`;

  console.log('🤖 Analyzing PR changes and Mintlify docs...');
  const response = await callLLM(prompt);

  // Extract JSON from response (handle markdown code blocks)
  let jsonText = response.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
  }

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    console.error('Failed to parse LLM response as JSON:', error);
    console.log('Raw response:', response);
    return { analysis: 'Failed to parse response', files_to_update: [], summary: 'Error' };
  }
}

function applyUpdates(mintlifyDocs, updatePlan) {
  const updatedFiles = [];

  for (const fileUpdate of updatePlan.files_to_update) {
    const docKey = fileUpdate.file;

    if (!mintlifyDocs[docKey]) {
      console.warn(`⚠️  File not found in Mintlify docs: ${docKey}`);
      continue;
    }

    let content = mintlifyDocs[docKey].content;
    let modified = false;

    for (const update of fileUpdate.updates) {
      if (update.action === 'update' || update.action === 'remove') {
        if (content.includes(update.old_text)) {
          const newText = update.action === 'remove' ? '' : update.new_text;
          content = content.replace(update.old_text, newText);
          modified = true;
          console.log(`✓ Applied ${update.action} to ${docKey}: ${update.context}`);
        } else {
          console.warn(
            `⚠️  Could not find text to ${update.action} in ${docKey}:\n"${update.old_text.substring(0, 100)}..."`,
          );
        }
      } else if (update.action === 'add') {
        // For 'add', append at the end or after a specific marker if old_text is provided
        if (update.old_text && content.includes(update.old_text)) {
          content = content.replace(update.old_text, update.old_text + '\n\n' + update.new_text);
        } else {
          content = content + '\n\n' + update.new_text;
        }
        modified = true;
        console.log(`✓ Added content to ${docKey}: ${update.context}`);
      }
    }

    if (modified) {
      writeFileSync(mintlifyDocs[docKey].path, content, 'utf8');
      updatedFiles.push(docKey);
    }
  }

  return updatedFiles;
}

async function main() {
  console.log(`📝 Syncing Mintlify docs for PR #${prNumber}...`);

  // Get PR diff from current repo
  const prDiff = getPRDiff();

  if (!prDiff || prDiff.trim().length === 0) {
    console.log('✅ No meaningful changes detected in PR. Skipping sync.');
    process.exit(0);
  }

  // Load Mintlify docs
  // The ember_docs directory is checked out at the workspace root, not in typescript/
  const mintlifyPath = path.resolve(process.cwd(), '..', 'ember_docs');
  const mintlifyDocs = loadMintlifyDocs(mintlifyPath);

  if (Object.keys(mintlifyDocs).length === 0) {
    console.error('❌ No Mintlify documentation files found');
    process.exit(1);
  }

  console.log(`📚 Found ${Object.keys(mintlifyDocs).length} Mintlify documentation files`);

  // Analyze and get update plan
  const updatePlan = await analyzeAndUpdateDocs(prDiff, mintlifyDocs, prTitle, prBody);

  console.log('\n📊 Analysis:', updatePlan.analysis);
  console.log('\n📝 Summary:', updatePlan.summary);

  if (updatePlan.files_to_update.length === 0) {
    console.log('\n✅ No documentation updates needed');
    process.exit(0);
  }

  console.log(`\n🔄 Updating ${updatePlan.files_to_update.length} documentation file(s)...`);

  // Apply updates
  const updatedFiles = applyUpdates(mintlifyDocs, updatePlan);

  console.log(`\n✅ Successfully updated ${updatedFiles.length} file(s):`);
  updatedFiles.forEach((file) => console.log(`   - ${file}`));

  // Write summary for PR body (at workspace root, not typescript/)
  const summaryPath = path.resolve(process.cwd(), '..', 'mintlify-sync-summary.json');
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        prNumber,
        analysis: updatePlan.analysis,
        summary: updatePlan.summary,
        updatedFiles,
      },
      null,
      2,
    ),
  );

  console.log(`\n📄 Summary written to ${summaryPath}`);
}

try {
  await main();
} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}
