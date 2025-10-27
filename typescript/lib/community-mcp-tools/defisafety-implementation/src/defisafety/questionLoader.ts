import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Question {
  id: string;
  title: string;
  question: string;
  weight: number;
  purpose: string;
  whereToLook: string;
  scoringCriteria: Record<string, string>;
  answerFormat: Record<string, string>;
  fullContent?: string; // The full formatted content to send to LLM
}

export async function loadQuestions(questionIds?: string[]): Promise<Question[]> {
  const questionsPath = path.join(__dirname, '../../Defisafety-instructions/questions.json');
  
  let questionsData: any;
  try {
    const fileContent = await readFile(questionsPath, 'utf-8');
    questionsData = JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error loading questions from ${questionsPath}:`, error);
    throw new Error(`Failed to load questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  if (!questionsData || typeof questionsData !== 'object') {
    throw new Error('Questions data is not a valid object');
  }
  
  const questions: Question[] = [];
  
  for (const [id, data] of Object.entries(questionsData)) {
    // Skip if specific questions requested and this isn't one
    if (questionIds && !questionIds.includes(id)) continue;
    
    const questionData = data as any;
    
    if (!questionData || typeof questionData !== 'object') {
      console.error(`Invalid question data for ${id}`);
      continue;
    }
    
    // Format the full question content to send to LLM
    const fullContent = `
${questionData.question}
Weight: ${questionData.weight}%

Purpose: ${questionData.purpose}

Where to Look: ${questionData.whereToLook}

Scoring Criteria:
${questionData.scoringCriteria && typeof questionData.scoringCriteria === 'object' 
  ? Object.entries(questionData.scoringCriteria).map(([score, criteria]) => `  ${score}%: ${criteria}`).join('\n')
  : 'No scoring criteria available'}

Answer Format Examples:
${questionData.answerFormat && typeof questionData.answerFormat === 'object'
  ? Object.entries(questionData.answerFormat).map(([score, format]) => `  ${score}%: ${format}`).join('\n')
  : 'No answer format examples available'}

Based on the documentation provided, analyze whether the requirement is met and provide a score with justification following the exact answer format shown above.
`;
    
    questions.push({
      id,
      title: questionData.title || `Question ${id}`,
      question: questionData.question || '',
      weight: questionData.weight || 0,
      purpose: questionData.purpose || '',
      whereToLook: questionData.whereToLook || '',
      scoringCriteria: questionData.scoringCriteria || {},
      answerFormat: questionData.answerFormat || {},
      fullContent: fullContent.trim()
    });
  }
  
  // Sort by question ID
  return questions.sort((a, b) => {
    const aNum = parseInt(a.id.replace('Q', ''));
    const bNum = parseInt(b.id.replace('Q', ''));
    return aNum - bNum;
  });
}