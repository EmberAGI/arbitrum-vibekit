import { loadQuestions, type Question } from './questionLoader.js';
import type { VectorStore } from '../embeddings/vectorStore.js';
import type { EmbeddingsGenerator } from '../embeddings/embeddings.js';
import { generateText } from 'ai';
import { createProviderSelector, getAvailableProviders } from '@emberai/arbitrum-vibekit-core';
import type { LanguageModel } from 'ai';

export interface QuestionResult {
  questionId: string;
  questionTitle: string;
  score: number;
  justification: string;
  documentationFound: string[];
}

export interface DefiSafetyReport {
  projectName: string;
  evaluationDate: string;
  overallScore: number;
  maxPossibleScore: number;
  scorePercentage: number;
  detailedResults: Array<{
    questionId: string;
    questionTitle: string;
    score: number;
    weight: number;
    justification: string;
    documentationFound: string[];
  }>;
  summary: {
    strongAreas: string[];
    weakAreas: string[];
    recommendations: string[];
  };
}

export async function evaluateQuestions(
  questions: Question[],
  queryFunction: (query: string) => Promise<any>
): Promise<QuestionResult[]> {
  // Create provider selector with available API keys
  const providers = createProviderSelector({
    openRouterApiKey: process.env['OPENROUTER_API_KEY'],
    openaiApiKey: process.env['OPENAI_API_KEY'],
    xaiApiKey: process.env['XAI_API_KEY'],
    hyperbolicApiKey: process.env['HYPERBOLIC_API_KEY'],
  });

  // Get available providers and select one
  const availableProviders = getAvailableProviders(providers);
  if (availableProviders.length === 0) {
    throw new Error('No AI providers configured. Please set at least one provider API key (OPENROUTER_API_KEY, OPENAI_API_KEY, XAI_API_KEY, or HYPERBOLIC_API_KEY).');
  }

  // Use AI_PROVIDER env var or fallback to first available
  const preferredProvider = process.env['AI_PROVIDER'] || availableProviders[0]!;
  const selectedProvider = providers[preferredProvider as keyof typeof providers];
  if (!selectedProvider) {
    throw new Error(`Preferred provider '${preferredProvider}' not available. Available providers: ${availableProviders.join(', ')}`);
  }

  // Get the model instance - use fast model for evaluations
  const modelOverride = process.env['AI_MODEL'];
  const model = (modelOverride
    ? selectedProvider(modelOverride)
    : selectedProvider('gpt-5')) as unknown as LanguageModel; // Default to fast model
  
  // Process questions in parallel for massive speed improvement
  const evaluationPromises = questions.map(async (question) => {
    console.error(`\n=== Evaluating ${question.id}: ${question.title} ===`);
    
    try {
      // Query documentation with the full question content
      const queryResult = await queryFunction(question.fullContent!);
      
      // Get relevant documentation chunks
      const relevantChunks = queryResult.results || [];
      const documentationFound = relevantChunks.map((chunk: any) => 
        `[${chunk.source}]: ${chunk.content}`
      );
      
      console.error(`Found ${relevantChunks.length} relevant documentation chunks`);
      
      // Combined prompt for evaluation
      const prompt = `You are a DeFiSafety auditor. Analyze the documentation and provide a score (0%, 40%, 70%, or 100%) with brief justification.
Format: "Score: X%" followed by justification.

Question: ${question.question}
      
Scoring: 100% = ${question.scoringCriteria['100'] || 'Fully documented'}
40% = ${question.scoringCriteria['40'] || 'Partially documented'} 
0% = ${question.scoringCriteria['0'] || 'Not documented'}

Documentation:
${documentationFound.length > 0 ? documentationFound.slice(0, 3).join('\n\n') : 'No relevant documentation found.'}

Provide score and justification:`;

      // Use generateText with the selected model
      const { text: llmResponse } = await generateText({
        model,
        prompt,
        temperature: 0.1, // Lower temperature for consistent scoring
        maxOutputTokens: 300 // Reduced tokens for faster response
      });
      console.error(`LLM Response: ${llmResponse}`);
      
      // Extract score from LLM response
      const scoreMatch = llmResponse.match(/Score:\s*(\d+)%/);
      const score = scoreMatch ? parseInt(scoreMatch[1]!) : 0;
      
      return {
        questionId: question.id,
        questionTitle: question.title,
        score,
        justification: llmResponse,
        documentationFound: documentationFound.slice(0, 3) // Keep top 3 for report
      };
      
    } catch (error) {
      console.error(`Error calling OpenAI for ${question.id}:`, error);
      return {
        questionId: question.id,
        questionTitle: question.title,
        score: 0,
        justification: `Error: Failed to analyze documentation - ${error instanceof Error ? error.message : 'Unknown error'}`,
        documentationFound: []
      };
    }
  });
  
  // Wait for all evaluations to complete in parallel
  const results = await Promise.all(evaluationPromises);
  
  return results;
}

export function generateReport(
  projectName: string,
  results: QuestionResult[],
  questions: Question[]
): DefiSafetyReport {
  // Create detailed results with weights
  const detailedResults = results.map((result) => {
    const question = questions.find(q => q.id === result.questionId);
    return {
      questionId: result.questionId,
      questionTitle: result.questionTitle,
      score: result.score,
      weight: question?.weight || 0,
      justification: result.justification,
      documentationFound: result.documentationFound
    };
  });
  
  // Calculate weighted overall score
  const weightedScore = detailedResults.reduce((sum, result) => {
    const weight = result.weight / 100;
    const score = result.score / 100;
    return sum + (score * weight);
  }, 0);
  
  const strongAreas = detailedResults
    .filter(r => r.score >= 70)
    .map(r => r.questionTitle);
    
  const weakAreas = detailedResults
    .filter(r => r.score <= 40)
    .map(r => r.questionTitle);
  
  // Log summary
  console.error('\n=== EVALUATION SUMMARY ===');
  detailedResults.forEach(r => {
    console.error(`${r.questionId}: ${r.score}% (weight: ${r.weight}%)`);
  });
  console.error(`Overall Score: ${Math.round(weightedScore * 100)}%`);
  
  return {
    projectName,
    evaluationDate: new Date().toISOString(),
    overallScore: Math.round(weightedScore * 100),
    maxPossibleScore: 100,
    scorePercentage: Math.round(weightedScore * 100),
    detailedResults,
    summary: {
      strongAreas,
      weakAreas,
      recommendations: generateRecommendations(detailedResults)
    }
  };
}

function generateRecommendations(results: Array<{questionId: string; score: number}>): string[] {
  const recommendations: string[] = [];
  
  results.forEach(result => {
    if (result.score <= 40) {
      switch(result.questionId) {
        case 'Q1':
          recommendations.push('Add clear contract addresses documentation in a dedicated section');
          break;
        case 'Q2':
          recommendations.push('Make public repository easily accessible from main documentation');
          break;
        case 'Q3':
          recommendations.push('Create comprehensive whitepaper explaining protocol mechanics');
          break;
        case 'Q4':
          recommendations.push('Document system architecture with diagrams and explanations');
          break;
        case 'Q5':
          recommendations.push('Establish and document bug bounty program');
          break;
        case 'Q6':
          recommendations.push('Document admin controls and their limitations');
          break;
        case 'Q7':
          recommendations.push('Explain upgradeability mechanism and governance process');
          break;
        case 'Q8':
          recommendations.push('Clarify contract ownership and control structure');
          break;
        case 'Q9':
          recommendations.push('Document what can be changed and by whom');
          break;
        case 'Q10':
          recommendations.push('Specify oracle dependencies and failure modes');
          break;
      }
    }
  });
  
  return recommendations;
}

export async function handleEvaluateDefiSafety(
  params: { projectName: string; baseUrl: string; maxPages?: number },
  vectorStore: VectorStore,
  embeddingsGenerator: EmbeddingsGenerator,
  indexFunction: (params: { baseUrl: string; maxPages: number; selector: string }) => Promise<{
    totalPagesScraped: number;
    totalErrors: number;
    embeddings: { chunksCreated: number; embeddingsGenerated: number };
  }>
): Promise<{report: DefiSafetyReport; indexingStats: any}> {
  
  // 1. Clear any existing index for a fresh evaluation
  vectorStore.clear();
  
  // 2. Index the documentation
  console.error(`Starting documentation indexing for ${params.projectName} from ${params.baseUrl}`);
  const indexingStats = await indexFunction({
    baseUrl: params.baseUrl,
    maxPages: params.maxPages || 50,
    selector: 'main, article, .content, .documentation, .docs'
  });
  
  // 3. Ensure documentation was successfully indexed
  if (vectorStore.getStats().totalDocuments === 0) {
    throw new Error('Failed to index documentation. No documents were processed.');
  }
  
  // 4. Load all questions (Q1-Q10)
  const questions = await loadQuestions();
  
  // 5. Evaluate each question using LLM
  const results = await evaluateQuestions(questions, async (query) => {
    const embedding = await embeddingsGenerator.generateSingleEmbedding(query);
    if (!embedding) return { results: [] };
    
    const searchResults = vectorStore.search(embedding, 5);
    return {
      results: searchResults.map(r => ({
        content: r.document.chunk.content,
        source: r.document.chunk.metadata.url,
        score: r.score
      }))
    };
  });
  
  // 6. Generate report
  const report = generateReport(params.projectName, results, questions);
  
  return { report, indexingStats };
}