# Mocked artificats

## Amount of USDai allocated for strategy schema
```js
z.object({
  amount: z.string() // Human readable amount
})
```

## Delegations artifact
```js
{
  artifactId: "delegations-to-sign",
  name: "delegations-to-sign.json",
  description: "Delegations that need to be signed to the user",
  parts: [
    {
      kind: "text",
      text: JSON.stringify({
        id: "delegation-id",
        delegation: {
            delegate: '0x691F0A67c78cbA21D2ae93e71203C29Eda812d5A',
            delegator: '0x33AdEF7FB0b26a59215BEC0CbC22b91d9d518c4F',
            authority: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
            caveats: [
              {
                enforcer: '0x7F20f61b1f09b08D970938F6fa563634d65c4EeB',
                terms: '0xce16F69375520ab01377ce7B88f5BA8C48F8D666',
                args: '0x'
              },
              {
                enforcer: '0x2c21fD0Cb9DC8445CB3fb0DC5E7Bb0Aca01842B5',
                terms: '0x58181a80',
                args: '0x'
              }
            ],
            salt: '0x',
            signature: '0x'
          }
      })
    } // Each delegation is a part of the artifact.
  ]
}
```

## User signed delegations input schema
Input schema for signing the delegations:
```js
z.object({
  delegations: z.array(z.object({
    id: z.string(),
    signedDelegation: z.any() // Whatever is the result of wallet.signDelegation
  }))
})
```

## Transaction executed artifact
```js
{
  artifactId: "transaction-executed",
  name: "transaction-executed.json",
  description: "A transaction was executed in behalf of the user",
  parts: [
    {
      kind: "text",
      text: JSON.stringify({
        transactionDescription: "Approved USDai to be used by pendle",
        receiptHash: "0xssnfhdsfnsdhfdsjf",
        delegationIdUsed: ["delegation-id"]
    }
  ]
}
```

