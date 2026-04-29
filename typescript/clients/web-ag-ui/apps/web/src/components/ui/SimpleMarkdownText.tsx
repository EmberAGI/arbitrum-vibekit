import React from 'react';

export type SimpleMarkdownInlineNode =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'code';
      text: string;
    }
  | {
      type: 'strong' | 'em';
      children: SimpleMarkdownInlineNode[];
    };

type ParseResult = {
  nodes: SimpleMarkdownInlineNode[];
  index: number;
  closed: boolean;
};

function parseDelimited(
  source: string,
  startIndex: number,
  delimiter: string,
  type: 'strong' | 'em',
): { node: SimpleMarkdownInlineNode; nextIndex: number } | null {
  const parsed = parseSegments(source, startIndex + delimiter.length, delimiter);
  if (!parsed.closed) {
    return null;
  }

  return {
    node: {
      type,
      children: parsed.nodes,
    },
    nextIndex: parsed.index + delimiter.length,
  };
}

function parseSegments(source: string, startIndex: number, closingDelimiter?: string): ParseResult {
  const nodes: SimpleMarkdownInlineNode[] = [];
  let index = startIndex;

  while (index < source.length) {
    if (closingDelimiter && source.startsWith(closingDelimiter, index)) {
      return { nodes, index, closed: true };
    }

    if (source.startsWith('`', index)) {
      const closingIndex = source.indexOf('`', index + 1);
      if (closingIndex > index) {
        nodes.push({
          type: 'code',
          text: source.slice(index + 1, closingIndex),
        });
        index = closingIndex + 1;
        continue;
      }

      nodes.push({ type: 'text', text: '`' });
      index += 1;
      continue;
    }

    if (source.startsWith('**', index)) {
      const parsed = parseDelimited(source, index, '**', 'strong');
      if (parsed) {
        nodes.push(parsed.node);
        index = parsed.nextIndex;
        continue;
      }

      nodes.push({ type: 'text', text: '**' });
      index += 2;
      continue;
    }

    if (source.startsWith('*', index)) {
      const parsed = parseDelimited(source, index, '*', 'em');
      if (parsed) {
        nodes.push(parsed.node);
        index = parsed.nextIndex;
        continue;
      }

      nodes.push({ type: 'text', text: '*' });
      index += 1;
      continue;
    }

    const textStartIndex = index;
    while (
      index < source.length &&
      !source.startsWith('`', index) &&
      !source.startsWith('*', index) &&
      !(closingDelimiter && source.startsWith(closingDelimiter, index))
    ) {
      index += 1;
    }

    if (index > textStartIndex) {
      nodes.push({ type: 'text', text: source.slice(textStartIndex, index) });
    }
  }

  return { nodes, index, closed: false };
}

export function parseSimpleMarkdownInline(text: string): SimpleMarkdownInlineNode[] {
  return parseSegments(text, 0).nodes;
}

function renderNodes(nodes: SimpleMarkdownInlineNode[], keyPrefix: string): React.ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}:${index}`;

    if (node.type === 'text') {
      return <React.Fragment key={key}>{node.text}</React.Fragment>;
    }

    if (node.type === 'code') {
      return (
        <code
          key={key}
          className="rounded-[5px] bg-[#241813]/10 px-1 py-0.5 font-mono text-[0.92em] text-current"
        >
          {node.text}
        </code>
      );
    }

    if (node.type === 'strong') {
      return (
        <strong key={key} className="font-semibold text-current">
          {renderNodes(node.children, key)}
        </strong>
      );
    }

    return (
      <em key={key} className="italic text-current">
        {renderNodes(node.children, key)}
      </em>
    );
  });
}

export function SimpleMarkdownText(props: { text: string }): React.JSX.Element {
  return <>{renderNodes(parseSimpleMarkdownInline(props.text), 'md')}</>;
}
