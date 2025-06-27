import { NextResponse } from 'next/server';

// Define types for autocomplete segments
export type AutocompleteSegmentType = 'text' | 'input-text' | 'input-select' | 'token-picker' | 'chain-picker';

export interface AutocompleteSegment {
  id: string;
  type: AutocompleteSegmentType;
  content?: string; // For text segments
  placeholder?: string; // For input segments
  options?: string[]; // For select inputs
  name?: string; // Input field name for form handling
}

export interface AutocompleteResponse {
  segments: AutocompleteSegment[];
  fullText: string; // The complete text with placeholders
}

// Mock data for different autocomplete scenarios
const mockAutocompleteData: Record<string, AutocompleteResponse> = {
  'can you help': {
    segments: [
      { id: '1', type: 'text', content: 'Can you help me with ' },
      { 
        id: '2', 
        type: 'input-select', 
        placeholder: 'task type',
        name: 'taskType',
        options: ['debugging', 'implementing', 'reviewing', 'optimizing'] 
      },
      { id: '3', type: 'text', content: ' my ' },
      { 
        id: '4', 
        type: 'input-text', 
        placeholder: 'component/file name',
        name: 'componentName'
      },
      { id: '5', type: 'text', content: '?' }
    ],
    fullText: 'Can you help me with [task type] my [component/file name]?'
  },
  'i need to': {
    segments: [
      { id: '1', type: 'text', content: 'I need to ' },
      {
        id: '2',
        type: 'input-select',
        placeholder: 'action',
        name: 'action',
        options: ['create', 'update', 'delete', 'fix', 'refactor']
      },
      { id: '3', type: 'text', content: ' a ' },
      {
        id: '4',
        type: 'input-text',
        placeholder: 'what',
        name: 'what'
      },
      { id: '5', type: 'text', content: ' in ' },
      {
        id: '6',
        type: 'input-text',
        placeholder: 'where',
        name: 'where'
      }
    ],
    fullText: 'I need to [action] a [what] in [where]'
  },
  'please': {
    segments: [
      { id: '1', type: 'text', content: 'Please ' },
      {
        id: '2',
        type: 'input-select',
        placeholder: 'action',
        name: 'action',
        options: ['explain', 'show me', 'help me understand', 'guide me through']
      },
      { id: '3', type: 'text', content: ' how to ' },
      {
        id: '4',
        type: 'input-text',
        placeholder: 'task description',
        name: 'task'
      }
    ],
    fullText: 'Please [action] how to [task description]'
  },
  'how do i': {
    segments: [
      { id: '1', type: 'text', content: 'How do I ' },
      {
        id: '2',
        type: 'input-text',
        placeholder: 'task',
        name: 'task'
      },
      { id: '3', type: 'text', content: ' using ' },
      {
        id: '4',
        type: 'input-select',
        placeholder: 'technology',
        name: 'technology',
        options: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS', 'Node.js']
      },
      { id: '5', type: 'text', content: '?' }
    ],
    fullText: 'How do I [task] using [technology]?'
  },
  'swap': {
    segments: [
      { id: '1', type: 'text', content: 'Swap ' },
      { id: '2', type: 'input-text', placeholder: 'amount', name: 'amount' },
      { id: '3', type: 'text', content: ' ' },
      { id: '4', type: 'token-picker', placeholder: 'from token', name: 'fromToken' },
      { id: '5', type: 'text', content: ' on ' },
      { id: '6', type: 'chain-picker', placeholder: 'network', name: 'fromNetwork' },
      { id: '7', type: 'text', content: ' for ' },
      { id: '8', type: 'token-picker', placeholder: 'to token', name: 'toToken' },
      { id: '9', type: 'text', content: ' on ' },
      { id: '10', type: 'chain-picker', placeholder: 'network', name: 'toNetwork' }
    ],
    fullText: 'Swap [amount] [from token] on [network] for [to token] on [network]'
  }
};

export async function POST(request: Request) {
  try {
    const { input } = await request.json();

    if (!input || typeof input !== 'string') {
      return NextResponse.json(
        { error: 'Invalid input' },
        { status: 400 }
      );
    }

    // Simple matching logic - in a real app, this would be more sophisticated
    const lowercaseInput = input.toLowerCase().trim();
    
    // Find the best matching pattern
    for (const [pattern, response] of Object.entries(mockAutocompleteData)) {
      if (lowercaseInput.startsWith(pattern)) {
        return NextResponse.json(response);
      }
    }

    // If no pattern matches, return empty response
    return NextResponse.json({
      segments: [],
      fullText: ''
    });

  } catch (error) {
    console.error('Autocomplete API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 