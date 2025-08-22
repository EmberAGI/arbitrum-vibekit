-- Add agentId column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'AgentTransaction' AND column_name = 'agentId') THEN
        ALTER TABLE "AgentTransaction" ADD COLUMN "agentId" varchar(100) NOT NULL DEFAULT 'unknown';
    END IF;
END $$;