import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WalletContentsWorkbench } from './WalletContentsWorkbench';

describe('WalletContentsWorkbench', () => {
  it('renders wallet contents USD values with two decimal places', () => {
    const html = renderToStaticMarkup(
      React.createElement(WalletContentsWorkbench, {
        view: {
          summary: {
            grossExposureUsd: 1_259.345,
            walletUsd: 123.4,
            deployedUsd: 1_135.945,
            owedUsd: 12,
            unpricedLaneCount: 0,
          },
          compositionSegments: [
            {
              label: 'In wallet',
              valueUsd: 123.4,
              share: 0.1,
              colorHex: '#4DD999',
            },
            {
              label: 'Deployed',
              valueUsd: 1_135.945,
              share: 0.9,
              colorHex: '#178B5D',
            },
          ],
          families: [
            {
              id: 'family:usdc',
              label: 'USDC',
              walletUsd: 123.4,
              deployedUsd: 1_135.945,
              owedUsd: 12,
              positiveUsd: 1_259.345,
              grossExposureUsd: 1_271.345,
              share: 1,
              lines: [
                {
                  id: 'line:wallet',
                  label: 'Wallet USDC',
                  tone: 'wallet',
                  valueUsd: 123.4,
                },
              ],
            },
          ],
          featuredFamilies: [
            {
              id: 'family:usdc',
              label: 'USDC',
              walletUsd: 123.4,
              deployedUsd: 1_135.945,
              owedUsd: 12,
              positiveUsd: 1_259.345,
              grossExposureUsd: 1_271.345,
              share: 1,
              lines: [
                {
                  id: 'line:wallet',
                  label: 'Wallet USDC',
                  tone: 'wallet',
                  valueUsd: 123.4,
                },
              ],
            },
          ],
          tailFamilies: [],
        },
      }),
    );

    expect(html).toContain('$123.40');
    expect(html).toContain('$1,135.95');
    expect(html).toContain('$12.00');
    expect(html).not.toContain('>$123<');
    expect(html).not.toContain('$1.1k');
  });
});
