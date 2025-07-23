'use client';

import type { BaseAgentSidepanelProps } from './types';

interface HelloWorldSidepanelProps extends BaseAgentSidepanelProps {
    message?: string;
}

export function HelloWorldSidepanel({
    txPreview,
    txPlan,
    toolInvocationResult,
    selectedAgentId,
    isReadonly,
    message = "Hello from the Lending Agent!",
}: HelloWorldSidepanelProps) {
    return (
        <div className="p-6 h-full flex flex-col gap-4">
            <div className="border-b pb-4">
                <h1 className="text-2xl font-bold text-primary">Hello World Sidepanel</h1>
                <p className="text-muted-foreground">A dynamic agent sidepanel example</p>
            </div>

            <div className="flex-1 space-y-4">
                <div className="bg-muted/50 rounded-lg p-4">
                    <h2 className="font-semibold mb-2">Agent Information</h2>
                    <p><strong>Selected Agent:</strong> {selectedAgentId || 'None'}</p>
                    <p><strong>Is Readonly:</strong> {isReadonly ? 'Yes' : 'No'}</p>
                    <p><strong>Message:</strong> {message}</p>
                </div>

                {txPlan && (
                    <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4">
                        <h3 className="font-semibold mb-2">Transaction Plan</h3>
                        <pre className="text-sm overflow-auto bg-background p-2 rounded">
                            {JSON.stringify(txPlan, null, 2)}
                        </pre>
                    </div>
                )}

                {txPreview && (
                    <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-4">
                        <h3 className="font-semibold mb-2">Transaction Preview</h3>
                        <pre className="text-sm overflow-auto bg-background p-2 rounded">
                            {JSON.stringify(txPreview, null, 2)}
                        </pre>
                    </div>
                )}

                {toolInvocationResult && (
                    <div className="bg-yellow-50 dark:bg-yellow-950/20 rounded-lg p-4">
                        <h3 className="font-semibold mb-2">Tool Invocation Result</h3>
                        <pre className="text-sm overflow-auto bg-background p-2 rounded max-h-40">
                            {JSON.stringify(toolInvocationResult, null, 2)}
                        </pre>
                    </div>
                )}

                <div className="bg-purple-50 dark:bg-purple-950/20 rounded-lg p-4">
                    <h3 className="font-semibold mb-2">Dynamic Features</h3>
                    <ul className="text-sm space-y-1">
                        <li>✓ Triggered automatically when lending agent is selected</li>
                        <li>✓ Receives all tool invocation data</li>
                        <li>✓ Supports custom prop extraction</li>
                        <li>✓ Can be configured for any trigger mode</li>
                        <li>✓ Fully dynamic and configurable</li>
                    </ul>
                </div>
            </div>

            <div className="border-t pt-4 text-center text-sm text-muted-foreground">
                This sidepanel was dynamically loaded based on agent configuration
            </div>
        </div>
    );
} 