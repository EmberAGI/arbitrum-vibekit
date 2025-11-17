#!/usr/bin/env node

/**
 * Vibekit Auto Documentation Updater
 * Updates or creates README.md files with AI-generated documentation
 * for each changed TypeScript file.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// Load environment variables from .env file if it exists
// Look for .env in current directory and typescript/ subdirectory
const envPaths = [path.join(process.cwd(), '.env'), path.join(process.cwd(), 'typescript', '.env')];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach((line) => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').replace(/^["']|["']$/g, ''); // Remove quotes
        if (!process.env[key.trim()]) {
          // Don't override existing env vars
          process.env[key.trim()] = value.trim();
        }
      }
    });
    break; // Use first .env file found
  }
}

const openaiKey = process.env.OPENAI_API_KEY;
const openrouterKey = process.env.OPENROUTER_API_KEY;
const USE_OPENAI = !!openaiKey;
const USE_OPENROUTER = !!openrouterKey;

if (!openaiKey && !openrouterKey) {
  console.error('❌ Missing OPENAI_API_KEY or OPENROUTER_API_KEY in environment.');
  process.exit(1);
}

const changedFiles = process.argv[2]?.split(/\s+/).filter(Boolean) ?? [];
if (changedFiles.length === 0) {
  console.log('✅ No changed files detected. Skipping doc generation.');
  process.exit(0);
}

async function generateDocs(diff, file, existingContent = '') {
  const prompt = `
You are updating developer documentation for Ember AI Vibekit, a TypeScript toolkit for building DeFi agents.

Given this code diff and existing documentation, analyze what sections need to be updated and provide SPECIFIC UPDATES to existing content.

CRITICAL RULES:
1. ONLY update content that is DIRECTLY RELATED to the code changes in the diff
2. DO NOT change titles, headings, or formatting unless they specifically mention removed/changed functionality
3. BE CONSERVATIVE - if something is not directly affected by the code changes, leave it unchanged
4. Focus ONLY on content that mentions the specific functionality being added/removed/changed

VERIFICATION PROCESS:
Before providing updates, you should first identify what terms/functionality are being removed or changed from the diff, then search for ALL occurrences of those terms in the documentation.

For example, if the diff shows removal of "simple script workflows", you should look for:
- "simple-script"
- "simple script"
- "Simple Script"
- ".js files"
- "without package.json"
- Any directory structures showing simple-script examples

SPECIFIC INSTRUCTIONS:
- If code removes functionality: Find and update ALL mentions of that functionality throughout the entire document
- If code adds functionality: Only update sections that would logically include the new feature
- Preserve all existing formatting, structure, and unrelated content
- Do not change section titles unless they specifically reference removed functionality
- Use exact text matching - provide the complete text block that needs to be replaced

Code diff:
\`\`\`diff
${diff}
\`\`\`

${
  existingContent
    ? `Existing documentation content:
\`\`\`markdown
${existingContent}
\`\`\``
    : ''
}

STEP 1: First, identify what functionality is being removed/changed from the diff.
STEP 2: Search through the documentation for ALL references to that functionality.
STEP 3: Provide exact text replacements for each occurrence found.

Provide your response as a JSON object with this structure:
{
  "analysis": "What functionality is being removed/changed based on the diff",
  "search_terms": ["list", "of", "terms", "to", "search", "for"],
  "updates": [
    {
      "section": "exact text to find and replace (including line breaks if multiline)",
      "action": "update" or "add" or "remove",
      "content": "new content to replace it with",
      "reason": "why this specific text needs to change"
    }
  ],
  "summary": "brief summary of all changes made"
}

IMPORTANT: Use "exact text to find and replace" - provide the complete text that needs to be changed, including proper line breaks for multiline content.
`;

  try {
    if (USE_OPENROUTER) {
      // Use OpenRouter with OpenAI-compatible API
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({
        apiKey: openrouterKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://github.com/EmberAGI/arbitrum-vibekit',
          'X-Title': 'Vibekit Documentation Generator',
        },
      });
      const response = await openai.chat.completions.create({
        model: 'openai/gpt-5.1', // GPT-5.1 with low thinking mode for better performance
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.7,
        reasoning_effort: 'low', // Low thinking mode as requested
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
        max_tokens: 2000,
        temperature: 0.7,
        reasoning_effort: 'low', // Low thinking mode as requested
      });
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('OpenAI returned empty response');
      }
      return content;
    } else {
      throw new Error('No valid API key found. Please set OPENROUTER_API_KEY or OPENAI_API_KEY.');
    }
  } catch (error) {
    const provider = USE_OPENROUTER ? 'OpenRouter' : 'OpenAI';
    throw new Error(
      `${provider} API error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function findOrCreateDocumentationFile(filePath) {
  const dir = path.dirname(filePath);
  const fileName = path.basename(filePath, '.ts');

  // First, look for existing documentation files in the same directory and parent directories
  // but NEVER use the main repository README
  let currentDir = dir;
  const repoRoot = path.resolve('.');

  while (currentDir && currentDir !== path.resolve(currentDir, '..')) {
    const readmePath = path.join(currentDir, 'README.md');

    // Check if README exists and is NOT the main repository README
    if (existsSync(readmePath) && path.resolve(readmePath) !== path.join(repoRoot, 'README.md')) {
      console.log(`📝 Found existing documentation: ${readmePath}`);
      return readmePath;
    }

    currentDir = path.resolve(currentDir, '..');

    // Stop at typescript directory to avoid going to repo root
    if (currentDir.endsWith('typescript')) break;
  }

  // Look for other documentation files in the same directory
  const possibleDocFiles = [
    path.join(dir, 'DOCS.md'),
    path.join(dir, 'API.md'),
    path.join(dir, `${fileName}.md`),
  ];

  for (const docFile of possibleDocFiles) {
    if (existsSync(docFile)) {
      console.log(`📝 Found existing documentation: ${docFile}`);
      return docFile;
    }
  }

  // If no existing documentation found, create new file in docs/ directory
  const relativePath = path.relative('typescript', filePath);
  const docPath = path.join('typescript', 'docs', relativePath.replace('.ts', '.md'));
  const docDir = path.dirname(docPath);

  // Ensure the docs directory exists
  mkdirSync(docDir, { recursive: true });

  // Create new documentation file
  if (!existsSync(docPath)) {
    const relativeFromRoot = path.relative('typescript', filePath);
    writeFileSync(
      docPath,
      `# ${fileName}\n\n> Auto-generated documentation for \`${relativeFromRoot}\`\n\n`,
    );
  }

  console.log(`📄 Created new documentation: ${docPath}`);
  return docPath;
}

function applyDocumentationUpdates(readmePath, updatesJson) {
  let content = '';
  if (existsSync(readmePath)) {
    content = readFileSync(readmePath, 'utf8');
  }

  try {
    const updates = JSON.parse(updatesJson);

    if (!updates.updates || !Array.isArray(updates.updates)) {
      console.warn('Invalid updates format, falling back to simple append');
      return insertOrUpdateAutoDocSection(readmePath, 'fallback', updatesJson);
    }

    // Show analysis and search terms
    if (updates.analysis) {
      console.log(`🔍 Analysis: ${updates.analysis}`);
    }
    if (updates.search_terms && updates.search_terms.length > 0) {
      console.log(`🔎 Search terms: ${updates.search_terms.join(', ')}`);
    }

    console.log(`📝 Applying ${updates.updates.length} documentation updates...`);

    for (const update of updates.updates) {
      console.log(
        `   - ${update.action}: "${update.section.substring(0, 50)}..." (${update.reason})`,
      );

      if (update.action === 'update') {
        // Exact text replacement
        if (content.includes(update.section)) {
          content = content.replace(update.section, update.content);
          console.log(`     ✅ Found and updated exact text`);
        } else {
          console.warn(
            `   ⚠️  Could not find exact text: "${update.section.substring(0, 100)}..."`,
          );
        }
      } else if (update.action === 'add') {
        // Add new content at the end
        content += `\n\n${update.content}\n`;
      } else if (update.action === 'remove') {
        // Remove specific content by exact text match
        if (content.includes(update.section)) {
          content = content.replace(update.section, '');
          console.log(`     ✅ Removed exact text`);
        } else {
          console.warn(
            `   ⚠️  Could not find text to remove: "${update.section.substring(0, 100)}..."`,
          );
        }
      }
    }

    writeFileSync(readmePath, content, 'utf8');
    console.log(`✅ Applied documentation updates: ${updates.summary}`);
  } catch (error) {
    console.warn('Failed to parse JSON updates, falling back to simple append:', error.message);
    insertOrUpdateAutoDocSection(readmePath, 'fallback', updatesJson);
  }
}

function insertOrUpdateAutoDocSection(readmePath, fileName, newContent) {
  const startMarker = `<!-- AUTO-DOC: ${fileName} START -->`;
  const endMarker = `<!-- AUTO-DOC: ${fileName} END -->`;

  let content = '';
  if (existsSync(readmePath)) {
    content = readFileSync(readmePath, 'utf8');
  }

  const sectionRegex = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, 'm');

  if (sectionRegex.test(content)) {
    // Replace existing section
    content = content.replace(sectionRegex, newContent);
  } else {
    // Insert at bottom with a clear heading
    content += `\n\n---\n${newContent}\n`;
  }

  writeFileSync(readmePath, content, 'utf8');
}

async function main() {
  for (const file of changedFiles) {
    if (!file.endsWith('.ts')) continue;

    try {
      // Handle both relative and absolute paths from GitHub Actions
      const relativePath = file.startsWith('typescript/') ? file : `typescript/${file}`;
      const diff = execSync(`git diff HEAD~1 HEAD -- ${relativePath}`, { encoding: 'utf8' });
      if (!diff.trim()) continue;

      console.log(`📄 Generating docs for ${relativePath}...`);

      // Find or create appropriate documentation file
      const docPath = findOrCreateDocumentationFile(path.resolve(relativePath));

      // Read existing documentation content
      let existingContent = '';
      if (existsSync(docPath)) {
        existingContent = readFileSync(docPath, 'utf8');
      }

      // Generate documentation updates with existing content context
      const newDocs = await generateDocs(diff, relativePath, existingContent);

      // Apply the documentation updates using the new intelligent update system
      applyDocumentationUpdates(docPath, newDocs);

      console.log(`✅ Updated documentation: ${docPath}`);
    } catch (err) {
      console.warn(`⚠️ Skipping ${file}: ${err}`);
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(`[generateDocs] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
