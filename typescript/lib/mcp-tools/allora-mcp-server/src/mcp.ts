import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { AlloraAPIClient } from '@alloralabs/allora-sdk'

export async function createServer(alloraClient: AlloraAPIClient) {
    const server = new McpServer({
        name: 'allora-mcp-server',
        version: '1.0.0'
    })

    //
    // Tool definitions
    //

    const GetAllTopicsSchema = z.object({})

    server.tool(
        'list_all_topics',
        'List the full set of predictions and inferences about the future that can be obtained, which will be provided by the Allora network',
        GetAllTopicsSchema.shape,
        async ({}) => {
            try {
                const topics = await alloraClient.getAllTopics()
                return {
                    content: [
                        {
                            type: 'text',
                            text: `${JSON.stringify(topics, null, 4)}`,
                        },
                    ],
                }
            } catch (error) {
                console.error(`list_all_topics: failed to fetch topics: ${(error as Error).message}`)
                throw new Error(`failed to fetch topics: ${(error as Error).message}`)
            }
        },
    )

    const GetInferenceByTopicIDSchema = z.object({
        topicID: z.number().int().describe('The topic ID to fetch inference for'),
    })

    server.tool(
        'get_inference_by_topic_id',
        'Fetch prediction/inference data for a specific Allora topic ID',
        GetInferenceByTopicIDSchema.shape,
        async ({ topicID }) => {
            try {
                const inference = await alloraClient.getInferenceByTopicID(topicID)
                return {
                    content: [
                        {
                            type: 'text',
                            text: `${JSON.stringify(inference, null, 4)}`,
                        },
                    ],
                }
            } catch (error) {
                throw new Error(`Failed to fetch inference for topic ${topicID}: ${(error as Error).message}`)
            }
        },
    )

    return server
}


