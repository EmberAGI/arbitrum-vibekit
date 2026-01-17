
const { ethers } = require('ethers');

const RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// The separator retrieved from the previous script run
const ACTUAL_SEPARATOR = '0x294369e003769a2d4d625e8a9ebebffa09ff70dd7c708497d8b56d2c2d199a19';

async function main() {
  console.log('Target DOMAIN_SEPARATOR:', ACTUAL_SEPARATOR);
  console.log('Brute forcing parameters...\n');

  const chains = [137];
  const versions = ["1", "2", "1.0", ""]; // Empty string means no version? Or maybe undefined
  const names = ["USD Coin (PoS)", "USD Coin", "USDC", "USDC.e", "Center Coin"];

  // Test Case 1: Standard fields
  for (const name of names) {
    for (const version of versions) {
        for (const chainId of chains) {
            try {
                const domain = {
                    name,
                    version,
                    chainId,
                    verifyingContract: USDC_ADDRESS
                };
                // If version is empty string, maybe try without version field at all
                if (version === "") delete domain.version;

                const hash = ethers.TypedDataEncoder.hashDomain(domain);

                if (hash === ACTUAL_SEPARATOR) {
                    console.log('✅ MATCH FOUND!');
                    console.log('Domain:', domain);
                    return;
                } else {
                    // console.log(`Tested: ${name} v${version} -> ${hash}`);
                }
            } catch (e) {}
        }
    }
  }

  // Test Case 2: SALT instead of ChainId
  console.log('Testing with Salt...');
  const salts = [
      ethers.zeroPadValue(ethers.toBeHex(137), 32),
      '0x0000000000000000000000000000000000000000000000000000000000000089', // 137 hex
  ];

  for (const name of names) {
      for (const version of versions) {
          for (const salt of salts) {
              const domain = {
                  name,
                  version,
                  salt,
                  verifyingContract: USDC_ADDRESS
              };
               if (version === "") delete domain.version;

              const hash = ethers.TypedDataEncoder.hashDomain(domain);
              if (hash === ACTUAL_SEPARATOR) {
                  console.log('✅ MATCH FOUND WITH SALT!');
                  console.log('Domain:', domain);
                  return;
              }
          }
      }
  }

  // Test Case 3: No Version Field (explicitly)
  console.log('Testing without Version field...');
  for (const name of names) {
      const domain = {
          name,
          chainId: 137,
          verifyingContract: USDC_ADDRESS
      };

      const hash = ethers.TypedDataEncoder.hashDomain(domain);
      if (hash === ACTUAL_SEPARATOR) {
          console.log('✅ MATCH FOUND (No Version)!');
          console.log('Domain:', domain);
          return;
      }
  }

  console.log('❌ No match found.');
}

main();
