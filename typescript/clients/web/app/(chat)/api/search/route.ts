import { NextRequest, NextResponse } from 'next/server';

interface CoinSearchResult {
  id: string;
  image: string;
  name: string;
  symbol: string;
}

// CoinGecko search endpoint using their official public API
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query');
    
    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    // Use CoinGecko's official public API instead of the widget endpoint
    const response = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
      },
      // Add timeout using AbortController
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return NextResponse.json(
        { 
          error: 'External API error',
          status: response.status,
          message: response.statusText
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Transform the response to match the original widget format
    const coins = data.coins || [];
    const transformedCoins: CoinSearchResult[] = coins.slice(0, 25).map((coin: any) => ({
      id: coin.id,
      image: coin.large || coin.thumb,
      name: coin.name,
      symbol: coin.symbol.toUpperCase()
    }));

    return NextResponse.json(transformedCoins);

  } catch (error) {
    console.error('Search error:', error);
    
    if (error instanceof Error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        return NextResponse.json(
          {
            error: 'Service unavailable',
            message: 'Request timeout - CoinGecko API is taking too long to respond'
          },
          { status: 503 }
        );
      }
      
      return NextResponse.json(
        {
          error: 'Internal server error',
          message: error.message
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      {
        error: 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

// Health check for the search endpoint
export async function HEAD() {
  return new NextResponse(null, { 
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    }
  });
}
