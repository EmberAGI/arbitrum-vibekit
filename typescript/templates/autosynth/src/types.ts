/**
 * TriggerX SDK Types
 * Based on the TriggerX SDK documentation
 */

export enum JobType {
  Time = 'time',
  Event = 'event',
  Condition = 'condition',
}

export enum ArgType {
  Static = 'static',
  Dynamic = 'dynamic',
}

export enum ScheduleType {
  Interval = 'interval',
  Cron = 'cron',
  Specific = 'specific',
}

export enum ConditionType {
  GreaterThan = 'greaterThan',
  LessThan = 'lessThan',
  Equal = 'equal',
}

export interface JobInput {
  // Common fields
  jobType: JobType;
  argType: ArgType;
  userAddress: string;
  etherBalance: number;
  tokenBalance: number;
  jobTitle: string;
  timeFrame: number;
  recurring: boolean;
  jobCostPrediction: number;
  timezone: string;
  createdChainId: string;
  targetChainId: string;
  targetContractAddress: string;
  targetFunction: string;
  abi: string;
  arguments: string[];
  dynamicArgumentsScriptUrl: string;
  isImua: boolean;
  language?: string;

  // Safe wallet fields
  walletMode?: 'regular' | 'safe';
  safeAddress?: string;

  // Time-based fields
  scheduleTypes?: ScheduleType[];
  timeInterval?: number;
  cronExpression?: string;
  specificSchedule?: string;

  // Event-based fields
  triggerChainId?: string;
  triggerContractAddress?: string;
  triggerEvent?: string;

  // Condition-based fields
  conditionType?: ConditionType;
  upperLimit?: number;
  lowerLimit?: number;
  valueSourceType?: string;
  valueSourceUrl?: string;
}

export interface JobData {
  id: string;
  jobInput: JobInput;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserData {
  address: string;
  jobCount: number;
  totalSpent: number;
  job_ids?: string[];
}

export interface CreateJobResult {
  success: boolean;
  jobId?: string;
  transactionHash?: string;
  error?: string;
}

export interface SafeWalletResult {
  success: boolean;
  safeAddress?: string;
  transactionHash?: string;
  error?: string;
}

export interface SafeWalletInfo {
  address: string;
  chainId: string;
  owners: string[];
  threshold: number;
  isModuleEnabled: boolean;
}
