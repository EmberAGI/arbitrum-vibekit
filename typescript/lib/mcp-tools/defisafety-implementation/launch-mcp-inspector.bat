@echo off
echo Starting MCP Inspector for DeFiSafety Implementation...
echo.
echo Make sure you have set your OPENAI_API_KEY in the .env file!
echo.

cd /d "%~dp0"
echo Current directory: %CD%
echo.

if not exist "dist\index.js" (
    echo Building project first...
    call pnpm build
    if errorlevel 1 (
        echo Build failed! Please fix any compilation errors.
        pause
        exit /b 1
    )
)

echo Launching MCP Inspector...
echo.
echo Available tools:
echo - index_documentation: Scrape and index documentation from a website
echo - query_documentation: Query indexed documentation using natural language
echo - evaluate_defisafety_criteria: Evaluate against Q1-Q11 DeFiSafety criteria
echo - clear_index: Clear the entire documentation index
echo - list_indexed_urls: List all indexed URLs
echo.

npx @modelcontextprotocol/inspector dist/index.js

pause