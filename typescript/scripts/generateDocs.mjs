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

async function generateDocs(diff, file) {
  const prompt = `
You are updating developer documentation for Ember AI Vibekit, a TypeScript toolkit for building DeFi agents.

Given this diff, generate Markdown documentation suitable for inclusion in that file's README.
- Summarize what changed, what new APIs or functions were added.
- Provide clear explanations and usage examples.
- Be concise and technical.
- Wrap your output with clear section markers like:
  <!-- AUTO-DOC: filename.ts START -->
  ...content...
  <!-- AUTO-DOC: filename.ts END -->

Code diff:
\`\`\`diff
${diff}
\`\`\`
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
        model: 'anthropic/claude-3.5-sonnet', // Good balance of quality and cost
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.7,
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
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.7,
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
      const newDocs = await generateDocs(diff, relativePath);

      const docPath = findOrCreateDocumentationFile(path.resolve(relativePath));
      insertOrUpdateAutoDocSection(docPath, path.basename(relativePath), newDocs);

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
