import { Artifact } from '@/components/create-artifact';
import { CopyIcon, SparklesIcon } from '@/components/icons';
import { toast } from 'sonner';
import { HelloWorldSidepanel } from './hello-world-sidepanel';

interface HelloWorldMetadata {
    lastUpdated: Date;
    customData?: any;
}

export const helloWorldArtifact = new Artifact<'hello-world', HelloWorldMetadata>({
    kind: 'hello-world',
    description: 'Hello World agent sidepanel for demonstration',
    initialize: async ({ setMetadata }) => {
        setMetadata({
            lastUpdated: new Date(),
            customData: null,
        });
    },
    onStreamPart: ({ streamPart, setArtifact }) => {
        // Handle streaming updates if needed - for now just basic handling
        setArtifact((draftArtifact) => ({
            ...draftArtifact,
            status: 'streaming',
        }));
    },
    content: ({
        metadata,
        setMetadata,
        content
    }) => {
        // Extract props from content (which will contain our sidepanel data)
        let sidepanelProps = {};
        try {
            sidepanelProps = content ? JSON.parse(content) : {};
        } catch (e) {
            sidepanelProps = {};
        }

        return (
            <HelloWorldSidepanel
                {...sidepanelProps}
            />
        );
    },
    actions: [
        {
            icon: <SparklesIcon size={18} />,
            description: 'Refresh sidepanel data',
            onClick: ({ setMetadata, metadata }) => {
                setMetadata({
                    ...metadata,
                    lastUpdated: new Date(),
                });
                toast.success('Sidepanel refreshed!');
            },
        },
        {
            icon: <CopyIcon size={18} />,
            description: 'Copy agent data',
            onClick: ({ content }) => {
                navigator.clipboard.writeText(content || 'No data available');
                toast.success('Agent data copied to clipboard!');
            },
        },
    ],
    toolbar: [
        // Add toolbar items if needed
    ],
}); 