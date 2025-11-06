import type { PaymentPayload, PaymentRequirements } from 'x402/types';

type X402Scenario = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

const commonRequirementsBase = {
  scheme: 'exact',
  network: 'base-sepolia',
  description: 'Test',
  resource: 'https://example.test/resource',
  payTo: '0x850051af81DF37ae20e6Fe2De405be96DC4b3d1f',
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  mimeType: 'application/json',
  maxTimeoutSeconds: 3600,
  extra: {
    name: 'USDC',
    version: '2',
  },
} as const satisfies Omit<PaymentRequirements, 'maxAmountRequired'>;

export const verifySuccessScenario: X402Scenario = {
  paymentPayload: {
    x402Version: 1,
    scheme: 'exact',
    network: 'base-sepolia',
    payload: {
      signature:
        '0x47859970f51ec1a6791f398a3a552a6fa4bc570c6b7a6136f712a694e0e82f4723ce487033978b74a752586208bae83718835c1312751e4563e2176549e551481b',
      authorization: {
        from: '0x850051af81df37ae20e6fe2de405be96dc4b3d1f',
        to: '0x850051af81df37ae20e6fe2de405be96dc4b3d1f',
        value: '0',
        validAfter: '1762264367',
        validBefore: '1762268567',
        nonce: '0xb4957e077b07da13f9aa4a53cadb04cb425e79ecbd201ae62e7bb48659e159a7',
      },
    },
  },
  paymentRequirements: {
    ...commonRequirementsBase,
    maxAmountRequired: '0',
  },
};

export const verifyExpiredScenario: X402Scenario = {
  paymentPayload: {
    x402Version: 1,
    scheme: 'exact',
    network: 'base-sepolia',
    payload: {
      signature:
        '0xb9c56a423ad45bba6053a00b7920505416dc45efd210c1c579af4219c70026aa00f6c998e37809b8634d8e730d36494d9f73bf6e3a880bbf6e2b1513665b57e61c',
      authorization: {
        from: '0x850051af81df37ae20e6fe2de405be96dc4b3d1f',
        to: '0x850051af81df37ae20e6fe2de405be96dc4b3d1f',
        value: '0',
        validAfter: '1762264415',
        validBefore: '1762265005',
        nonce: '0xb4957e077b07da13f9aa4a53cadb04cb425e79ecbd201ae62e7bb48659e159a7',
      },
    },
  },
  paymentRequirements: {
    ...commonRequirementsBase,
    maxAmountRequired: '0',
  },
};

export const verifyInsufficientValueScenario: X402Scenario = {
  paymentPayload: {
    x402Version: 1,
    scheme: 'exact',
    network: 'base-sepolia',
    payload: {
      signature:
        '0x77f2788bb3046401d6e7441adf1956bfcc7de0c609916b35afaa860b180b77f72d442eb29af6f09cac00938cee9e65964482c34ad76e02a6827d91200ebcce7c1b',
      authorization: {
        from: '0x850051af81df37ae20e6fe2de405be96dc4b3d1f',
        to: '0x850051af81df37ae20e6fe2de405be96dc4b3d1f',
        value: '10',
        validAfter: '1762264467',
        validBefore: '1762268667',
        nonce: '0xeb70f954f2c35b9a7074a40be9a6dd6eb204b7812dfe7d12e00b567842a8d810',
      },
    },
  },
  paymentRequirements: {
    ...commonRequirementsBase,
    maxAmountRequired: '100',
  },
};

export const verifyInvalidRequirementsScenario: X402Scenario = {
  paymentPayload: {
    x402Version: 1,
    scheme: 'exact',
    network: 'base-sepolia',
    payload: {
      transaction: '0xdeadbeef',
    },
  },
  paymentRequirements: {
    scheme: 'exact',
    network: 'base-sepolia',
    description: 'Test',
    resource: 'https://example.test/resource',
    payTo: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    maxAmountRequired: '100',
    mimeType: 'application/json',
    maxTimeoutSeconds: 3600,
  },
};

export const verifyRequests = {
  success: {
    x402Version: 1,
    paymentPayload: verifySuccessScenario.paymentPayload,
    paymentRequirements: verifySuccessScenario.paymentRequirements,
  },
  expired: {
    x402Version: 1,
    paymentPayload: verifyExpiredScenario.paymentPayload,
    paymentRequirements: verifyExpiredScenario.paymentRequirements,
  },
  insufficientValue: {
    x402Version: 1,
    paymentPayload: verifyInsufficientValueScenario.paymentPayload,
    paymentRequirements: verifyInsufficientValueScenario.paymentRequirements,
  },
  invalidRequirements: {
    x402Version: 1,
    paymentPayload: verifyInvalidRequirementsScenario.paymentPayload,
    paymentRequirements: verifyInvalidRequirementsScenario.paymentRequirements,
  },
} as const;
