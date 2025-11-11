'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Send } from "lucide-react";

interface InteractiveExampleProps {
    // Data from the agent
    title?: string;
    description?: string;
    requiresSignature?: boolean;
    transactionData?: any;
    awaitingInput?: boolean;

    // Callback for sending data back to the agent
    onUserAction?: (data: any) => Promise<void>;
}

/**
 * Example component demonstrating bidirectional communication with A2A stream
 * 
 * This component can:
 * 1. Receive data from the agent
 * 2. Display interactive UI requiring user action
 * 3. Send user responses back to the active task
 */
export function InteractiveExample({
    title = "Interactive Component",
    description = "This component demonstrates user interaction",
    requiresSignature = false,
    transactionData,
    awaitingInput = false,
    onUserAction
}: InteractiveExampleProps) {
    const [userInput, setUserInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [hasResponded, setHasResponded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSendResponse = async () => {
        if (!onUserAction) {
            console.error('[InteractiveExample] No onUserAction callback provided');
            setError('Cannot send response - no callback available');
            return;
        }

        if (!userInput.trim() && !requiresSignature) {
            setError('Please enter a response');
            return;
        }

        setIsSending(true);
        setError(null);

        try {
            const responseData = {
                componentType: 'interactive-example',
                userResponse: userInput,
                signature: requiresSignature ? 'mock-signature-' + Date.now() : undefined,
                transactionData: transactionData,
                timestamp: new Date().toISOString(),
            };

            console.log('[InteractiveExample] Sending response to agent:', responseData);

            await onUserAction(responseData);

            setHasResponded(true);
            console.log('[InteractiveExample] Response sent successfully');
        } catch (error) {
            console.error('[InteractiveExample] Failed to send response:', error);
            setError(error instanceof Error ? error.message : 'Failed to send response');
        } finally {
            setIsSending(false);
        }
    };

    const handleApprove = async () => {
        setUserInput('APPROVED');
        // Simulate a slight delay then send
        setTimeout(async () => {
            if (onUserAction) {
                setIsSending(true);
                try {
                    await onUserAction({
                        componentType: 'interactive-example',
                        action: 'approve',
                        signature: 'mock-signature-' + Date.now(),
                        transactionData,
                        timestamp: new Date().toISOString(),
                    });
                    setHasResponded(true);
                } catch (error) {
                    setError(error instanceof Error ? error.message : 'Failed to approve');
                } finally {
                    setIsSending(false);
                }
            }
        }, 100);
    };

    const handleReject = async () => {
        setUserInput('REJECTED');
        setTimeout(async () => {
            if (onUserAction) {
                setIsSending(true);
                try {
                    await onUserAction({
                        componentType: 'interactive-example',
                        action: 'reject',
                        timestamp: new Date().toISOString(),
                    });
                    setHasResponded(true);
                } catch (error) {
                    setError(error instanceof Error ? error.message : 'Failed to reject');
                } finally {
                    setIsSending(false);
                }
            }
        }, 100);
    };

    return (
        <Card className="w-full border-orange-500/20 bg-orange-500/5">
            <CardHeader>
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <CardTitle className="flex items-center gap-2">
                            {awaitingInput ? (
                                <AlertCircle className="w-5 h-5 text-orange-500 animate-pulse" />
                            ) : hasResponded ? (
                                <CheckCircle className="w-5 h-5 text-green-500" />
                            ) : null}
                            {title}
                        </CardTitle>
                        <CardDescription className="mt-1">
                            {description}
                        </CardDescription>
                    </div>
                    {awaitingInput && !hasResponded && (
                        <Badge variant="secondary" className="bg-orange-500/20 text-orange-400">
                            Action Required
                        </Badge>
                    )}
                    {hasResponded && (
                        <Badge variant="secondary" className="bg-green-500/20 text-green-400">
                            Completed
                        </Badge>
                    )}
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Display transaction data if available */}
                {transactionData && (
                    <div className="p-3 bg-gray-800 rounded-md">
                        <h4 className="text-sm font-medium text-gray-300 mb-2">Transaction Data:</h4>
                        <pre className="text-xs text-gray-400 overflow-x-auto">
                            {JSON.stringify(transactionData, null, 2)}
                        </pre>
                    </div>
                )}

                {/* Signature required flow */}
                {requiresSignature && !hasResponded && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 p-3 bg-orange-500/10 rounded-md border border-orange-500/20">
                            <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0" />
                            <p className="text-sm text-orange-300">
                                This transaction requires your signature to continue
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                onClick={handleApprove}
                                disabled={isSending || !onUserAction}
                                className="flex-1"
                                style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}
                            >
                                {isSending ? 'Signing...' : 'Approve & Sign'}
                            </Button>
                            <Button
                                onClick={handleReject}
                                disabled={isSending || !onUserAction}
                                variant="outline"
                                className="flex-1"
                            >
                                Reject
                            </Button>
                        </div>
                    </div>
                )}

                {/* Generic input flow */}
                {!requiresSignature && !hasResponded && (
                    <div className="space-y-3">
                        <Input
                            placeholder="Enter your response..."
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            disabled={isSending || !onUserAction}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !isSending) {
                                    handleSendResponse();
                                }
                            }}
                            style={{ backgroundColor: '#1a1a1a', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                        />
                        <Button
                            onClick={handleSendResponse}
                            disabled={isSending || !onUserAction || !userInput.trim()}
                            className="w-full"
                            style={{ backgroundColor: '#FD6731', borderColor: '#FD6731' }}
                        >
                            <Send className="w-4 h-4 mr-2" />
                            {isSending ? 'Sending...' : 'Send Response'}
                        </Button>
                    </div>
                )}

                {/* Success state */}
                {hasResponded && (
                    <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-md border border-green-500/20">
                        <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                        <p className="text-sm text-green-300">
                            Response sent to agent. The task will continue automatically.
                        </p>
                    </div>
                )}

                {/* Error state */}
                {error && (
                    <div className="flex items-center gap-2 p-3 bg-red-500/10 rounded-md border border-red-500/20">
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <p className="text-sm text-red-300">{error}</p>
                    </div>
                )}

                {/* No callback warning */}
                {!onUserAction && (
                    <div className="flex items-center gap-2 p-3 bg-yellow-500/10 rounded-md border border-yellow-500/20">
                        <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                        <p className="text-xs text-yellow-300">
                            Note: No callback provided. This component cannot send responses.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

