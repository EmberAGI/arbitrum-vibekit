# NFT Plugin Core

Unified NFT plugin types, schemas, and registry for marketplace integrations (OpenSea, Magic Eden, ...).

## Exports

- Zod types: `NftPrimitive`, `GetAssetParams`, `GetListingsParams`, `GetOffersParams`, `ListParams`, `BuyParams`, `OfferParams`, `CancelOfferParams`, `TransferParams`, `WrapParams`, `UnwrapParams`, `BulkCancelParams`
- Registry: `registerNftPlugin(plugin)`, `getNftPlugin(id)`

## Usage

```ts
import { registerNftPlugin, getNftPlugin } from '@vibekit/onchain-actions-nft'

registerNftPlugin(myPlugin)
const plugin = getNftPlugin('opensea')
```
