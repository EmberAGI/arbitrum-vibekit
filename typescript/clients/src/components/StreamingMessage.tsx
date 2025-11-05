"use client";

import { useEffect, useState, useRef } from "react";

interface StreamingMessageProps {
    content: string;
    isStreaming: boolean;
    sender: "user" | "agent" | "agent-progress" | "agent-error";
}

export function StreamingMessage({
    content,
    isStreaming,
    sender,
}: StreamingMessageProps) {
    const [displayedContent, setDisplayedContent] = useState("");
    const [words, setWords] = useState<string[]>([]);
    const currentIndexRef = useRef(0);
    const animationFrameRef = useRef<number | null>(null);

    useEffect(() => {
        // Split content into words
        const newWords = content.split(/(\s+)/);
        setWords(newWords);

        if (!isStreaming) {
            // If not streaming, show all content immediately
            setDisplayedContent(content);
            currentIndexRef.current = newWords.length;
            return;
        }

        // Start animation only if we have new words to show
        if (currentIndexRef.current < newWords.length) {
            const animate = () => {
                if (currentIndexRef.current < newWords.length) {
                    currentIndexRef.current++;
                    setDisplayedContent(newWords.slice(0, currentIndexRef.current).join(""));

                    // Schedule next frame with slight delay for smooth animation
                    animationFrameRef.current = window.setTimeout(() => {
                        requestAnimationFrame(animate);
                    }, 50); // 50ms delay between words
                }
            };

            requestAnimationFrame(animate);
        }

        return () => {
            if (animationFrameRef.current) {
                clearTimeout(animationFrameRef.current);
            }
        };
    }, [content, isStreaming]);

    const messageStyles = {
        user: "text-white",
        agent: "text-white",
        "agent-progress": "text-white",
        "agent-error": "text-red-200",
    };

    const backgroundStyles = {
        user: "#5B377D",
        agent: "#202020",
        "agent-progress": "#202020",
        "agent-error": "#202020",
    };

    return (
        <div
            className={`p-4 rounded-lg ${messageStyles[sender]} smooth-transition`}
            style={{ backgroundColor: backgroundStyles[sender] }}
        >
            <div className="whitespace-pre-wrap break-words smooth-transition">
                {displayedContent}
                {isStreaming && (
                    <span className="inline-block w-2 h-4 ml-1 bg-white animate-pulse" />
                )}
            </div>
        </div>
    );
}


