pnpm exec tsx --env-file=.env \
  scripts/execute-pregen-transaction.ts \
  "pancaroba1@test.getpara.com" \
  "https://sepolia.base.org" \
  '{"to":"0x036CbD53842c5426634e7929541eC2318f3dCF7e","value":"0","data":"0xa9059cbb00000000000000000000000056fc1d0a9105e470988e25791e267a706276730900000000000000000000000000000000000000000000000000000000000f4240","chainId":"84532"}'