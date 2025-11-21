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
  if (!existsSync(mintlifyPath)) {
    console.error(`❌ Mintlify repo directory not found at: ${mintlifyPath}`);
    return {};
  }

  console.log(`🔍 Scanning for markdown files in: ${mintlifyPath}`);

  // Recursively find all markdown files starting from repo root
  const mdFiles = findAllMarkdownFiles(mintlifyPath);

  if (mdFiles.length === 0) {
    console.error('❌ No markdown files found in Mintlify repo');
    return {};
  }

  console.log(`📚 Found ${mdFiles.length} markdown files`);

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
    preview: mintlifyDocs[key].content.substring(0, 300) + '...',
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
          "action": "replace_entire" | "append",
          "new_content": "the complete new content for the file (for replace_entire) or content to append (for append)",
          "context": "brief explanation of this change"
        }
      ]
    }
  ],
  "summary": "Overall summary of documentation changes"
}

**Important**:
- Use "replace_entire" to provide the complete new content for the entire file
- Use "append" to add new content at the end of the file
- DO NOT try to do partial text matching - provide the full file content

If no documentation updates are needed, return { "analysis": "...", "files_to_update": [], "summary": "No documentation updates required" }
`;

  console.log('🤖 Analyzing PR changes and Mintlify docs...');
  const response = await callLLM(prompt);

  // Parse initial response to get files that need updating
  let jsonText = response.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
  }

  let initialPlan;
  try {
    initialPlan = JSON.parse(jsonText);
  } catch (error) {
    console.error('Failed to parse initial LLM response:', error);
    return { analysis: 'Failed to parse response', files_to_update: [], summary: 'Error' };
  }

  // If files need updating, fetch their full content and re-prompt for complete rewrites
  if (initialPlan.files_to_update && initialPlan.files_to_update.length > 0) {
    console.log(
      `📝 Generating complete updates for ${initialPlan.files_to_update.length} file(s)...`,
    );

    const detailedUpdates = [];
    for (const fileUpdate of initialPlan.files_to_update) {
      const docKey = fileUpdate.file;
      if (!mintlifyDocs[docKey]) {
        console.warn(`⚠️  File not found: ${docKey}`);
        continue;
      }

      const currentContent = mintlifyDocs[docKey].content;

      const detailPrompt = `You are updating the Mintlify documentation file: ${docKey}

Reason for update: ${fileUpdate.reason}

Current file content:
\`\`\`markdown
${currentContent}
\`\`\`

PR Changes Summary:
${initialPlan.analysis}

Please provide the COMPLETE updated content for this file. Make only the necessary changes to reflect the PR updates while preserving all existing structure, formatting, and unrelated content.

Respond with ONLY a JSON object in this format:
{
  "new_content": "the complete updated markdown content",
  "changes_made": "brief description of what you changed"
}`;

      const detailResponse = await callLLM(detailPrompt);
      let detailJson = detailResponse.trim();
      if (detailJson.startsWith('```')) {
        detailJson = detailJson.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
      }

      try {
        const update = JSON.parse(detailJson);
        detailedUpdates.push({
          file: docKey,
          reason: fileUpdate.reason,
          updates: [
            {
              action: 'replace_entire',
              new_content: update.new_content,
              context: update.changes_made,
            },
          ],
        });
        console.log(`✓ Generated update for ${docKey}`);
      } catch (error) {
        console.error(`Failed to parse update for ${docKey}:`, error);
      }
    }

    return {
      analysis: initialPlan.analysis,
      files_to_update: detailedUpdates,
      summary: initialPlan.summary,
    };
  }

  return initialPlan;
}

function applyUpdates(mintlifyDocs, updatePlan) {
  const updatedFiles = [];

  for (const fileUpdate of updatePlan.files_to_update) {
    let docKey = fileUpdate.file;

    // Try to find the file with different path variations
    if (!mintlifyDocs[docKey]) {
      // Try without leading slash
      const withoutSlash = docKey.replace(/^\/+/, '');
      // Try with docs/ prefix
      const withDocs = `docs/${withoutSlash}`;
      // Try exact match in keys
      const matchingKey = Object.keys(mintlifyDocs).find(
        (key) =>
          key === docKey ||
          key === withoutSlash ||
          key.endsWith(docKey) ||
          key.endsWith(withoutSlash),
      );

      if (matchingKey) {
        docKey = matchingKey;
        console.log(`✓ Mapped ${fileUpdate.file} to ${docKey}`);
      } else {
        console.warn(`⚠️  File not found in Mintlify docs: ${fileUpdate.file}`);
        console.warn(`   Available keys (first 10):`, Object.keys(mintlifyDocs).slice(0, 10));
        continue;
      }
    }

    let content = mintlifyDocs[docKey].content;
    let modified = false;

    for (const update of fileUpdate.updates) {
      if (update.action === 'replace_entire') {
        content = update.new_content;
        modified = true;
        console.log(`✓ Replaced entire content of ${docKey}: ${update.context}`);
      } else if (update.action === 'append') {
        content = content + '\n\n' + update.new_content;
        modified = true;
        console.log(`✓ Appended content to ${docKey}: ${update.context}`);
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
  console.log(`🔍 Looking for Mintlify docs at: ${mintlifyPath}`);
  console.log(`📂 Current working directory: ${process.cwd()}`);

  // Debug: List what's in the parent directory
  try {
    const parentDir = path.resolve(process.cwd(), '..');
    const { readdirSync } = await import('node:fs');
    const contents = readdirSync(parentDir);
    console.log(`📁 Contents of parent directory (${parentDir}):`, contents);
  } catch (err) {
    console.log('⚠️  Could not read parent directory:', err.message);
  }

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
