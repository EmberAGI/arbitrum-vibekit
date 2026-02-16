import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Pagination } from './Pagination';

function getPaginationButtons(props: React.ComponentProps<typeof Pagination>) {
  const tree = Pagination(props);
  const controls = (tree.props.children as React.ReactNode[])[1] as React.ReactElement<{
    children: React.ReactNode[];
  }>;
  return controls.props.children as React.ReactElement<
    HTMLButtonElement & { onClick: () => void; disabled: boolean }
  >[];
}

describe('Pagination', () => {
  it('renders pagination controls and current page text', () => {
    const html = renderToStaticMarkup(
      React.createElement(Pagination, {
        currentPage: 2,
        totalPages: 5,
        onPageChange: () => {},
      }),
    );

    expect(html).toContain('Page 2 of 5');
    expect(html).toContain('aria-label="First page"');
    expect(html).toContain('aria-label="Previous page"');
    expect(html).toContain('aria-label="Next page"');
    expect(html).toContain('aria-label="Last page"');
  });

  it('enforces first-page boundaries for first and previous controls', () => {
    const onPageChange = vi.fn();
    const [firstPageButton, previousPageButton, nextPageButton, lastPageButton] = getPaginationButtons({
      currentPage: 1,
      totalPages: 5,
      onPageChange,
    });

    expect(firstPageButton.props.disabled).toBe(true);
    expect(previousPageButton.props.disabled).toBe(true);
    expect(nextPageButton.props.disabled).toBe(false);
    expect(lastPageButton.props.disabled).toBe(false);

    firstPageButton.props.onClick();
    previousPageButton.props.onClick();
    nextPageButton.props.onClick();
    lastPageButton.props.onClick();

    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(3, 2);
    expect(onPageChange).toHaveBeenNthCalledWith(4, 5);
  });

  it('enforces last-page boundaries for next and last controls', () => {
    const onPageChange = vi.fn();
    const [firstPageButton, previousPageButton, nextPageButton, lastPageButton] = getPaginationButtons({
      currentPage: 5,
      totalPages: 5,
      onPageChange,
    });

    expect(firstPageButton.props.disabled).toBe(false);
    expect(previousPageButton.props.disabled).toBe(false);
    expect(nextPageButton.props.disabled).toBe(true);
    expect(lastPageButton.props.disabled).toBe(true);

    firstPageButton.props.onClick();
    previousPageButton.props.onClick();
    nextPageButton.props.onClick();
    lastPageButton.props.onClick();

    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 4);
    expect(onPageChange).toHaveBeenNthCalledWith(3, 5);
    expect(onPageChange).toHaveBeenNthCalledWith(4, 5);
  });
});
