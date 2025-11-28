import { Policy, serializePermissionAccount, toPermissionValidator } from '@zerodev/permissions';
import { toECDSASigner } from '@zerodev/permissions/signers';
import {
  addressToEmptyAccount,
  createKernelAccount,
  KernelSmartAccountImplementation,
} from '@zerodev/sdk';
import { KERNEL_V2_VERSION_TYPE, KERNEL_V3_VERSION_TYPE, Signer } from '@zerodev/sdk/types';
import { getEntryPoint, KERNEL_V3_3 } from '@zerodev/sdk/constants';
import type { Hex, PublicClient } from 'viem';
import { EntryPointVersion, SmartAccount } from 'viem/account-abstraction';

export function getKernelConfig() {
  return {
    entryPoint: getEntryPoint('0.7'),
    kernelVersion: KERNEL_V3_3,
  };
}

export async function addPermissionsToSessionKey(
  sessionPublicKey: Hex,
  policy: Policy,
  account: Signer,
  publicClient: PublicClient,
  kernelVersion: KERNEL_V3_VERSION_TYPE | KERNEL_V2_VERSION_TYPE,
  entryPointVersion: EntryPointVersion,
) {
  const emptyAccount = addressToEmptyAccount(sessionPublicKey);
  const emptySessionKeySigner = await toECDSASigner({ signer: emptyAccount });
  const permissionPlugin = await toPermissionValidator(publicClient, {
    kernelVersion,
    entryPoint: getEntryPoint(entryPointVersion),
    signer: emptySessionKeySigner,
    policies: [policy],
  });
  const sessionKeyAccount = await createKernelAccount(publicClient, {
    kernelVersion,
    entryPoint: getEntryPoint(entryPointVersion),
    eip7702Account: account,
    plugins: {
      regular: permissionPlugin,
    },
  });
  const approval = await serializePermissionAccount(
    sessionKeyAccount as unknown as SmartAccount<KernelSmartAccountImplementation>,
  );
  return approval;
}
